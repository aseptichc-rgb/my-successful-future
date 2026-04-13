import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, assertSessionParticipant, AuthError } from "@/lib/authServer";
import { generateToken } from "@/lib/pushTokens";

export const runtime = "nodejs";

const MAX_TOKENS_PER_SESSION = 5;
const MAX_EXPIRES_DAYS = 90;
const DEFAULT_EXPIRES_DAYS = 7;

interface IssueBody {
  sessionId?: string;
  label?: string;
  expiresInDays?: number;
  maxUses?: number;
  ownerName?: string;
}

/** 토큰 발급. 평문은 응답에 1회만 포함. */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const body = (await request.json()) as IssueBody;
    const sessionId = String(body.sessionId || "");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
    }
    await assertSessionParticipant(user.uid, sessionId);

    const db = getAdminDb();

    // 활성 토큰 개수 상한
    const activeSnap = await db
      .collection("pushTokens")
      .where("sessionId", "==", sessionId)
      .where("revoked", "==", false)
      .count()
      .get();
    if (activeSnap.data().count >= MAX_TOKENS_PER_SESSION) {
      return NextResponse.json(
        { error: `세션당 활성 토큰은 최대 ${MAX_TOKENS_PER_SESSION}개입니다.` },
        { status: 409 }
      );
    }

    const days = Math.max(
      1,
      Math.min(MAX_EXPIRES_DAYS, Math.floor(body.expiresInDays ?? DEFAULT_EXPIRES_DAYS))
    );
    const expiresAt = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);
    const maxUses = body.maxUses && body.maxUses > 0 ? Math.floor(body.maxUses) : null;
    const label = (body.label || "").slice(0, 60).trim() || null;
    const ownerName = (body.ownerName || "").slice(0, 50).trim() || null;

    const { token, hash } = generateToken();

    const ref = await db.collection("pushTokens").add({
      sessionId,
      ownerUid: user.uid,
      ownerName,
      label,
      tokenHash: hash,
      expiresAt,
      revoked: false,
      useCount: 0,
      maxUses,
      lastUsedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      tokenId: ref.id,
      token, // 평문 — 1회만 노출
      expiresAt: expiresAt.toMillis(),
      maxUses,
      label,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Push token issue error:", msg);
    return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  }
}

/** 세션의 토큰 메타데이터 목록 (해시는 노출 X). */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyRequestUser(request);
    const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId가 필요합니다." }, { status: 400 });
    }
    await assertSessionParticipant(user.uid, sessionId);

    const db = getAdminDb();
    // 단일 필드 where 만 사용 (복합 인덱스 불필요). 정렬은 메모리에서.
    const snap = await db
      .collection("pushTokens")
      .where("sessionId", "==", sessionId)
      .get();

    const tokens = snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          sessionId,
          ownerUid: data.ownerUid,
          ownerName: data.ownerName,
          label: data.label,
          expiresAt: (data.expiresAt as Timestamp | undefined)?.toMillis() ?? null,
          revoked: Boolean(data.revoked),
          useCount: Number(data.useCount || 0),
          maxUses: data.maxUses ?? null,
          lastUsedAt: (data.lastUsedAt as Timestamp | undefined)?.toMillis() ?? null,
          createdAt: (data.createdAt as Timestamp | undefined)?.toMillis() ?? null,
        };
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    return NextResponse.json({ tokens });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Push token list error:", msg);
    return NextResponse.json({ error: `조회 실패: ${msg}` }, { status: 500 });
  }
}
