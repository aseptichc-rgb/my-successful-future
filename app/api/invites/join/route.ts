import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyRequestUser, AuthError } from "@/lib/authServer";

export const runtime = "nodejs";
export const maxDuration = 15;

const DEFAULT_DISPLAY_NAME = "사용자";

interface JoinBody {
  token?: string;
  displayName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await verifyRequestUser(request);
    const body = (await request.json()) as JoinBody;

    const token = body.token?.trim();
    const displayName = (body.displayName || "").trim() || DEFAULT_DISPLAY_NAME;
    if (!token) {
      return NextResponse.json({ error: "token이 필요합니다." }, { status: 400 });
    }

    const db = getAdminDb();
    const linkSnap = await db
      .collection("inviteLinks")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (linkSnap.empty) {
      return NextResponse.json({ error: "유효하지 않은 초대 링크입니다." }, { status: 404 });
    }

    const linkDoc = linkSnap.docs[0];
    const link = linkDoc.data();
    const expiresAt = link.expiresAt as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: "만료된 초대 링크입니다." }, { status: 410 });
    }

    const sessionId = link.sessionId as string | undefined;
    if (!sessionId) {
      return NextResponse.json({ error: "잘못된 초대 링크입니다." }, { status: 400 });
    }

    const sessionRef = db.doc(`sessions/${sessionId}`);
    const sessSnap = await sessionRef.get();
    if (!sessSnap.exists) {
      return NextResponse.json({ error: "존재하지 않는 대화방입니다." }, { status: 404 });
    }

    const session = sessSnap.data();
    const participants = Array.isArray(session?.participants) ? (session!.participants as string[]) : [];
    if (participants.includes(uid)) {
      return NextResponse.json({ success: true, sessionId });
    }

    await sessionRef.update({
      participants: FieldValue.arrayUnion(uid),
      [`participantNames.${uid}`]: displayName,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Join via link error:", detail);
    return NextResponse.json({ error: "대화방 참여 실패" }, { status: 500 });
  }
}
