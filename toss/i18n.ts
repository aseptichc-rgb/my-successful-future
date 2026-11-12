import { useCallback } from 'react';
import { useLanguage as useSharedLanguage, type Translator } from '../lib/i18n';
import { translateToss } from './onboardingCopy';

export * from '../lib/i18n';

export function useLanguage() {
  const language = useSharedLanguage();
  const t = useCallback<Translator>((key, vars) => translateToss(language.locale, key, vars), [language.locale]);
  return { ...language, t };
}

export function useT(): Translator {
  return useLanguage().t;
}
