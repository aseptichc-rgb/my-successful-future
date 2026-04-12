"use client";

import Script from "next/script";

export default function KakaoScript() {
  return (
    <Script
      src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
      integrity="sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka"
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        const w = window as unknown as Record<string, unknown>;
        const Kakao = w.Kakao as {
          isInitialized: () => boolean;
          init: (key: string) => void;
        } | undefined;
        if (Kakao && !Kakao.isInitialized()) {
          const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "";
          if (kakaoKey) Kakao.init(kakaoKey);
        }
      }}
    />
  );
}
