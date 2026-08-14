/**
 * GET /api/admin/stats
 *
 * 어드민 페이지(/admin) 용 집계 API.
 * - 가입자 수 (총·최근 7일·최근 30일)
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
