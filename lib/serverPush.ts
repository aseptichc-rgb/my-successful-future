/**
 * 서버측(크론/Admin SDK) FCM 푸시 헬퍼.
 *
 * - notification + data + webpush 필드를 모두 포함해 Android/iOS Web Push 양쪽
 *   모두에서 알림 배너가 자동 표시되게 한다. (data-only 페이로드는 iOS Safari Web
 *   Push 에서 자동 표시되지 않는 이슈가 있다.)
 * - 만료된 토큰은 자동 정리해 Firestore 가 비대해지지 않게 한다.
 * - 토큰이 없으면 조용히 skip — 메시지 본문은 이미 저장됐으므로 푸시 실패가
 *   사용자 흐름을 차단하지 않는다.
 */

import { getAdminDb, getAdminMessaging } from "@/lib/firebase-admin";

interface SendChatPushParams {
  /** 알림을 받을 사용자 UID */
  uid: string;
  /** 클릭 시 진입할 세션 ID */
  sessionId: string;
  /** 알림 타이틀 (페르소나/상대 이름) */
  title: string;
  /** 알림 본문 미리보기 (최대 ~120자 권장) */
  body: string;
  /** 알림 그룹화 태그. 같은 태그면 같은 세션 알림은 하나만 표시. */
  tag?: string;
}

/**
 * 채팅/격려/리추얼 등 자동 메시지 푸시를 보낸다.
 * 호출 측은 try-catch 로 감싸 푸시 실패가 메시지 저장 흐름을 막지 않게 한다.
 */
export async function sendChatPush(params: SendChatPushParams): Promise<{
  successCount: number;
  failureCount: number;
}> {
  const { uid, sessionId, title, body, tag } = params;
  const db = getAdminDb();

  const tokenSnap = await db
    .collection("fcmTokens")
    .where("uid", "==", uid)
    .get();
  const tokens = tokenSnap.docs
    .map((d) => d.get("token") as string | undefined)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  const messaging = getAdminMessaging();
  const link = sessionId ? `/chat/${sessionId}` : "/chat";
  const result = await messaging.sendEachForMulticast({
    tokens,
    // Display notification — Android/iOS Web Push 자동 배너 표시.
    notification: { title, body },
    // SW(onBackgroundMessage) 또는 클릭 핸들러에서 사용.
    data: {
      title,
      body,
      sessionId,
    },
    webpush: {
      fcmOptions: { link },
      notification: {
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: tag || sessionId || "default",
      },
    },
    android: {
      notification: {
        tag: tag || sessionId || "default",
      },
    },
  });

  // 만료/등록해지된 토큰 정리.
  const expired: string[] = [];
  result.responses.forEach((resp, idx) => {
    if (
      !resp.success &&
      resp.error?.code === "messaging/registration-token-not-registered"
    ) {
      expired.push(tokens[idx]);
    }
  });
  if (expired.length > 0) {
    for (const token of expired) {
      try {
        const dead = await db.collection("fcmTokens").where("token", "==", token).get();
        dead.docs.forEach((d) => d.ref.delete());
      } catch (err) {
        console.warn("[serverPush] 만료 토큰 정리 실패:", err);
      }
    }
  }

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
  };
}
