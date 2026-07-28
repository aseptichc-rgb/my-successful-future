/**
 * 정체성 증거 적립 — "나는 ~한 사람이다"에 대한 행동 기반 투표.
 *
 * 정책 (하루 카테고리당 최대 1표, LLM 호출 없음):
 *   - checkin(오늘): 다짐 따라쓰기 체크인 성공 1건 = 1표. 라벨은 결정론적 회전
 *     (labels[fnv1a(uid|ymd|checkin) % n]) — 의미 매핑을 가장하지 않고 풀 전체에
 *     증거를 고르게 분산한다. 유일성은 affirmationLogs/{ymd} 미존재 가드가 보장.
 *   - deep(오늘): 그 체크인이 전량 전사(depth="full")였다면 보너스 1표. 필수치는
 *     1줄로 낮추되 더 깊이 한 노력에는 눈에 보이는 보상을 붙인다(선택 행동의 강화).
 *   - goal(어제): 어제 달성한 목표가 1개 이상이면 1표. 라벨은 그 목표와 trim-일치하는
 *     ExecutionPlan.identityTag 우선, 없으면 회전 폴백.
 *   - win(어제): 어제 "잘한 일"이 1칸 이상 기록됐으면 1표. 라벨은 회전.
 *
 * 중복 방지: 어제분 goal/win 은 identityEvidence/{어제}.reconciled 플래그로 가드.
 *   ⚠️ 문서 "존재 여부"로 가드하면 안 됨 — 어제의 체크인이 이미 checkin 엔트리로
 *   문서를 만들어 두었을 수 있다(그 경우 entries 를 보존하며 append 한다).
 *
 * 트레이드오프(문서화): 체크인하지 않은 날은 그 전날의 goal/win 이 영구 미적립된다.
 *   체크인이 이 앱의 하루 앵커이고, 트랜잭션 밖 적립은 이중 카운트 위험이 있어 수용.
 *
 * 보안: identityProgress/identityEvidence 모두 클라이언트 write 가 firestore.rules 에서
 *   차단되어 있고, 이 모듈은 체크인 트랜잭션(Admin SDK) 안에서만 호출된다.
 *
 * 데이터 신뢰: identityProgress.recentResponses / lastRespondedAt 은 미션 응답 전용 —
 *   여기서는 절대 건드리지 않는다(lib/missionResponse.ts 의 원칙 준수).
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Transaction } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { yesterdayKstYmd } from "@/lib/kstDate";
import { fnv1a } from "@/lib/planRotation";
import type { IdentityEvidenceEntry } from "@/types";

/** 하루에 적립 가능한 최대 표 수 — checkin + deep + goal + win 카테고리당 1표. */
export const MAX_EVIDENCE_VOTES_PER_DAY = 4;
/** 증거 피드(detail)에 남기는 근거 텍스트 최대 길이. */
const EVIDENCE_DETAIL_MAX = 40;

type EvidenceSource = IdentityEvidenceEntry["source"];

/** Firestore 문서 ID 로 안전한 라벨 정리 — lib/missionResponse.ts identityDocId 와 동일 규칙. */
function identityDocId(label: string): string {
  const trimmed = label.trim();
  return trimmed.replace(/\//g, "_").replace(/\.\.+/g, "_").slice(0, 100);
}

function truncateDetail(s: string): string {
  const trimmed = s.trim();
  return trimmed.length > EVIDENCE_DETAIL_MAX
    ? `${trimmed.slice(0, EVIDENCE_DETAIL_MAX).trimEnd()}…`
    : trimmed;
}

/** 결정론적 회전 — 같은 (uid, ymd, source) 면 항상 같은 라벨. */
function rotateLabel(labels: string[], uid: string, ymd: string, source: EvidenceSource): string {
  return labels[fnv1a(`${uid}|${ymd}|${source}`) % labels.length];
}

/** prepare 단계에서 모은, 쓰기 단계에 필요한 모든 데이터. */
export interface PreparedEvidence {
  uid: string;
  ymd: string;
  yesterdayYmd: string;
  /** 오늘 checkin 1표. */
  checkinEntry: IdentityEvidenceEntry;
  /** 오늘 deep 보너스 1표 (전량 전사 체크인일 때만, 아니면 null). */
  deepEntry: IdentityEvidenceEntry | null;
  /** 어제분 goal/win 표 (reconciled 가드 통과분만, 없으면 빈 배열). */
  yesterdayEntries: IdentityEvidenceEntry[];
  /** 어제 evidence 문서에 이미 있던 entries (append 시 보존용). */
  yesterdayExistingEntries: IdentityEvidenceEntry[];
  /** 어제 evidence 문서 존재 여부 (update vs set 분기). */
  yesterdayDocExists: boolean;
  /**
   * 오늘 evidence 문서에 이미 있던 entries + 존재 여부.
   * 위젯 qDate 딥링크로 과거 날짜 체크인이 가능해, "오늘" 문서가 다음 날 체크인의
   * 정산으로 이미 존재할 수 있다 — set 으로 덮어쓰면 goal/win 엔트리가 유실되므로
   * 반드시 append 한다.
   */
  todayExistingEntries: IdentityEvidenceEntry[];
  todayDocExists: boolean;
  /** 어제분을 이번에 정산해야 하는지 (아직 reconciled 마커가 없을 때). */
  shouldReconcileYesterday: boolean;
  /** 갱신할 identityProgress 문서별 증가량 집계 (docId → 라벨/총합/출처별). */
  progress: Map<
    string,
    { identityTag: string; total: number; bySource: Partial<Record<EvidenceSource, number>>; exists: boolean }
  >;
}

/**
 * 읽기 단계 — 체크인 트랜잭션의 "모든 읽기는 모든 쓰기보다 앞서야 한다" 규칙에 맞춰,
 * 쓰기 전에 호출해 필요한 문서를 전부 읽어 둔다. labels 가 비면 null(전체 스킵).
 */
export async function prepareEvidence(
  tx: Transaction,
  opts: {
    uid: string;
    ymd: string;
    labels: string[];
    /** true = 이번 체크인이 전량 전사(depth="full") — deep 보너스 1표를 함께 적립한다. */
    deep?: boolean;
  },
): Promise<PreparedEvidence | null> {
  const { uid, ymd } = opts;
  const labels = opts.labels
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (labels.length === 0) return null;

  const db = getAdminDb();
  const yesterday = yesterdayKstYmd(ymd);

  // ── 어제의 행동 + 어제/오늘 장부 + 실행설계(goal→라벨 매핑) 읽기 ──
  const [entrySnap, evidenceSnap, todayEvidenceSnap, plansSnap] = await Promise.all([
    tx.get(db.doc(`users/${uid}/dailyEntries/${yesterday}`)),
    tx.get(db.doc(`users/${uid}/identityEvidence/${yesterday}`)),
    tx.get(db.doc(`users/${uid}/identityEvidence/${ymd}`)),
    tx.get(db.collection(`users/${uid}/executionPlans`)),
  ]);

  const checkinEntry: IdentityEvidenceEntry = {
    identityTag: rotateLabel(labels, uid, ymd, "checkin"),
    source: "checkin",
  };
  const deepEntry: IdentityEvidenceEntry | null = opts.deep
    ? { identityTag: rotateLabel(labels, uid, ymd, "deep"), source: "deep" }
    : null;

  // ── 어제분 goal/win 표 계산 (reconciled 가드) ──
  const alreadyReconciled = evidenceSnap.exists && evidenceSnap.get("reconciled") === true;
  const yesterdayEntries: IdentityEvidenceEntry[] = [];
  if (!alreadyReconciled && entrySnap.exists) {
    const data = entrySnap.data() ?? {};
    const achievedGoals = (Array.isArray(data.achievedGoals) ? data.achievedGoals : [])
      .map((g: unknown) => (typeof g === "string" ? g.trim() : ""))
      .filter((g: string) => g.length > 0);
    const wins = (Array.isArray(data.wins) ? data.wins : [])
      .map((w: unknown) => (typeof w === "string" ? w.trim() : ""))
      .filter((w: string) => w.length > 0);

    if (achievedGoals.length > 0) {
      // 달성 목표와 trim-일치하는 플랜의 identityTag 우선 — 없으면 회전 폴백.
      let goalLabel: string | null = null;
      let matchedGoal: string = achievedGoals[0];
      for (const planDoc of plansSnap.docs) {
        const plan = planDoc.data() ?? {};
        const planGoal = typeof plan.goal === "string" ? plan.goal.trim() : "";
        const planTag = typeof plan.identityTag === "string" ? plan.identityTag.trim() : "";
        if (planGoal && planTag && labels.includes(planTag) && achievedGoals.includes(planGoal)) {
          goalLabel = planTag;
          matchedGoal = planGoal;
          break;
        }
      }
      yesterdayEntries.push({
        identityTag: goalLabel ?? rotateLabel(labels, uid, yesterday, "goal"),
        source: "goal",
        detail: truncateDetail(matchedGoal),
      });
    }
    if (wins.length > 0) {
      yesterdayEntries.push({
        identityTag: rotateLabel(labels, uid, yesterday, "win"),
        source: "win",
        detail: truncateDetail(wins[0]),
      });
    }
  }

  const readEntries = (snap: { exists: boolean; get: (f: string) => unknown }): IdentityEvidenceEntry[] =>
    snap.exists
      ? ((snap.get("entries") as IdentityEvidenceEntry[] | undefined) ?? []).filter(
          (e): e is IdentityEvidenceEntry => Boolean(e && typeof e.identityTag === "string"),
        )
      : [];
  const yesterdayExistingEntries = readEntries(evidenceSnap);
  const todayExistingEntries = readEntries(todayEvidenceSnap);

  // ── 갱신 대상 identityProgress 문서 집계 후 읽기 ──
  const progress: PreparedEvidence["progress"] = new Map();
  for (const entry of [checkinEntry, ...(deepEntry ? [deepEntry] : []), ...yesterdayEntries]) {
    const docId = identityDocId(entry.identityTag);
    if (!docId) continue;
    const agg = progress.get(docId) ?? {
      identityTag: entry.identityTag,
      total: 0,
      bySource: {},
      exists: false,
    };
    agg.total += 1;
    agg.bySource[entry.source] = (agg.bySource[entry.source] ?? 0) + 1;
    progress.set(docId, agg);
  }
  const progressIds = Array.from(progress.keys());
  const progressSnaps = await Promise.all(
    progressIds.map((id) => tx.get(db.doc(`users/${uid}/identityProgress/${id}`))),
  );
  progressSnaps.forEach((snap, i) => {
    const agg = progress.get(progressIds[i]);
    if (agg) agg.exists = snap.exists;
  });

  return {
    uid,
    ymd,
    yesterdayYmd: yesterday,
    checkinEntry,
    deepEntry,
    yesterdayEntries,
    yesterdayExistingEntries,
    yesterdayDocExists: evidenceSnap.exists,
    todayExistingEntries,
    todayDocExists: todayEvidenceSnap.exists,
    shouldReconcileYesterday: !alreadyReconciled,
    progress,
  };
}

/**
 * 쓰기 단계 — prepareEvidence 의 결과로 장부/카운터를 갱신한다.
 * 반드시 트랜잭션의 다른 모든 읽기가 끝난 뒤 호출할 것.
 */
export function applyEvidence(tx: Transaction, prepared: PreparedEvidence): void {
  const { uid, ymd, yesterdayYmd } = prepared;
  const db = getAdminDb();
  const now = Timestamp.now();

  // 오늘 장부 — 보통은 신규 생성이지만, qDate 딥링크로 과거 날짜를 체크인하는 경우
  // 다음 날의 정산이 이미 문서를 만들어 두었을 수 있다 → 기존 entries 를 보존하며 append.
  const todayNewEntries = [
    prepared.checkinEntry,
    ...(prepared.deepEntry ? [prepared.deepEntry] : []),
  ];
  const todayRef = db.doc(`users/${uid}/identityEvidence/${ymd}`);
  if (prepared.todayDocExists) {
    tx.update(todayRef, {
      entries: [...prepared.todayExistingEntries, ...todayNewEntries],
    });
  } else {
    tx.set(todayRef, {
      ymd,
      entries: todayNewEntries,
      createdAt: now,
    });
  }

  // 어제 장부 — 표가 있든 없든 reconciled 마커를 세워 재평가를 끝낸다.
  //  (표가 없고 문서도 없으면 빈 문서를 만들 필요는 없어 스킵.)
  if (prepared.shouldReconcileYesterday) {
    const yesterdayRef = db.doc(`users/${uid}/identityEvidence/${yesterdayYmd}`);
    if (prepared.yesterdayDocExists) {
      tx.update(yesterdayRef, {
        entries: [...prepared.yesterdayExistingEntries, ...prepared.yesterdayEntries],
        reconciled: true,
      });
    } else if (prepared.yesterdayEntries.length > 0) {
      tx.set(yesterdayRef, {
        ymd: yesterdayYmd,
        entries: prepared.yesterdayEntries,
        reconciled: true,
        createdAt: now,
      });
    }
  }

  // 카운터 — recentResponses / lastRespondedAt 은 미션 전용이므로 건드리지 않는다.
  for (const [docId, agg] of prepared.progress) {
    const ref = db.doc(`users/${uid}/identityProgress/${docId}`);
    if (agg.exists) {
      const update: Record<string, unknown> = {
        identityTag: agg.identityTag,
        count: FieldValue.increment(agg.total),
        lastEvidenceAt: now,
      };
      for (const [source, n] of Object.entries(agg.bySource)) {
        update[`sourceCounts.${source}`] = FieldValue.increment(n);
      }
      tx.update(ref, update);
    } else {
      tx.set(ref, {
        identityTag: agg.identityTag,
        count: agg.total,
        recentResponses: [],
        sourceCounts: agg.bySource,
        lastEvidenceAt: now,
      });
    }
  }
}
