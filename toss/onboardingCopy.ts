import type { Locale } from '../lib/i18n/types';
import { translate, type DictKey, type Translator } from '../lib/i18n/translate';

// The shared onboarding advertises a native widget. Toss users stay in the miniapp.
const copy: Record<Locale, Partial<Record<DictKey, string>>> = {
  ko: {
    'onboarding.step5.subtitleDone': '토스에서 오늘의 한 마디를 확인하고, 작은 실천을 이어가 보세요.',
    'onboarding.step5.widgetTitle': '아니마에서 매일 실천하는 법',
    'onboarding.step5.widgetStep1': '1. 홈에서 오늘의 한 마디와 다짐을 확인해요',
    'onboarding.step5.widgetStep2': '2. 오늘 실천한 일과 하루 기록을 남겨요',
    'onboarding.step5.widgetStep3': '3. 성장 탭에서 쌓인 실천을 돌아봐요',
  },
  en: {
    'onboarding.step5.subtitleDone': 'Read today’s message in Toss and keep taking small steps.',
    'onboarding.step5.widgetTitle': 'Build a daily habit with Anima',
    'onboarding.step5.widgetStep1': '1. Read today’s message and affirmations on Home',
    'onboarding.step5.widgetStep2': '2. Record your actions and reflect on your day',
    'onboarding.step5.widgetStep3': '3. Look back on your actions in Progress',
  },
  es: {
    'onboarding.step5.subtitleDone': 'Lee el mensaje de hoy en Toss y sigue dando pequeños pasos.',
    'onboarding.step5.widgetTitle': 'Crea un hábito diario con Anima',
    'onboarding.step5.widgetStep1': '1. Lee el mensaje y las afirmaciones de hoy en Inicio',
    'onboarding.step5.widgetStep2': '2. Registra tus acciones y reflexiona sobre tu día',
    'onboarding.step5.widgetStep3': '3. Revisa tus acciones en Progreso',
  },
  zh: {
    'onboarding.step5.subtitleDone': '在 Toss 查看今日寄语，继续迈出小小的一步。',
    'onboarding.step5.widgetTitle': '用 Anima 养成每日行动的习惯',
    'onboarding.step5.widgetStep1': '1. 在首页查看今日寄语和自我肯定',
    'onboarding.step5.widgetStep2': '2. 记录今天的行动和每日感想',
    'onboarding.step5.widgetStep3': '3. 在成长页面回顾积累的行动',
  },
};

export function translateToss(locale: Locale, ...[key, vars]: Parameters<Translator>): string {
  return copy[locale][key] ?? translate(locale, key, vars);
}
