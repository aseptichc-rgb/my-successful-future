/**
 * GET /api/admin/stats
 *
 * 어드민 페이지(/admin) 용 집계 API.
 * - 가입자 수 (총·최근 7일·최근 30일)
 * - 제품 이벤트 이름별 7일/30일 건수·고유 사용자 (lib/constants/events)
 * - D1/D7 리텐션 (최근 30일 가입자 × app_open, lib/retention)
 * - 최근 피드백 20건 (/api/feedback)
 * - 토큰 사용량 / 비용 (provider·model 별)
 * - 사용자 상위 10명 (총비용 기준)
 *
 * 인증: Authorization: Bearer <idToken> 필수.
 *       토큰의 email 이 ADMIN_EMAILS 환경변수 목록에 있어야 함.
 */

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { assertAdminRequest } from "@/lib/adminAuth";
import { EVENT_NAMES } from "@/lib/constants/events";
import { ENTITLEMENT_REQUIRED } from "@/lib/constants/quota";
import { computeRetention, countEvents, type EventRow, type OpenRow, type RetentionUser } from "@/lib/retention";
import { todayKstYmd } from "@/lib/kstDate";

/** 리텐션 분모로 읽는 최근 가입자 상한 — 그 이상이면 이 화면 대신 진짜 분석 도구가 필요하다. */
const RETENTION_USERS_LIMIT = 1000;
/** 어드민에 보여줄 최근 피드백 수. */
const RECENT_FEEDBACK_LIMIT = 20;
/** 리텐션·이벤트 집계가 읽는 이벤트 창(일). D7 창(13일) + 가입 30일 이내를 덮는다. */
const EVENT_LOOKBACK_DAYS = 45;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ModelBucket {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

interface UserBucket {
  uid: string;
  email?: string;
  displayName?: string;
  totalTokens: number;
  costUsd: number;
  calls: number;
}

export async function GET(req: NextRequest) {
  // 1. 인증 (Bearer + ADMIN_EMAILS)
  const denied = await assertAdminRequest(req);
  if (denied) return denied;

  try {
    const db = getAdminDb();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const since7d = new Date(now - 7 * day);
    const since30d = new Date(now - 30 * day);

    // 2. 가입자 — 전체 컬렉션 스캔 대신 count() 집계로 산출(사용자 수에 비례한 비용 회피).
    //    알림 지표도 같은 방식: 명시적으로 켠/끈 사용자만 센다(미설정 = 기본 켜짐이므로
    //    "끔" 카운트가 곧 opt-out — docs/roadmap.md P1 지표 "알림 전체 off 비율 < 15%" 의 기반).
    const usersCol = db.collection("users");
    const notifCount = (field: string, value: boolean) =>
      usersCol.where(`notificationPrefs.${field}`, "==", value).count().get();
    const [
      totalSnap,
      s7Snap,
      s30Snap,
      morningOnSnap,
      morningOffSnap,
      eveningOnSnap,
      eveningOffSnap,
      weeklyOnSnap,
      weeklyOffSnap,
    ] = await Promise.all([
      usersCol.count().get(),
      usersCol.where("createdAt", ">=", Timestamp.fromDate(since7d)).count().get(),
      usersCol.where("createdAt", ">=", Timestamp.fromDate(since30d)).count().get(),
      notifCount("morningEnabled", true),
      notifCount("morningEnabled", false),
      notifCount("eveningEnabled", true),
      notifCount("eveningEnabled", false),
      notifCount("weeklyReviewEnabled", true),
      notifCount("weeklyReviewEnabled", false),
    ]);
    const totalUsers = totalSnap.data().count;
    const signups7d = s7Snap.data().count;
    const signups30d = s30Snap.data().count;
    const notifications = {
      // 설정을 명시적으로 저장한 사용자 수 기준 — 미설정 사용자는 기본 켜짐으로 동작한다.
      morning: { on: morningOnSnap.data().count, off: morningOffSnap.data().count },
      evening: { on: eveningOnSnap.data().count, off: eveningOffSnap.data().count },
      weeklyReview: { on: weeklyOnSnap.data().count, off: weeklyOffSnap.data().count },
    };

    // 3. 토큰 사용량 (전체 기간) — byModel/byUser/시간 버킷 집계.
    const usageSnap = await db.collection("tokenUsage").get();
    const byModel = new Map<string, ModelBucket>();
    const byUser = new Map<string, UserBucket>();
    const usage7d = { tokens: 0, cost: 0, calls: 0 };
    const usage30d = { tokens: 0, cost: 0, calls: 0 };
    const totalUsage = { tokens: 0, cost: 0, calls: 0 };

    for (const doc of usageSnap.docs) {
      const data = doc.data();
      const provider = String(data.provider || "unknown");
      const model = String(data.model || "unknown");
      const promptTokens = Number(data.promptTokens || 0);
      const completionTokens = Number(data.completionTokens || 0);
      const totalTokens = Number(data.totalTokens || promptTokens + completionTokens);
      const costUsd = Number(data.costUsd || 0);
      const uid = typeof data.uid === "string" ? data.uid : null;
      const created = data.createdAt?.toDate?.();

      totalUsage.tokens += totalTokens;
      totalUsage.cost += costUsd;
      totalUsage.calls += 1;

      if (created instanceof Date) {
        if (created >= since7d) {
          usage7d.tokens += totalTokens;
          usage7d.cost += costUsd;
          usage7d.calls += 1;
        }
        if (created >= since30d) {
          usage30d.tokens += totalTokens;
          usage30d.cost += costUsd;
          usage30d.calls += 1;
        }
      }

      const key = `${provider}|${model}`;
      const bucket = byModel.get(key) || {
        provider,
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        calls: 0,
      };
      bucket.promptTokens += promptTokens;
      bucket.completionTokens += completionTokens;
      bucket.totalTokens += totalTokens;
      bucket.costUsd += costUsd;
      bucket.calls += 1;
      byModel.set(key, bucket);

      if (uid) {
        const ub = byUser.get(uid) || {
          uid,
          totalTokens: 0,
          costUsd: 0,
          calls: 0,
        };
        ub.totalTokens += totalTokens;
        ub.costUsd += costUsd;
        ub.calls += 1;
        byUser.set(uid, ub);
      }
    }

    // 4. 제품 이벤트 — createdAt 단일 필드 범위 조회 한 번으로 읽고, 이름 필터·집계는 메모리에서
    //    (이름별 복합 인덱스 회피, lib/events 주석 참고). 리텐션은 최근 30일 가입자를 분모로,
    //    그들의 app_open 을 uid+day 로 묶어 계산한다(lib/retention).
    const sinceEvents = new Date(now - EVENT_LOOKBACK_DAYS * day);
    const [eventSnap, recentUsersSnap, feedbackSnap] = await Promise.all([
      db.collection("events").where("createdAt", ">=", Timestamp.fromDate(sinceEvents)).get(),
      usersCol
        .where("createdAt", ">=", Timestamp.fromDate(since30d))
        .limit(RETENTION_USERS_LIMIT)
        .get(),
      db.collection("feedback").orderBy("createdAt", "desc").limit(RECENT_FEEDBACK_LIMIT).get(),
    ]);

    const eventRows: EventRow[] = [];
    const openRows: OpenRow[] = [];
    for (const doc of eventSnap.docs) {
      const data = doc.data();
      const uid = typeof data.uid === "string" ? data.uid : null;
      const name = typeof data.name === "string" ? data.name : null;
      const created = data.createdAt?.toDate?.();
      if (!uid || !name || !(created instanceof Date)) continue;
      eventRows.push({ uid, name, at: created.getTime() });
      if (name === "app_open" && typeof data.day === "string") {
        openRows.push({ uid, day: data.day });
      }
    }

    const retentionUsers: RetentionUser[] = [];
    for (const doc of recentUsersSnap.docs) {
      const created = doc.data().createdAt?.toDate?.();
      if (created instanceof Date) {
        retentionUsers.push({ uid: doc.id, createdYmd: todayKstYmd(created) });
      }
    }

    const events = countEvents(eventRows, EVENT_NAMES, now);
    const retention = computeRetention(retentionUsers, openRows, todayKstYmd());

    // 5. 최근 피드백 — 본문은 그대로, 연락처는 동의한 건에만 들어 있다(/api/feedback).
    const recentFeedback = feedbackSnap.docs.map((doc) => {
      const data = doc.data();
      const created = data.createdAt?.toDate?.();
      return {
        id: doc.id,
        text: typeof data.text === "string" ? data.text : "",
        contactOk: data.contactOk === true,
        email: typeof data.email === "string" ? data.email : null,
        locale: typeof data.locale === "string" ? data.locale : null,
        platform: typeof data.platform === "string" ? data.platform : null,
        createdAt: created instanceof Date ? created.toISOString() : null,
      };
    });

    const round = (n: number) => Math.round(n * 1e6) / 1e6;

    // 상위 10명만 추린 뒤 그들의 프로필(email/displayName)만 조회 — 전체 users 스캔 회피.
    const topUsers = Array.from(byUser.values())
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 10);
    if (topUsers.length > 0) {
      const metaDocs = await db.getAll(...topUsers.map((u) => db.doc(`users/${u.uid}`)));
      const metaByUid = new Map(metaDocs.map((d) => [d.id, d.data() ?? {}]));
      for (const u of topUsers) {
        const meta = metaByUid.get(u.uid);
        u.email = typeof meta?.email === "string" ? meta.email : undefined;
        u.displayName = typeof meta?.displayName === "string" ? meta.displayName : undefined;
      }
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      users: {
        total: totalUsers,
        signups7d,
        signups30d,
      },
      notifications,
      // 운영 게이트 스위치 — 꺼져 있으면 402 가 안 나가고 페이월도 없다(lib/authServer). 레포에서는
      // 볼 수 없는 값이라 여기서 드러낸다. 결제 전환이 0 인데 이 값이 false 면 원인은 그것이다.
      entitlementRequired: ENTITLEMENT_REQUIRED,
      events,
      retention,
      recentFeedback,
      usage: {
        total: {
          tokens: totalUsage.tokens,
          costUsd: round(totalUsage.cost),
          calls: totalUsage.calls,
        },
        last7d: {
          tokens: usage7d.tokens,
          costUsd: round(usage7d.cost),
          calls: usage7d.calls,
        },
        last30d: {
          tokens: usage30d.tokens,
          costUsd: round(usage30d.cost),
          calls: usage30d.calls,
        },
      },
      byModel: Array.from(byModel.values())
        .map((b) => ({ ...b, costUsd: round(b.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd),
      topUsers: topUsers.map((u) => ({ ...u, costUsd: round(u.costUsd) })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/stats] 집계 실패:", msg);
    return NextResponse.json({ error: "Couldn't load stats." }, { status: 500 });
  }
}
