import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // 에뮬레이터(10.0.2.2)·실기기(LAN IP)에서 dev 서버의 _next/* 리소스에 접근할 수 있도록 허용.
  // Next.js 16 부터 dev 리소스 cross-origin 접근이 기본 차단됨 — TWA/Custom Tab 로딩이 hang 되는 원인.
  allowedDevOrigins: ["10.0.2.2", "localhost", "127.0.0.1"],
};

export default nextConfig;
