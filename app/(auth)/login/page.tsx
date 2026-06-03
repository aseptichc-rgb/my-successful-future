"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuthCredential } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * Login — Apple iOS native redesign
 *  · Centered colorful gradient logo hero
 *  · Grouped inset input card (email + password rows)
 *  · System Blue primary CTA · Google OAuth secondary
 * ───────────────────────────────────────────────────────────────── */

/**
 * Anima Aperture 마크 — design/Anima Logo Directions.html 의 캐논 기하.
 *  · viewBox 100×100, r=42, gap=18° 12시(=-90°).
 *  · 중심: 외환(stroke color, r=4) + 내핵(coreColor, r=1.8) "이중 코어" —
 *    런처 아이콘(ic_launcher_foreground.xml) 과 동일한 시각 무게.
 *  · stroke 2 → 2.4 — design 폴더 기본 1.5 는 100vb 기준이고 큰 사이즈에선
 *    가늘어서 ic_launcher 와 시각 굵기를 일치시키도록 살짝 증량.
 */
function AnimaMark({
  size = 56,
  color = "#FFFFFF",
  coreColor = "#BE4B26",
}: {
  size?: number;
  color?: string;
  coreColor?: string;
}) {
  const cx = 50, cy = 50, r = 42, gap = 18;
  const gapStart = -90 - gap / 2, gapEnd = -90 + gap / 2;
  const polar = (rr: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + rr * Math.cos(rad), cy + rr * Math.sin(rad)];
  };
  const [sx, sy] = polar(r, gapEnd);
  const [ex, ey] = polar(r, gapStart + 360);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <path
        d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`}
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* 외환 — stroke 색과 동색 */}
      <circle cx={cx} cy={cy} r="4" fill={color} />
      {/* 내핵 — soul 진한 톤(core) 으로 깊이감 */}
      <circle cx={cx} cy={cy} r="1.8" fill={coreColor} />
    </svg>
  );
}

function LogoLockup() {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-24 h-24 rounded-[28px] flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #D85A30 0%, #BE4B26 100%)",
          boxShadow: "0 12px 28px rgba(175,82,222,0.28)",
        }}
      >
        <AnimaMark size={56} color="#FFFFFF" />
      </div>
      <span
        className="mt-5 text-[36px] font-light tracking-[-0.9px] leading-none text-[var(--label)] inline-flex items-baseline whitespace-nowrap"
        style={{ fontFamily: "var(--font-display)" }}
      >
        an
        <span className="relative inline-block" style={{ width: 6 }}>
          <span
            className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-black rounded-[1px]"
            style={{ width: 2, height: 18 }}
          />
          <span
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: -2,
              width: 5,
              height: 5,
              background: "#D85A30",
            }}
          />
        </span>
        ma
      </span>
    </div>
  );
}

type PendingProvider = "google" | "apple";

interface PendingLink {
  provider: PendingProvider;
  email: string;
  pendingCredential: AuthCredential;
}

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const {
    signIn,
    signInGoogle,
    signInApple,
    linkGoogleToEmailPassword,
    linkAppleToEmailPassword,
    firebaseUser,
    loading: authLoading,
  } = useAuth();

  useEffect(() => {
    if (!authLoading && firebaseUser) router.replace("/home");
  }, [authLoading, firebaseUser, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [linkPassword, setLinkPassword] = useState("");

  const getRedirectPath = () => "/home";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      router.push(getRedirectPath());
    } catch {
      setError(t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInGoogle();
      if (result.kind === "needsLink") {
        setPendingLink({
          provider: "google",
          email: result.email,
          pendingCredential: result.pendingCredential,
        });
        setLinkPassword("");
        return;
      }
      router.push(getRedirectPath());
    } catch {
      setError(t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Apple 로그인. iOS 네이티브에선 ASAuthorizationController, 그 외엔 웹 popup 으로 자동 분기된다
   * ([signInWithApple]). 동일 이메일이 이메일/비밀번호 계정에 묶여 있으면 Google 과 동일하게
   * needsLink 분기 — 비밀번호 입력 화면으로 전환된다 (Apple App Store Guideline 5.1.1(v) 충족).
   * 사용자가 네이티브 시트를 닫으면 cancelled — 에러 없이 로그인 화면을 그대로 둔다.
   */
  const handleApple = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInApple();
      if (result.kind === "cancelled") return;
      if (result.kind === "needsLink") {
        setPendingLink({
          provider: "apple",
          email: result.email,
          pendingCredential: result.pendingCredential,
        });
        setLinkPassword("");
        return;
      }
      router.push(getRedirectPath());
    } catch {
      setError(t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingLink) return;
    setError("");
    setLoading(true);
    try {
      const link =
        pendingLink.provider === "apple"
          ? linkAppleToEmailPassword
          : linkGoogleToEmailPassword;
      await link(pendingLink.email, linkPassword, pendingLink.pendingCredential);
      setPendingLink(null);
      setLinkPassword("");
      router.push(getRedirectPath());
    } catch {
      setError(t("auth.link.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelLink = () => {
    setPendingLink(null);
    setLinkPassword("");
    setError("");
  };

  /* ── Link pending state ── */
  if (pendingLink) {
    const isApple = pendingLink.provider === "apple";
    const linkTitleKey = isApple ? "auth.link.apple.title" : "auth.link.title";
    const linkDescKey = isApple ? "auth.link.apple.description" : "auth.link.description";
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-grouped)] p-6">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-8">
            <LogoLockup />
            <h2 className="mt-6 text-[22px] font-bold tracking-[-0.45px] text-[var(--label)]">
              {t(linkTitleKey)}
            </h2>
            <p className="mt-2 text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
              {t(linkDescKey, { email: pendingLink.email })}
            </p>
          </div>

          <form onSubmit={handleConfirmLink} className="space-y-3">
            <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="w-20 shrink-0 whitespace-nowrap text-[15px] text-[var(--label-2)]">
                  {t("auth.password")}
                </span>
                <input
                  type="password"
                  required
                  autoFocus
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[17px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none"
                  placeholder={t("auth.password.placeholder")}
                />
              </div>
            </div>

            {error && <p className="text-[13px] text-[#FF3B30]">{error}</p>}

            <button
              type="submit"
              disabled={loading || !linkPassword}
              className="w-full h-[50px] rounded-[12px] bg-[var(--soul)] text-white text-[17px] font-semibold tracking-[-0.43px] disabled:opacity-40"
            >
              {loading ? t("auth.signingIn") : t("auth.link.submit")}
            </button>
            <button
              type="button"
              onClick={handleCancelLink}
              disabled={loading}
              className="w-full h-[50px] rounded-[12px] bg-[var(--bg-grouped-2)] border border-[var(--sep)] text-[var(--label)] text-[17px] font-semibold tracking-[-0.43px] disabled:opacity-40"
            >
              {t("auth.link.cancel")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── Default login ── */
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-grouped)]">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Hero */}
          <div className="flex flex-col items-center text-center mb-10">
            <LogoLockup />
            <p className="mt-5 text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)] max-w-[280px]">
              {t("auth.signIn.subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Email + password — grouped inset card */}
            <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
              <div className="relative flex items-center gap-3 px-4 py-3.5">
                <span className="w-20 shrink-0 whitespace-nowrap text-[15px] text-[var(--label-2)]">
                  {t("auth.email")}
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[17px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none"
                  placeholder="email@example.com"
                />
                <div className="absolute bottom-0 left-[100px] right-0 h-[0.5px] bg-[var(--sep)]" />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="w-20 shrink-0 whitespace-nowrap text-[15px] text-[var(--label-2)]">
                  {t("auth.password")}
                </span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[17px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none"
                  placeholder={t("auth.password.placeholder")}
                />
              </div>
            </div>

            {error && <p className="text-[13px] text-[#FF3B30]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[50px] rounded-[12px] bg-[var(--soul)] text-white text-[17px] font-semibold tracking-[-0.43px] disabled:opacity-40"
            >
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3 text-[13px] text-[var(--label-3)]">
            <div className="flex-1 h-[0.5px] bg-[var(--sep)]" />
            {t("auth.or") || "또는"}
            <div className="flex-1 h-[0.5px] bg-[var(--sep)]" />
          </div>

          {/* Apple — App Store Guideline 5.1.1(v) 의무 노출.
              디자인은 Apple HIG "Sign in with Apple" 가이드 준수:
              밝은 배경에서는 검정 버튼 + 흰색 로고/텍스트, Google 버튼과 동등한 시각 무게. */}
          <button
            type="button"
            onClick={handleApple}
            disabled={loading}
            aria-label={t("auth.continueWithApple") || "Apple로 계속하기"}
            className="w-full h-[50px] rounded-[12px] bg-black text-white text-[17px] font-semibold tracking-[-0.43px] inline-flex items-center justify-center gap-2.5 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 384 512" aria-hidden fill="currentColor">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.5 99.1c30-35.6 27.3-68 26.4-79.6-26.5 1.5-57.1 18-74.6 38.3-19.3 21.8-30.6 48.8-28.2 79 28.6 2.2 54.7-12.5 76.4-37.7z"/>
            </svg>
            {t("auth.continueWithApple") || "Apple로 계속하기"}
          </button>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="mt-3 w-full h-[50px] rounded-[12px] bg-[var(--bg-grouped-2)] border border-[var(--sep)] text-[var(--label)] text-[17px] font-semibold tracking-[-0.43px] inline-flex items-center justify-center gap-2.5 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.78 2.72v2.26h2.88c1.68-1.55 2.66-3.83 2.66-6.62z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.47-.8 5.95-2.18l-2.88-2.26c-.8.54-1.83.85-3.07.85-2.36 0-4.36-1.6-5.07-3.74H.93v2.34A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.93 10.67a5.42 5.42 0 0 1 0-3.34V4.99H.93a8.997 8.997 0 0 0 0 8.02l3-2.34z" fill="#FBBC05" />
              <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.95 8.95 0 0 0 9 0 8.997 8.997 0 0 0 .93 4.99l3 2.34C4.64 5.18 6.64 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            {t("auth.continueWithGoogle") || "Google로 계속하기"}
          </button>

          {/* Sign up link */}
          <div className="mt-8 text-center text-[15px] tracking-[-0.24px] text-[var(--label-2)]">
            {t("auth.noAccount") || "처음이신가요?"}{" "}
            <Link href="/signup" className="text-[var(--soul)] font-semibold">
              {t("auth.signUp") || "가입하기"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
