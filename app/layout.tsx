import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import PWARegister from "@/components/PWARegister";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import KakaoScript from "@/components/KakaoScript";
import "./globals.css";

// UI grotesque (Latin)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Korean UI fallback. Pretendard는 head <link>로 우선 로드, 실패 시 Noto Sans KR.
const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Display serif — 명상적·사상적 톤. Fraunces로 Tiempos / GT Sectra 대체
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
});

// Mono — 인용·날짜·메타 텍스트
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anima — daily motivation",
  description: "10년 후의 나에게서 매일 도착하는 한 마디. 목표를 적어두면 매일 새 카드로 받아봅니다.",
  applicationName: "Anima",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Anima",
  },
  formatDetection: {
    telephone: false,
  },
  // app/icon.svg + app/apple-icon.png 가 Next 13+ 컨벤션으로 자동 노출됨.
  // 명시적으로 한 번 더 선언해 PWA·OG 컨텍스트에서 안전하게 사용되도록 함.
  icons: {
    icon: [
      { url: "/icon", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon", sizes: "1024x1024", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F3EC" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1B4B" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${inter.variable} ${notoSansKR.variable} ${fraunces.variable} ${jetbrainsMono.variable}`;

  return (
    <html lang="ko" className={`${fontVars} h-full antialiased`}>
      <head>
        {/* Pretendard — Korean UI 그로테스크. CDN preconnect + variable woff2 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-cream text-indigo">
        <KakaoScript />
        <PWARegister />
        <AuthProvider>{children}</AuthProvider>
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
