import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import LanguageBridge from "@/components/LanguageBridge";
import KakaoScript from "@/components/KakaoScript";
import "./globals.css";

// SF Pro substitute on non-Apple platforms.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Korean UI fallback chain when Pretendard fails to load.
const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anima — daily motivation",
  description:
    "10년 후의 나에게서 매일 도착하는 한 마디. 목표를 적어두면 매일 새 카드로 받아봅니다.",
  applicationName: "Anima",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Force light theme — block forced dark mode injection by Samsung Internet etc.
  themeColor: "#F2F2F7",
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
  const fontVars = `${inter.variable} ${notoSansKR.variable}`;

  return (
    <html
      lang="ko"
      className={`${fontVars} h-full antialiased`}
      style={{ colorScheme: "light" }}
    >
      <head>
        <meta name="color-scheme" content="only light" />
        {/* Pretendard — Korean UI typeface (CDN). Used by font-sans for hangul glyphs */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#F2F2F7] text-black">
        <KakaoScript />
        <AuthProvider>
          <LanguageBridge>{children}</LanguageBridge>
        </AuthProvider>
      </body>
    </html>
  );
}
