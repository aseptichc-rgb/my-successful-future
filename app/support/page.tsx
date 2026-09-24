/**
 * /support — 고객지원 (English · 한국어 · Español · 中文).
 *
 * App Store Connect 의 로케일별 "지원 URL" 에 넣는 공개 페이지. 랜딩(/)은 한국어 전용이라
 * 영어·스페인어·중국어 스토어 방문자가 지원 URL 을 누르면 읽을 수 없는 페이지가 열렸다.
 * 스토어 문안 스크립트([scripts/ios-update-metadata.mjs])가 로케일마다 `/support?lang=xx` 를 넣는다.
 *
 * 언어 선택: `?lang=` 쿼리 > Accept-Language 헤더 > 기본 영어(심사관 기본 노출).
 * 서버 렌더링이라 JS 없이도 네 언어가 모두 동작한다(심사 환경 안정성). /delete-account 와 같은 구조.
 *
 * 플랫폼 중립 원칙: iOS 앱(WKWebView) 안에서도 열릴 수 있으므로 타 스토어·타 플랫폼 이름을 쓰지
 * 않는다 (Apple Guideline 2.3.10 — 랜딩에서 실제 거절 사례). 환불은 "설치한 스토어" 로만 안내한다.
 *
 * 앱 화면 경로 표기(설정 → ANIMA PRO → 구매 복원 등)는 lib/i18n 사전의 실제 라벨과 같아야 한다.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { SUPPORTED_LOCALES, isLocale, type Locale } from "@/lib/i18n/types";

const LAST_UPDATED = "2026-09-24";
const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL || "aseptichc@gmail.com";

/** 앱 기본 언어(ko)와 달리 이 페이지는 영어가 기본 — 스토어 심사관과 해외 방문자가 먼저 본다. */
const DEFAULT_LANG: Locale = "en";

/** /delete-account 는 한국어·영어만 있으므로 나머지 언어는 영어판으로 보낸다. */
const DELETE_ACCOUNT_LANG: Record<Locale, "ko" | "en"> = { ko: "ko", en: "en", es: "en", zh: "en" };

export const metadata: Metadata = {
  title: "Support · Anima",
  description:
    "Anima support: contact, purchase restore, widget and notification help, language settings, refunds and account deletion.",
  robots: { index: true, follow: true },
};

interface FaqItem {
  q: string;
  a: string;
}

interface SupportCopy {
  title: string;
  intro: string;
  lastUpdated: string;
  contactTitle: string;
  contactBody: string;
  faqTitle: string;
  faq: FaqItem[];
  linksTitle: string;
  privacy: string;
  terms: string;
  deleteAccount: string;
}

const COPY: Record<Locale, SupportCopy> = {
  en: {
    title: "Support",
    intro:
      "Anima sends you one line a day from your future self, plus a home screen widget, a daily affirmation check-in and a wins journal. If something isn't working, the answers below cover the most common questions, and you can always email us.",
    lastUpdated: "Last updated",
    contactTitle: "Contact",
    contactBody: "Email us and we'll get back to you by email. Please include the language you use in the app and, if relevant, the email of your Anima account.",
    faqTitle: "Frequently asked questions",
    faq: [
      {
        q: "How do I restore a purchase on a new device?",
        a: "Sign in with the same account you used to buy Anima Pro, then open Settings → ANIMA PRO → Restore purchase.",
      },
      {
        q: "The widget doesn't show today's line.",
        a: "Add the Anima widget to your home screen or lock screen, then open the app once after signing in. The widget picks up a new line every midnight. If it stays blank, remove the widget and add it again.",
      },
      {
        q: "I'm not getting the morning notification.",
        a: "In Anima, open Settings → Notifications and turn the morning reminder on. Also check that notifications for Anima are allowed in your device settings.",
      },
      {
        q: "How do I change the language?",
        a: "Settings → Language. The app and your daily line switch together. Anima is available in English, 한국어, Español and 中文.",
      },
      {
        q: "Can I get a refund?",
        a: "Purchases are processed by the store you installed Anima from, so refunds are handled there: open your store's purchase history and choose the Anima Pro purchase. We can't issue refunds directly, but email us if you get stuck.",
      },
      {
        q: "How do I delete my account?",
        a: "Settings → Account → Delete account removes your profile and all of your data immediately. The account deletion page below has the details.",
      },
    ],
    linksTitle: "Policies",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    deleteAccount: "Account deletion",
  },
  ko: {
    title: "고객지원",
    intro:
      "Anima 는 미래의 내가 건네는 하루 한 줄과 홈 화면 위젯, 매일의 다짐 따라쓰기, 잘한 일 기록을 제공합니다. 잘 안 되는 부분이 있다면 아래 자주 묻는 질문을 먼저 확인하시고, 언제든 이메일로 문의해 주세요.",
    lastUpdated: "최종 업데이트",
    contactTitle: "문의하기",
    contactBody: "이메일로 보내 주시면 이메일로 답변드립니다. 앱에서 쓰는 언어와, 필요하다면 Anima 계정 이메일을 함께 적어 주세요.",
    faqTitle: "자주 묻는 질문",
    faq: [
      {
        q: "새 기기에서 구매를 복원하려면?",
        a: "Anima Pro 를 구매한 계정으로 로그인한 뒤 설정 → ANIMA PRO → 구매 복원 을 누르세요.",
      },
      {
        q: "위젯에 오늘의 한 줄이 안 보여요.",
        a: "홈 화면이나 잠금화면에 Anima 위젯을 추가하고, 로그인한 뒤 앱을 한 번 열어 주세요. 위젯은 매일 자정 새 문장으로 바뀝니다. 계속 비어 있으면 위젯을 지웠다가 다시 추가해 보세요.",
      },
      {
        q: "아침 알림이 안 와요.",
        a: "Anima 의 설정 → 알림 에서 아침 알림을 켜 주세요. 기기 설정에서 Anima 알림이 허용돼 있는지도 확인해 주세요.",
      },
      {
        q: "언어를 바꾸려면?",
        a: "설정 → 언어 에서 바꿀 수 있습니다. 앱 화면과 매일의 한 줄이 함께 바뀝니다. 한국어 · English · Español · 中文 을 지원합니다.",
      },
      {
        q: "환불이 가능한가요?",
        a: "결제는 Anima 를 설치한 스토어가 처리하므로 환불도 그 스토어의 구매 내역에서 신청합니다. 저희가 직접 환불을 처리할 수는 없지만, 막히는 부분이 있으면 이메일로 알려 주세요.",
      },
      {
        q: "계정을 삭제하려면?",
        a: "설정 → 계정 → 계정 삭제 를 누르면 프로필과 모든 데이터가 즉시 삭제됩니다. 자세한 내용은 아래 계정 삭제 안내 페이지를 참고하세요.",
      },
    ],
    linksTitle: "정책",
    privacy: "개인정보 처리방침",
    terms: "이용약관",
    deleteAccount: "계정 삭제 안내",
  },
  es: {
    title: "Soporte",
    intro:
      "Anima te envía una frase al día de tu yo del futuro, además de un widget en la pantalla de inicio, una afirmación diaria para reescribir y un diario de logros. Si algo no funciona, las respuestas de abajo cubren las dudas más frecuentes, y siempre puedes escribirnos.",
    lastUpdated: "Última actualización",
    contactTitle: "Contacto",
    contactBody: "Escríbenos por correo y te responderemos por la misma vía. Indica el idioma que usas en la app y, si viene al caso, el correo de tu cuenta de Anima.",
    faqTitle: "Preguntas frecuentes",
    faq: [
      {
        q: "¿Cómo restauro una compra en otro dispositivo?",
        a: "Inicia sesión con la misma cuenta con la que compraste Anima Pro y abre Ajustes → ANIMA PRO → Restaurar compra.",
      },
      {
        q: "El widget no muestra la frase de hoy.",
        a: "Añade el widget de Anima a la pantalla de inicio o de bloqueo y abre la app una vez después de iniciar sesión. El widget cambia de frase cada medianoche. Si sigue vacío, quítalo y vuelve a añadirlo.",
      },
      {
        q: "No recibo la notificación de la mañana.",
        a: "En Anima, abre Ajustes → Notificaciones y activa el recordatorio de la mañana. Comprueba también que las notificaciones de Anima estén permitidas en los ajustes de tu dispositivo.",
      },
      {
        q: "¿Cómo cambio el idioma?",
        a: "Ajustes → Idioma. La app y tu frase diaria cambian juntas. Anima está disponible en Español, English, 한국어 y 中文.",
      },
      {
        q: "¿Puedo pedir un reembolso?",
        a: "Las compras las procesa la tienda desde la que instalaste Anima, así que los reembolsos se gestionan allí: abre el historial de compras de tu tienda y elige la compra de Anima Pro. No podemos emitir reembolsos directamente, pero escríbenos si tienes algún problema.",
      },
      {
        q: "¿Cómo elimino mi cuenta?",
        a: "Ajustes → Cuenta → Eliminar cuenta borra tu perfil y todos tus datos de inmediato. Encontrarás más detalles en la página de eliminación de cuenta, abajo.",
      },
    ],
    linksTitle: "Políticas",
    privacy: "Política de privacidad",
    terms: "Términos del servicio",
    deleteAccount: "Eliminación de cuenta",
  },
  zh: {
    title: "帮助与支持",
    intro:
      "Anima 每天为你送上一句来自未来自己的话，并提供主屏幕小组件、每日肯定语抄写和好事记录。如果遇到问题，可以先看看下面的常见问题，也随时欢迎给我们发邮件。",
    lastUpdated: "最后更新",
    contactTitle: "联系我们",
    contactBody: "请发送邮件给我们，我们会通过邮件回复。请注明你在 App 中使用的语言，必要时也请附上 Anima 账号的邮箱。",
    faqTitle: "常见问题",
    faq: [
      {
        q: "换了新设备，如何恢复购买？",
        a: "用购买 Anima Pro 时的同一账号登录，然后打开 设置 → ANIMA PRO → 恢复购买。",
      },
      {
        q: "小组件不显示今日一句。",
        a: "把 Anima 小组件添加到主屏幕或锁屏，登录后打开一次 App。小组件每天午夜自动更换新句子。如果一直空白，请移除后重新添加。",
      },
      {
        q: "收不到早晨的通知。",
        a: "在 Anima 中打开 设置 → 通知，开启早晨提醒。同时请确认设备设置中已允许 Anima 发送通知。",
      },
      {
        q: "如何切换语言？",
        a: "设置 → 语言。App 界面和每日一句会一起切换。Anima 支持简体中文、English、한국어、Español。",
      },
      {
        q: "可以退款吗？",
        a: "购买由你安装 Anima 的应用商店处理，退款也在该商店的购买记录中申请。我们无法直接退款，但如果遇到困难，请发邮件告诉我们。",
      },
      {
        q: "如何删除账号？",
        a: "设置 → 账户 → 删除账号，会立即删除你的资料和全部数据。详情见下方的账号删除说明页面。",
      },
    ],
    linksTitle: "政策",
    privacy: "隐私政策",
    terms: "服务条款",
    deleteAccount: "账号删除说明",
  },
};

const LANG_LABEL: Record<Locale, string> = { ko: "한국어", en: "EN", es: "ES", zh: "中文" };

/**
 * 언어 결정: 명시적 `?lang=` 가 최우선, 없으면 Accept-Language 첫 항목의 언어 코드로 추정.
 * 어느 것도 아니면 영어 — 심사관(영어권) 기본 노출을 보장.
 */
async function resolveLang(
  searchParams: Promise<{ lang?: string }> | undefined,
): Promise<Locale> {
  try {
    const sp = searchParams ? await searchParams : {};
    const explicit = sp.lang?.toLowerCase();
    if (isLocale(explicit)) return explicit;
    const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
    const primary = accept.split(",")[0]?.trim() ?? "";
    return SUPPORTED_LOCALES.find((code) => primary.startsWith(code)) ?? DEFAULT_LANG;
  } catch {
    // 헤더를 읽을 수 없는 렌더링 경로(정적 생성 등)에서도 페이지는 떠야 한다.
    return DEFAULT_LANG;
  }
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const lang = await resolveLang(searchParams);
  const copy = COPY[lang];
  const deleteAccountHref = `/delete-account?lang=${DELETE_ACCOUNT_LANG[lang]}`;

  return (
    <div className="min-h-screen bg-[#F0EDE6]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pb-6 pt-[calc(env(safe-area-inset-top)+24px)] sm:px-8">
        <Link
          href="/"
          className="text-[14px] font-semibold tracking-[-0.015em] text-[#1E1B4B]"
        >
          Anima
        </Link>
        <LangSwitch active={lang} />
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-4 sm:px-8">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1E1B4B] sm:text-[36px]">
          {copy.title}
        </h1>
        <p className="mt-3 text-[12px] tracking-[-0.01em] text-black/48">
          {copy.lastUpdated}: {LAST_UPDATED}
        </p>
        <p className="mt-5 text-[14px] leading-[1.7] tracking-[-0.01em] text-black/68">
          {copy.intro}
        </p>

        <Section title={copy.contactTitle}>
          {copy.contactBody}
          <p className="mt-2">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-[#1E1B4B] underline"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <Section title={copy.faqTitle}>
          <dl className="space-y-5">
            {copy.faq.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-[#1E1B4B]">{item.q}</dt>
                <dd className="mt-1">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={copy.linksTitle}>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <Link href="/privacy" className="font-semibold text-[#1E1B4B] underline">
                {copy.privacy}
              </Link>
            </li>
            <li>
              <Link href="/terms" className="font-semibold text-[#1E1B4B] underline">
                {copy.terms}
              </Link>
            </li>
            <li>
              <Link href={deleteAccountHref} className="font-semibold text-[#1E1B4B] underline">
                {copy.deleteAccount}
              </Link>
            </li>
          </ul>
        </Section>

        <footer className="mt-12 text-center text-[11px] tracking-[-0.01em] text-black/40">
          © Anima · made for the dream you’re chasing
        </footer>
      </main>
    </div>
  );
}

/* ── 언어 토글 ─────────────────────────────────────────────── */
function LangSwitch({ active }: { active: Locale }) {
  const base =
    "text-[12px] tracking-[-0.01em] px-1.5 py-0.5 rounded-[6px] transition-colors";
  const on = "bg-[#1E1B4B] text-white";
  const off = "text-black/48 hover:text-[#1E1B4B]";
  return (
    <span className="inline-flex items-center gap-1">
      {SUPPORTED_LOCALES.map((code) => (
        <Link
          key={code}
          href={`?lang=${code}`}
          className={`${base} ${active === code ? on : off}`}
          aria-current={active === code ? "page" : undefined}
        >
          {LANG_LABEL[code]}
        </Link>
      ))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-[#1E1B4B]">
        {title}
      </h2>
      <div className="mt-2 text-[14px] leading-[1.7] tracking-[-0.01em] text-black/68">
        {children}
      </div>
    </section>
  );
}
