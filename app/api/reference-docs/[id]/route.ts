import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 지정된 참조 문서가 현재 사용자의 소유인지 확인 후 ref 반환.
 */
async function loadOwnedDoc(id: string, uid: string) {
  const db = getAdminDb();
  const ref = db.collection("userReferenceDocs").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AuthError(404, "참조 문서를 찾을 수 없습니다.");
  const data = snap.data();
  if (data?.uid !== uid) throw new AuthError(403, "본인 문서만 수정/삭제할 수 있습니다.");
  return { ref, data };
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const user = await verifyRequestUser(request);
    const { ref } = await loadOwnedDoc(id, user.uid);
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("DELETE /api/reference-docs/[id] error:", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const user = await verifyRequestUser(request);
    const body = (await request.json()) as { active?: boolean; title?: string };

    const update: Record<string, unknown> = {};
    if (typeof body.active === "boolean") update.active = body.active;
    if (typeof body.title === "string") {
      const t = body.title.trim().slice(0, 100);
      if (t.length > 0) update.title = t;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "변경할 필드가 없습니다." }, { status: 400 });
    }

    const { ref } = await loadOwnedDoc(id, user.uid);
    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("PATCH /api/reference-docs/[id] error:", err);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}
