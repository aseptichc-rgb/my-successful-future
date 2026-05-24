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

function AnimaMark({ size = 56, color = "#FFFFFF" }: { size?: number; color?: string }) {
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
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="4" fill={color} />
    </svg>
  );
}

function LogoLockup() {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-24 h-24 rounded-[28px] flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #FF9500 0%, #FF2D55 50%, #AF52DE 100%)",
          boxShadow: "0 12px 28px rgba(175,82,222,0.28)",
        }}
      >
        <AnimaMark size={56} color="#FFFFFF" />
      </div>
      <span
        className="mt-5 text-[36px] font-light tracking-[-0.9px] leading-none text-black inline-flex items-baseline whitespace-nowrap"
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
              background: "#FF9500",
            }}
          />
        </span>
        ma
      </span>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const {
    signIn,
    signInGoogle,
    linkGoogleToEmailPassword,
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

  const [pendingLink, setPendingLink] = useState<{
    email: string;
    pendingCredential: AuthCredential;
  } | null>(null);
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
        setPendingLink({ email: result.email, pendingCredential: result.pendingCredential });
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
      await linkGoogleToEmailPassword(
        pendingLink.email,
        linkPassword,
        pendingLink.pendingCredential,
      );
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F2F7] p-6">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-8">
            <LogoLockup />
            <h2 className="mt-6 text-[22px] font-bold tracking-[-0.45px] text-black">
              {t("auth.link.title")}
            </h2>
            <p className="mt-2 text-[15px] leading-[20px] tracking-[-0.24px] text-[var(--label-2)]">
              {t("auth.link.description", { email: pendingLink.email })}
            </p>
          </div>

          <form onSubmit={handleConfirmLink} className="space-y-3">
            <div className="bg-white rounded-[12px] overflow-hidden">
              <div className="px-4 py-3.5 flex items-center gap-3">
                <span className="w-20 text-[15px] text-[var(--label-2)]">
                  {t("auth.password")}
                </span>
                <input
                  type="password"
                  required
                  autoFocus
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  className="flex-1 bg-transparent text-[17px] tracking-[-0.43px] text-black placeholder:text-[var(--label-3)] focus:outline-none"
                  placeholder={t("auth.password.placeholder")}
                />
              </div>
            </div>

            {error && <p className="text-[13px] text-[#FF3B30]">{error}</p>}

            <button
              type="submit"
              disabled={loading || !linkPassword}
              className="w-full h-[50px] rounded-[12px] bg-[#007AFF] text-white text-[17px] font-semibold tracking-[-0.43px] disabled:opacity-40"
            >
              {loading ? t("auth.signingIn") : t("auth.link.submit")}
            </button>
            <button
              type="button"
              onClick={handleCancelLink}
              disabled={loading}
              className="w-full h-[50px] rounded-[12px] bg-white border border-[var(--sep)] text-black text-[17px] font-semibold tracking-[-0.43px] disabled:opacity-40"
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
    <div className="flex min-h-screen flex-col bg-[#F2F2F7]">
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
            <div className="bg-white rounded-[12px] overflow-hidden">
              <div className="relative flex items-center gap-3 px-4 py-3.5">
                <span className="w-20 text-[15px] text-[var(--label-2)]">
                  {t("auth.email")}
                </span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent text-[17px] tracking-[-0.43px] text-black placeholder:text-[var(--label-3)] focus:outline-none"
                  placeholder="email@example.com"
                />
                <div className="absolute bottom-0 left-[100px] right-0 h-[0.5px] bg-[var(--sep)]" />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="w-20 text-[15px] text-[var(--label-2)]">
                  {t("auth.password")}
                </span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 bg-transparent text-[17px] tracking-[-0.43px] text-black placeholder:text-[var(--label-3)] focus:outline-none"
                  placeholder={t("auth.password.placeholder")}
                />
              </div>
            </div>

            {error && <p className="text-[13px] text-[#FF3B30]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[50px] rounded-[12px] bg-[#007AFF] text-white text-[17px] font-semibold tracking-[-0.43px] disabled:opacity-40"
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

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full h-[50px] rounded-[12px] bg-white border border-[var(--sep)] text-black text-[17px] font-semibold tracking-[-0.43px] inline-flex items-center justify-center gap-2.5 disabled:opacity-40"
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
            <Link href="/signup" className="text-[#007AFF] font-semibold">
              {t("auth.signUp") || "가입하기"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
