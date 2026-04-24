import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI 뉴스 챗봇 — 미래의 나",
    short_name: "미래의 나",
    description:
      "AI가 국내외 최신 뉴스를 실시간으로 전달하고, 미래의 나와 대화할 수 있는 챗봇 서비스",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    lang: "ko-KR",
    categories: ["news", "productivity", "lifestyle"],
    // PNG 아이콘 에셋이 public/icons/ 에 배치되면 아래 엔트리를 되살릴 것.
    // 현재는 파일이 없어서 404 가 콘솔 노이즈를 만들기에 favicon 만 노출.
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
