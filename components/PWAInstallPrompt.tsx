"use client";

import { useEffect, useState, useCallback } from "react";

const DISMISS_KEY = "anima:pwa-install-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7일
const SHOW_DELAY_MS = 1500;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "desktop" | "ios" | "android";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
  if (isIOS) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return true;
  } catch {
    return false;
  }
  return false;
}

function readDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function PWAInstallPrompt() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (readDismissedRecently()) return;

    const p = detectPlatform();
    setPlatform(p);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setOpen(true);
    };

    const handleInstalled = () => {
      setOpen(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    // iOS는 beforeinstallprompt가 발생하지 않으므로 지연 후 안내 노출
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (p === "ios") {
      timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 저장 실패는 무시 (시크릿 모드 등)
    }
    setOpen(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    try {
      setInstalling(true);
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setOpen(false);
      } else {
        handleDismiss();
      }
    } catch (err) {
      console.warn("[PWA] install prompt failed:", err);
    } finally {
      setInstalling(false);
      setDeferred(null);
    }
  }, [deferred, handleDismiss]);

  if (!open) return null;

  const canPrompt = !!deferred;
  const title = canPrompt ? "바탕화면에 Anima 설치" : "홈 화면에 Anima 추가";
  const description = canPrompt
    ? "앱처럼 빠르게 실행하고, 알림을 더 안정적으로 받아볼 수 있어요."
    : platform === "ios"
      ? "Safari 하단의 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요."
      : "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
    >
      <div
        className="w-full max-w-sm rounded-[18px] bg-white p-6 shadow-apple-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="pwa-install-title"
          className="text-[18px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1E1B4B]"
        >
          {title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.45] tracking-[-0.01em] text-black/64">
          {description}
        </p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={installing}
            className="rounded-pill bg-[#F0EDE6] px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-black/80 transition-colors hover:bg-black/[0.06] disabled:opacity-50"
          >
            나중에
          </button>
          {canPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-1.5 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#2A2766] disabled:opacity-60"
            >
              {installing && (
                <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
              )}
              지금 설치
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
