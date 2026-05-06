import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anima — daily motivation",
    short_name: "Anima",
    description:
      "10년 후의 나에게서 매일 도착하는 한 마디. 목표를 적어두면 매일 새 카드로 받아봅니다.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F3EC",
    theme_color: "#1E1B4B",
    lang: "ko-KR",
    categories: ["lifestyle", "productivity", "health"],
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
