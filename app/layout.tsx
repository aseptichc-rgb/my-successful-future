import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import PWARegister from "@/components/PWARegister";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "AI 뉴스 챗봇",
  description: "AI가 국내외 최신 뉴스를 실시간으로 전달하는 뉴스 챗봇 서비스",
  applicationName: "미래의 나",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "미래의 나",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
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
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full antialiased`}>
      <head>
        <script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
          integrity="sha384-DKYJZ8NLiK8MN4/C5P2ezmFnkrysYBLBQ6MbDdGRdSUPNExbMwMxsYGOqaOCEYs"
          crossOrigin="anonymous"
          async
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                if (window.Kakao && !window.Kakao.isInitialized()) {
                  var kakaoKey = '${process.env.NEXT_PUBLIC_KAKAO_JS_KEY || ""}';
                  if (kakaoKey) window.Kakao.init(kakaoKey);
                }
              });
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <PWARegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
