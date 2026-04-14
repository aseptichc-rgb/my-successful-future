import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, assertSessionParticipant, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tokenId: string }>;
}

/** 토큰 폐기 (revoked=true). 본인 또는 같은 세션 참여자가 가능. */
export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { tokenId } = await ctx.params;
    const user = await verifyRequestUser(request);
    const db = getAdminDb();
    const ref = db.collection("pushTokens").doc(tokenId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "토큰을 찾을 수 없습니다." }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown>;
    const sessionId = String(data.sessionId || "");
    await assertSessionParticipant(user.uid, sessionId);

    // 발급자 본인 또는 세션 참여자(이미 위에서 검증됨) — 삭제는 발급자만 허용
    if (data.ownerUid !== user.uid) {
      return NextResponse.json(
        { error: "발급자 본인만 토큰을 폐기할 수 있습니다." },
        { status: 403 }
      );
    }

    await ref.update({ revoked: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "폐기 실패" }, { status: 500 });
  }
}
