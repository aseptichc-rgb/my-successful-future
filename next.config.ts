import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // 에뮬레이터(10.0.2.2)·실기기(LAN IP)에서 dev 서버의 _next/* 리소스에 접근할 수 있도록 허용.
  // Next.js 16 부터 dev 리소스 cross-origin 접근이 기본 차단됨 — TWA/Custom Tab 로딩이 hang 되는 원인.
  allowedDevOrigins: ["10.0.2.2", "localhost", "127.0.0.1"],
  /**
   * 하단 탭 전환(2026-09) 전의 경로를 살린다 — Android 알림/위젯이 이미 깔린 기기에서 옛 경로로
   * 들어오고(MainActivity.resolveOpenPath), 그 매핑은 네이티브 빌드를 새로 올려야 바뀐다.
   * Next 는 들어온 쿼리를 destination 에 그대로 합쳐 주므로 refine·fromApp·nativeToken 이 살아남는다.
   * 307(permanent: false) — 네이티브가 갱신되면 이 항목은 지운다.
   */
  async redirects() {
    return [
      {
        source: "/settings",
        has: [{ type: "query", key: "sheet", value: "(?<sheet>futureSelf|affirmations|goals)" }],
        destination: "/dream?sheet=:sheet",
        permanent: false,
      },
      { source: "/wins-history", destination: "/record/history", permanent: false },
    ];
  },
};

export default nextConfig;
