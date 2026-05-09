"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AuthCredential } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import Logo from "@/components/ui/Logo";
import { useT } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const { signIn, signInGoogle, linkGoogleToEmailPassword, firebaseUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && firebaseUser) {
      router.replace("/home");
    }
  }, [authLoading, firebaseUser, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Google 로그인 결과가 needsLink 인 경우, 사용자가 기존 비밀번호로 인증해 두 provider 를
  // 한 uid 에 묶을 때까지의 보류 상태. 비번 입력 폼은 이 값이 있을 때만 노출된다.
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
        // 기존 이메일/비밀번호 계정과 같은 이메일 — 비밀번호 입력 폼을 띄워 연결을 유도.
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

  if (pendingLink) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-anima">
          <div className="flex flex-col items-center text-center">
            <Logo variant="lockup" tone="light" size={36} priority />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">{t("auth.link.title")}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t("auth.link.description", { email: pendingLink.email })}
            </p>
          </div>

          <form onSubmit={handleConfirmLink} className="space-y-5">
            <div>
              <label htmlFor="linkPassword" className="block text-sm font-medium text-gray-700">
                {t("auth.password")}
              </label>
              <input
                id="linkPassword"
                type="password"
                required
                autoFocus
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t("auth.password.placeholder")}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !linkPassword}
              className="w-full rounded-lg bg-blue-600 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? t("auth.signingIn") : t("auth.link.submit")}
            </button>
            <button
              type="button"
              onClick={handleCancelLink}
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 bg-white py-3 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {t("auth.link.cancel")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-anima">
        <div className="flex flex-col items-center text-center">
          <Logo variant="lockup" tone="light" size={36} priority />
          <p className="mt-3 text-anima-caption">{t("auth.signIn.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={t("auth.password.placeholder")}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white py-3 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {t("auth.signInWithGoogle")}
        </button>

        <p className="text-center text-sm text-gray-500">
          {t("auth.signIn.noAccount")}{" "}
          <Link href="/signup" className="text-blue-600 font-medium hover:underline">
            {t("auth.signIn.toSignUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
