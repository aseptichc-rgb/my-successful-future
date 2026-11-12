import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES } from './i18n/types';
import { translate } from './i18n/translate';
import { translateToss } from '../toss/onboardingCopy';

describe('Toss onboarding completion', () => {
  it.each(SUPPORTED_LOCALES)('replaces native installation and widget guidance in %s', (locale) => {
    for (const key of ['subtitleDone', 'widgetTitle', 'widgetStep1', 'widgetStep2', 'widgetStep3'] as const) {
      const message = translateToss(locale, `onboarding.step5.${key}`);
      expect(message).not.toBe(translate(locale, `onboarding.step5.${key}`));
      expect(message).not.toMatch(/android|install|instala|widget|위젯|설치|小组件|安装|play\.google|apps\.apple/i);
    }
  });

  it.each(SUPPORTED_LOCALES)('preserves the rest of the shared translations and interpolation in %s', (locale) => {
    expect(translateToss(locale, 'onboarding.step5.start')).toBe(translate(locale, 'onboarding.step5.start'));
    expect(translateToss(locale, 'share.text', { count: 7 })).toBe(translate(locale, 'share.text', { count: 7 }));
  });
});
