"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

export default function SignupPage() {
  const router = useRouter();
  const t = useT();
  const { signUp, signInApple } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Apple OAuth 로 신규 가입.
   * - kind=ok → 첫 진입은 무조건 온보딩(언어 선택부터) 으로 보낸다.
   * - kind=needsLink → 이미 같은 이메일이 이메일/비밀번호 계정으로 존재 →
   *   가입 페이지에서 합치는 UI 를 또 만들기엔 비용이 큰데 사용자는 분명히 기존 사용자다.
   *   /login 으로 보내고 거기서 Apple 버튼 다시 누르면 동일 needsLink 플로우가 떠 본인 인증
   *   후 합쳐진다 (login 페이지에 이미 inline 링크 UI 가 있다).
   */
  const handleApple = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInApple();
      if (result.kind === "cancelled") return;
      if (result.kind === "needsLink") {
        router.push("/login");
        return;
      }
      router.push("/onboarding");
    } catch {
      setError(t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!displayName.trim()) {
      setError(t("auth.error.requireDisplayName"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth.error.invalidPassword"));
      return;
    }

    if (password.length < 6) {
      setError(t("auth.error.invalidPassword"));
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password, displayName);
      // 신규 가입자는 무조건 온보딩(언어 선택부터)을 거치도록
      router.push("/onboarding");
    } catch {
      setError(t("auth.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">{t("auth.signUp.title")}</h1>
          <p className="mt-2 text-gray-500">{t("auth.signUp.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
              {t("auth.displayName")}
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={t("auth.displayName.placeholder")}
            />
          </div>
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
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              {t("auth.password")}
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? t("auth.signingUp") : t("auth.signUp")}
          </button>
        </form>

        {/* 구분선 + Apple — App Store Guideline 5.1.1(v) 의무 노출. */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          {t("auth.or") || "또는"}
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={handleApple}
          disabled={loading}
          aria-label={t("auth.continueWithApple") || "Apple로 계속하기"}
          className="w-full rounded-lg bg-black py-3 text-white font-medium inline-flex items-center justify-center gap-2.5 disabled:opacity-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 384 512" aria-hidden fill="currentColor">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.5 99.1c30-35.6 27.3-68 26.4-79.6-26.5 1.5-57.1 18-74.6 38.3-19.3 21.8-30.6 48.8-28.2 79 28.6 2.2 54.7-12.5 76.4-37.7z" />
          </svg>
          {t("auth.continueWithApple") || "Apple로 계속하기"}
        </button>

        <p className="text-center text-sm text-gray-500">
          {t("auth.signUp.haveAccount")}{" "}
          <Link href="/login" className="text-blue-600 font-medium hover:underline">
            {t("auth.signUp.toSignIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
