import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth-context";
import LanguageBridge from "@/components/LanguageBridge";
import KakaoScript from "@/components/KakaoScript";
import WidgetDebugBanner from "@/components/WidgetDebugBanner";
import "./globals.css";

// 폰트는 Pretendard 단일 — globals.css 의 --font-* 체인이 CDN Pretendard 를 우선
// 호출하고 실패 시 시스템 폰트로 폴백. Inter/Noto Sans KR 의 별도 next/font 임베드는
// 더 이상 참조되지 않아 제거 (번들 크기 절감).

export const metadata: Metadata = {
  title: "Anima — daily motivation",
  description:
    "10년 후의 나에게서 매일 도착하는 한 마디. 목표를 적어두면 매일 새 카드로 받아봅니다.",
  applicationName: "Anima",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Force light theme — block forced dark mode injection by Samsung Internet etc.
  themeColor: "#F7F3EC",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
      style={{ colorScheme: "light" }}
    >
      <head>
        <meta name="color-scheme" content="only light" />
        {/* Pretendard — 라틴·한글 통합 UI 타입페이스 (CDN). 모든 텍스트가 이 폰트로 렌더됨. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[var(--bg-grouped)] text-[var(--label)]">
        <KakaoScript />
        <AuthProvider>
          <LanguageBridge>{children}</LanguageBridge>
          {/* [임시] iOS 위젯 데이터 공급 진단 — 원인 확정 후 제거 */}
          <WidgetDebugBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
