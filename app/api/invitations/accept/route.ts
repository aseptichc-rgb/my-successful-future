import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";
export const maxDuration = 15;

const DEFAULT_DISPLAY_NAME = "사용자";

interface AcceptBody {
  invitationId?: string;
  displayName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await verifyRequestUser(request);
    const body = (await request.json()) as AcceptBody;

    const invitationId = body.invitationId?.trim();
    const displayName = (body.displayName || "").trim() || DEFAULT_DISPLAY_NAME;
    if (!invitationId) {
      return NextResponse.json({ error: "invitationId가 필요합니다." }, { status: 400 });
    }

    const db = getAdminDb();
    const invRef = db.doc(`invitations/${invitationId}`);
    const invSnap = await invRef.get();
    if (!invSnap.exists) {
      return NextResponse.json({ error: "존재하지 않는 초대입니다." }, { status: 404 });
    }

    const inv = invSnap.data();
    if (!inv || inv.toUid !== uid) {
      return NextResponse.json({ error: "본인에게 온 초대가 아닙니다." }, { status: 403 });
    }
    if (inv.status && inv.status !== "pending") {
      return NextResponse.json({ error: "이미 처리된 초대입니다." }, { status: 409 });
    }

    const sessionId = inv.sessionId as string | undefined;
    if (!sessionId) {
      return NextResponse.json({ error: "잘못된 초대 데이터입니다." }, { status: 400 });
    }

    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessSnap = await sessionRef.get();
    if (!sessSnap.exists) {
      return NextResponse.json({ error: "대화방이 더 이상 존재하지 않습니다." }, { status: 404 });
    }

    await db.runTransaction(async (tx) => {
      tx.update(invRef, { status: "accepted" });
      tx.update(sessionRef, {
        participants: FieldValue.arrayUnion(uid),
        [`participantNames.${uid}`]: displayName,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Accept invitation error:", detail);
    return NextResponse.json({ error: "초대 수락 실패" }, { status: 500 });
  }
}
