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
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isAdminEmail } from "@/lib/tokenUsage";

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
  // 1. 인증
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const token = header.slice(7).trim();
  let email: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "유효하지 않은 토큰입니다." }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json(
      { error: "어드민 권한이 없습니다. ADMIN_EMAILS 환경변수에 이메일을 추가해주세요." },
      { status: 403 }
    );
  }

  const db = getAdminDb();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since7d = new Date(now - 7 * day);
  const since30d = new Date(now - 30 * day);

  // 2. 가입자
  const usersSnap = await db.collection("users").get();
  let totalUsers = 0;
  let signups7d = 0;
  let signups30d = 0;
  const userMeta = new Map<string, { email?: string; displayName?: string }>();
  for (const doc of usersSnap.docs) {
    totalUsers += 1;
    const data = doc.data();
    userMeta.set(doc.id, {
      email: typeof data.email === "string" ? data.email : undefined,
      displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    });
    const created = data.createdAt?.toDate?.();
    if (created instanceof Date) {
      if (created >= since7d) signups7d += 1;
      if (created >= since30d) signups30d += 1;
    }
  }

  // 3. 토큰 사용량 (전체 기간)
  const usageSnap = await db.collection("tokenUsage").get();
  const byModel = new Map<string, ModelBucket>();
  const byUser = new Map<string, UserBucket>();
  let usage7d = { tokens: 0, cost: 0, calls: 0 };
  let usage30d = { tokens: 0, cost: 0, calls: 0 };
  let totalUsage = { tokens: 0, cost: 0, calls: 0 };

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
      const meta = userMeta.get(uid);
      const ub = byUser.get(uid) || {
        uid,
        email: meta?.email,
        displayName: meta?.displayName,
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

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    users: {
      total: totalUsers,
      signups7d,
      signups30d,
    },
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
    topUsers: Array.from(byUser.values())
      .map((u) => ({ ...u, costUsd: round(u.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 10),
  });
}
