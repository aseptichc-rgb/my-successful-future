import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth-context";
import LanguageBridge from "@/components/LanguageBridge";
import ProUpsellSheet from "@/components/billing/ProUpsellSheet";
import "./globals.css";

// 폰트는 Pretendard 단일 — globals.css 의 --font-* 체인이 CDN Pretendard 를 우선
// 호출하고 실패 시 시스템 폰트로 폴백. Inter/Noto Sans KR 의 별도 next/font 임베드는
// 더 이상 참조되지 않아 제거 (번들 크기 절감).

// 링크 미리보기(og/twitter)용 상수 — 같은 문구가 세 군데(title·og·twitter)에 들어가므로
// 한 곳에서만 고친다. 이 문구를 바꾸면 public/anima_og.png 의 카피도 같이 바꿀 것
// (scripts/generate-og-image.mjs 의 HEADLINE_LINES·DECK) — 썸네일과 <meta> 가 다른 말을
// 하면 스크래퍼 미리보기 안에서 두 문장이 서로 어긋나 보인다.
const SITE_NAME = "Anima";
const SITE_TITLE = "Anima — 꿈을 이루는 하루";
// 첫 문장은 og 이미지의 deck 과 같은 말이다(generate-og-image.mjs 의 DECK) — 카카오·슬랙
// 미리보기는 썸네일과 이 문장을 위아래로 붙여 보여주므로 한 벌로 읽혀야 한다. 마지막을 "앱"
// 으로 닫는 것은 범주를 남기기 위한 것이다 — 썸네일에는 그 낱말이 없어서, 미리보기만 본
// 사람에게 이게 무엇인지 말해 주는 자리가 여기뿐이다.
const SITE_DESCRIPTION =
  "위대함은 매일의 작은 행동의 반복입니다. 꿈을 한 줄 적으면 오늘 할 한 걸음이 정해지고, 그 걸음을 밀어줄 한 마디가 매일 도착하는 앱.";
// 안드로이드 assetlinks·capacitor.config.ts 의 SERVER_URL 과 같은 호스트여야 한다.
const SITE_URL = "https://my-successful-future.vercel.app";
// OG 권장 규격(1.91:1). Meta·X·카카오·슬랙이 공통으로 받는 최대공약수다.
const OG_IMAGE = { url: "/anima_og.png", width: 1200, height: 630, alt: SITE_TITLE };

export const metadata: Metadata = {
  // 상대 경로(OG_IMAGE.url)를 절대 URL 로 승격시킨다. 이게 없으면 Next 가 경고만 남기고
  // og:image 를 상대 경로 그대로 내보내는데, 스크래퍼는 상대 경로를 가져가지 못한다.
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
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
        <AuthProvider>
          <LanguageBridge>
            {children}
            {/* Pro 전용 기능을 눌렀을 때만 올라오는 업그레이드 시트(닫기 가능). 평소엔 렌더 없음. */}
            <ProUpsellSheet />
          </LanguageBridge>
        </AuthProvider>
      </body>
    </html>
  );
}
