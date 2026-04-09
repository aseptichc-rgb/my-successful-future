import { NextResponse } from "next/server";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, senderUid, senderName, messagePreview } = body;

    if (!sessionId || !senderUid || !senderName) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    const db = getAdminDb();

    // 1. 세션 정보 조회
    const sessionDoc = await db.collection("sessions").doc(sessionId).get();
    if (!sessionDoc.exists) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
    }

    const session = sessionDoc.data();
    if (!session) {
      return NextResponse.json({ error: "세션 데이터 없음" }, { status: 404 });
    }

    const participants: string[] = session.participants || [];
    const mutedBy: string[] = session.mutedBy || [];

    // 2. 알림 대상 필터링: 발신자, 음소거 사용자, 현재 세션 보고 있는 사용자 제외
    const targetUids = participants.filter((uid) => {
      if (uid === senderUid) return false;
      if (mutedBy.includes(uid)) return false;
      return true;
    });

    if (targetUids.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // 3. 현재 세션을 보고 있는 사용자 제외 (프레즌스 확인)
    const presenceRefs = targetUids.map((uid) => db.collection("presence").doc(uid));
    const presenceDocs = await db.getAll(...presenceRefs);
    const activeViewerUids = new Set<string>();

    presenceDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data?.online && data?.activeSessionId === sessionId) {
          activeViewerUids.add(data.uid);
        }
      }
    });

    const notifyUids = targetUids.filter((uid) => !activeViewerUids.has(uid));

    if (notifyUids.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // 4. FCM 토큰 조회
    const tokens: string[] = [];
    // Firestore 'in' 쿼리 제한 (30개씩)
    for (let i = 0; i < notifyUids.length; i += 30) {
      const batch = notifyUids.slice(i, i + 30);
      const tokenSnap = await db
        .collection("fcmTokens")
        .where("uid", "in", batch)
        .get();
      tokenSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.token) tokens.push(data.token);
      });
    }

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // 5. 푸시 알림 전송
    const messaging = getAdminMessaging();
    const message = {
      tokens,
      data: {
        title: senderName,
        body: messagePreview || "새 메시지가 도착했습니다",
        sessionId,
      },
    };

    const result = await messaging.sendEachForMulticast(message);

    // 만료된 토큰 정리
    const failedTokens: string[] = [];
    result.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
        failedTokens.push(tokens[idx]);
      }
    });

    // 만료 토큰 비동기 삭제
    if (failedTokens.length > 0) {
      for (const token of failedTokens) {
        const snap = await db.collection("fcmTokens").where("token", "==", token).get();
        snap.docs.forEach((doc) => doc.ref.delete());
      }
    }

    return NextResponse.json({
      sent: result.successCount,
      failed: result.failureCount,
    });
  } catch (err) {
    console.error("푸시 알림 전송 오류:", err);
    return NextResponse.json({ error: "알림 전송 실패" }, { status: 500 });
  }
}
