"use client";

import { useEffect, useState } from "react";
import { getKstYmd } from "@/lib/firebase";
import { clampYmdToRecent } from "@/lib/kstDate";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function readQDateFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = new URL(window.location.href).searchParams.get("qDate");
    return v && YMD_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 지금 화면이 다루는 날짜(KST YYYY-MM-DD).
 *
 * qDate 는 [어제, 오늘] 만 신뢰한다(서버 resolveRequestYmd 와 같은 정책). 그보다 오래된 값 —
 * 네이티브 동기 갱신 타임아웃 시 stale 위젯의 clickedYmd 폴백, Chrome 이 원래 인텐트 URL 로
 * 재복원한 TWA 탭 — 을 그대로 쓰면 날짜·체크인·목표·리듬 링이 통째로 며칠 전에 고정되고,
 * 그 상태에서 ↻ 를 누르면 서버는 오늘 카드를 재생성하는데 라벨은 옛날 날짜로 남는다.
 *
 * 탭 레이아웃(lib/today-context)이 한 번만 호출한다 — 모든 탭이 같은 날짜를 본다.
 */
export function useResolvedYmd(): string {
  const [ymd, setYmd] = useState<string>(() => clampYmdToRecent(readQDateFromUrl(), getKstYmd()));
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("qDate")) {
        url.searchParams.delete("qDate");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* noop */
    }
    const syncForward = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const live = getKstYmd();
      setYmd((cur) => (live > cur ? live : cur));
    };
    document.addEventListener("visibilitychange", syncForward);
    window.addEventListener("focus", syncForward);
    return () => {
      document.removeEventListener("visibilitychange", syncForward);
      window.removeEventListener("focus", syncForward);
    };
  }, []);
  return ymd;
}
