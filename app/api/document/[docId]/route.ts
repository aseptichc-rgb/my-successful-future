import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, assertSessionParticipant, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ docId: string }>;
}

async function loadDoc(docId: string) {
  const db = getAdminDb();
  const ref = db.collection("sessionDocuments").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new AuthError(404, "문서를 찾을 수 없습니다.");
  return { ref, data: snap.data() as Record<string, unknown> };
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { docId } = await ctx.params;
    const user = await verifyRequestUser(request);
    const { ref, data } = await loadDoc(docId);
    const sessionId = String(data.sessionId || "");
    await assertSessionParticipant(user.uid, sessionId);

    // 본인이 올린 문서만 삭제 허용
    if (data.ownerUid !== user.uid) {
      return NextResponse.json(
        { error: "본인이 올린 문서만 삭제할 수 있습니다." },
        { status: 403 }
      );
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const { docId } = await ctx.params;
    const user = await verifyRequestUser(request);
    const body = (await request.json()) as { active?: boolean };
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active(boolean) 필드가 필요합니다." }, { status: 400 });
    }
    const { ref, data } = await loadDoc(docId);
    const sessionId = String(data.sessionId || "");
    await assertSessionParticipant(user.uid, sessionId);

    // 세션 참여자라면 토글 가능 (본인 문서가 아니어도 컨텍스트 ON/OFF 는 허용)
    await ref.update({ active: body.active });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
