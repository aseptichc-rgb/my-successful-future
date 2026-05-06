/**
 * 카드 미션에 적은 한 줄 응답 저장.
 *
 * 정책 (1카드 1응답, 수정만 허용 / 카운트 1회만 증가):
 *   - dailyMotivations/{ymd}.response 가 비어있으면 → 첫 응답:
 *       (a) response 작성, (b) identityProgress/{identityTag}.count += 1,
 *       (c) recentResponses 슬라이딩(최근 5).
 *   - 이미 response 가 있으면 → 수정:
 *       response.text 업데이트만, 카운터·recentResponses 는 건드리지 않음.
 *       identityProgress.recentResponses 의 첫 항목도 수정하지 않음 — 동일 라벨일 때
 *       최신성을 유지하려는 충동을 의도적으로 차단(데이터 신뢰도 우선).
 *
 * 보안: 클라이언트 직접 write 는 firestore.rules 에서 차단되어 있고, 이 함수는
 * Admin SDK 트랜잭션으로만 동작. 호출자는 verifyRequestUser 로 본인 uid 임을 확인할 것.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type { DailyMotivation } from "@/types";

const RESPONSE_MAX_LEN = 60;
const RESPONSE_MIN_LEN = 1;
const RECENT_RESPONSES_KEEP = 5;

export class MissionResponseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "MissionResponseError";
  }
}

/** Firestore 문서 ID 로 안전한 형태로 라벨을 정리. "/" 와 ".." 만 회피. */
function identityDocId(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new MissionResponseError(500, "빈 정체성 라벨입니다.");
  return trimmed.replace(/\//g, "_").replace(/\.\.+/g, "_").slice(0, 100);
}

export interface SavedResponse {
  text: string;
  isFirst: boolean;
  identityTag: string;
}

/**
 * 응답 저장. text 검증 + 카드 존재 + mission.identityTag 확인 + 트랜잭션 갱신을 원자적으로 처리.
 * 호출 전에 `enforceQuota(uid, "missionResponse")` 로 한도 체크할 것.
 */
export async function saveMissionResponse(opts: {
  uid: string;
  ymd: string;
  text: string;
}): Promise<SavedResponse> {
  const { uid, ymd } = opts;
  const text = opts.text.trim().slice(0, RESPONSE_MAX_LEN);
  if (text.length < RESPONSE_MIN_LEN) {
    throw new MissionResponseError(400, "응답을 한 줄 적어 주세요.");
  }

  const db = getAdminDb();
  const motivationRef = db.doc(`users/${uid}/dailyMotivations/${ymd}`);

  return await db.runTransaction(async (tx) => {
    const motSnap = await tx.get(motivationRef);
    if (!motSnap.exists) {
      throw new MissionResponseError(404, "오늘의 카드를 찾지 못했어요. 새로고침 후 다시 시도해주세요.");
    }
    const motivation = motSnap.data() as DailyMotivation;
    const identityTag = motivation.mission?.identityTag;
    if (!identityTag) {
      throw new MissionResponseError(409, "이 카드에는 미션이 없어 응답을 받지 못해요.");
    }

    const isFirst = !motivation.response;
    const prevEdits = motivation.response?.edits ?? 0;

    tx.update(motivationRef, {
      "response.text": text,
      "response.respondedAt": Timestamp.now(),
      "response.edits": isFirst ? 0 : prevEdits + 1,
    });

    if (isFirst) {
      const progressRef = db.doc(
        `users/${uid}/identityProgress/${identityDocId(identityTag)}`,
      );
      const progSnap = await tx.get(progressRef);
      if (progSnap.exists) {
        const prevRecent = progSnap.get("recentResponses");
        const recentArr: string[] = Array.isArray(prevRecent)
          ? (prevRecent as unknown[]).filter((v): v is string => typeof v === "string")
          : [];
        const nextRecent = [text, ...recentArr].slice(0, RECENT_RESPONSES_KEEP);
        tx.update(progressRef, {
          identityTag,
          count: FieldValue.increment(1),
          lastRespondedAt: Timestamp.now(),
          recentResponses: nextRecent,
        });
      } else {
        tx.set(progressRef, {
          identityTag,
          count: 1,
          lastRespondedAt: Timestamp.now(),
          recentResponses: [text],
        });
      }
    }

    return { text, isFirst, identityTag };
  });
}
