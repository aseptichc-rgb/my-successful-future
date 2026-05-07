"use client";

/**
 * AuthProvider 안쪽에서 useAuth() 의 user.language 를 LanguageProvider 의
 * `serverLocale` 로 흘려주는 얇은 브릿지 컴포넌트.
 *
 * 분리 이유:
 *  - LanguageProvider 는 useAuth 를 모르고, AuthProvider 도 LanguageProvider 를
 *    모른다. 그 사이를 잇는 책임을 한 컴포넌트로 격리하면 의존 방향이 깔끔해진다.
 *  - layout.tsx 는 server component 라 hook 호출이 불가 → 클라이언트 wrapper 필요.
 */
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { LanguageProvider, isLocale } from "@/lib/i18n";

export default function LanguageBridge({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // user 가 null 이거나 language 미설정인 경우 LanguageProvider 가 localStorage / 브라우저 언어 fallback.
  const serverLocale = user && isLocale(user.language) ? user.language : null;
  return <LanguageProvider serverLocale={serverLocale}>{children}</LanguageProvider>;
}
