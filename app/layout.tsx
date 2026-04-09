import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "AI 뉴스 챗봇",
  description: "AI가 국내외 최신 뉴스를 실시간으로 전달하는 뉴스 챗봇 서비스",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
