"use client";

import { useEffect } from "react";
import { captureUtmFromLocation } from "@/lib/utm";

/**
 * 랜딩(서버 컴포넌트)에 얹는 아주 작은 클라이언트 조각 — 도착 URL 의 utm_* 을 첫 방문 기준으로
 * 저장한다(lib/utm). 화면에는 아무것도 그리지 않는다.
 */
export default function UtmCapture() {
  useEffect(() => {
    captureUtmFromLocation();
  }, []);
  return null;
}
