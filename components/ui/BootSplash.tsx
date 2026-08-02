"use client";

/**
 * 앱 부팅 스플래시 — 앱을 켜면 가장 먼저, 가장 크게 보이는 한 문장.
 *
 * 콜드 스타트(TWA /home · 첫 실행 /onboarding) 에서 인증 복원이 끝날 때까지 보이는 화면이다.
 * 예전에는 작은 스피너 하나만 돌았지만, 사용자가 앱에서 가장 먼저 마주하는 순간이므로
 * 이 제품의 한 문장("당신의 미래는 당신이 믿는 대로 이루어진다") 을 크게 보여준다.
 *
 * 아트디렉션: anima-ig-01-obsidian-gold.png (인스타 포스터) 를 그대로 옮겼다 —
 * 흑요석 배경 · 크림 세리프 헤드라인 · 마지막 한 단어만 골드 이탤릭 · 번트오렌지 아이브로우 ·
 * 골드 헤어라인. 포스터 비트맵을 깔지 않고 CSS 로 재현한 이유는 [boot-splash] 유틸 주석 참고.
 * 색·폰트 토큰은 app/globals.css 의 --boot-* / --font-serif 한 곳에만 있다.
 *
 * 설계 메모:
 *  - 문장이 주인공이다. 로고 락업은 상단 모서리에 작게 둔다.
 *  - /home · /onboarding 은 클라이언트 컴포넌트지만 SSR 도 이 게이트를 그리므로,
 *    하이드레이션 이전 첫 페인트부터 문장이 보인다(= "처음에 크게" 요구의 핵심).
 *  - 문구는 lead(크림) + accent(골드) 두 조각으로 쪼개 사전에 둔다 — 언어마다 강조할
 *    단어의 위치가 다르기 때문(한국어는 서술어가 끝, 영어는 목적어가 끝).
 *  - 번역 Provider 가 없거나 키가 비어도 useLanguage 가 한국어로 폴백한다.
 *  - 안드로이드 네이티브(ui/BootSplash.kt) · iOS 셸(ios-webview-shell/index.html) 이
 *    같은 화면을 그린다. 문구·색을 바꿀 땐 세 곳을 함께 바꿔야 전환이 이어져 보인다.
 */
import { useLanguage } from "@/lib/i18n";

/** 포스터의 아페르튀르 마크 — 골드 링 + 소울 오렌지 점. 어두운 배경 위라 배경 rect 없이 그린다. */
function ApertureMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <path
        d="M 55.845 8.409 A 42 42 0 1 1 44.155 8.409"
        stroke="var(--boot-gold)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="5" fill="var(--boot-ember)" />
    </svg>
  );
}

/** 이탤릭이 어울리는 로케일 — 한글·한자는 시스템이 기울임을 합성해 글자가 뭉개진다(골드만 쓴다). */
const ITALIC_ACCENT_LOCALES = new Set(["en", "es"]);

export default function BootSplash() {
  const { t, locale } = useLanguage();
  const lead = t("splash.lead");
  const accent = t("splash.accent");
  const accentItalic = ITALIC_ACCENT_LOCALES.has(locale);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${lead} ${accent}`}
      className="boot-splash relative flex min-h-screen w-full flex-col justify-end px-7 pb-[16vh]"
    >
      {/* 상단 브랜드 락업 — 포스터 좌상단과 같은 자리. */}
      <div className="boot-fade-in absolute left-7 top-[max(26px,calc(env(safe-area-inset-top)+18px))] flex items-center gap-2.5">
        <ApertureMark />
        <span className="font-serif text-[19px] tracking-[-0.005em] text-[var(--boot-cream)]">
          anima
        </span>
      </div>

      <p className="boot-fade-in text-[11px] font-medium tracking-[0.3em] text-[var(--boot-ember)] uppercase">
        {t("splash.eyebrow")}
      </p>

      {/* break-keep: 한국어를 단어 중간에서 끊지 않는다(“이루어진/다.” 방지).
          강조 조각은 nowrap 으로 통째로 한 줄에 남긴다 — 마지막 한 단어가 쪼개지면 힘이 죽는다. */}
      <p className="boot-fade-in boot-fade-in-delay mt-5 font-serif text-[36px] leading-[1.18] tracking-[-0.015em] break-keep text-[var(--boot-cream)] sm:text-[46px]">
        {lead}{" "}
        <span
          className={`whitespace-nowrap text-[var(--boot-gold)] ${accentItalic ? "italic" : ""}`}
        >
          {accent}
        </span>
      </p>

      <div aria-hidden className="boot-rule mt-9 h-px w-full max-w-[440px]" />

      <div className="mt-7 flex items-center gap-3">
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-white/12 border-t-[var(--boot-gold)]"
        />
        <span className="text-[10px] tracking-[0.28em] text-white/35 uppercase">anima</span>
      </div>
    </div>
  );
}
