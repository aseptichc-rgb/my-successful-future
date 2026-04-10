/* eslint-disable no-undef */
// PWA Service Worker — basic offline shell + runtime cache.
// FCM의 firebase-messaging-sw.js 와는 다른 파일/스코프이므로 충돌하지 않는다.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// 앱 셸: 오프라인 진입 시 최소한 보여줄 정적 자원
const PRECACHE_URLS = ["/", "/offline.html", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 만 캐시. POST/PUT/DELETE 는 통과.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 같은 출처가 아니면 캐시하지 않음 (CDN/외부 API 등)
  if (url.origin !== self.location.origin) return;

  // API 라우트는 항상 네트워크 우선 (뉴스/채팅은 실시간성이 중요)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({ error: "오프라인 상태입니다." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          )
      )
    );
    return;
  }

  // 페이지 네비게이션: 네트워크 우선, 실패 시 캐시된 셸/오프라인 페이지
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || (await caches.match("/offline.html")) || Response.error();
        })
    );
    return;
  }

  // 정적 자원(JS/CSS/이미지/폰트): 캐시 우선, 백그라운드에서 갱신 (stale-while-revalidate)
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
