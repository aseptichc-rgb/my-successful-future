/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBKJxjd6OOaRiY4Rv7L497VxC0cIFuqMEs",
  authDomain: "my-successful-future.firebaseapp.com",
  projectId: "my-successful-future",
  storageBucket: "my-successful-future.firebasestorage.app",
  messagingSenderId: "270661380439",
  appId: "1:270661380439:web:8e7e9ec513115f28dbb612",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // notification 필드가 같이 왔으면 FCM SDK 가 자동으로 알림을 표시하므로
  // 여기서 또 showNotification 을 부르면 알림이 중복으로 뜬다. data 만 있는
  // 경우에 한해 우리가 직접 표시한다.
  if (payload.notification) return;

  const data = payload.data || {};
  const title = data.title || "새 메시지";
  const body = data.body || "";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.sessionId ? `/chat/${data.sessionId}` : "/chat" },
    tag: data.sessionId || "default",
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/chat") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
