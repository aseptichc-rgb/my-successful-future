"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { useClientValue } from "@/lib/useClientValue";
import { detectPurchaseEnv } from "@/lib/purchaseEnv";
import { hasProAccess } from "@/lib/entitlement";
import {
  clearPaymentRequired,
  getPaymentRequired,
  subscribePaymentRequired,
} from "@/lib/paymentRequired";

/* ─────────────────────────────────────────────────────────────────
 * ProUpsellSheet — Pro 전용 기능을 눌렀을 때 올라오는 업그레이드 시트.
 *
 * 차단이 아니라 **유도**다. 무료 티어는 오늘의 카드·위젯·다짐 체크인·미션 기록·기록 열람을
 * 계속 쓰고(정책표: lib/constants/quota.ts), 이 시트는 사용자가 AI 개인화 기능을 직접
 * 시도했을 때만 올라온다. 그래서 언제든 닫을 수 있고, 닫아도 앱은 그대로 동작한다.
 *
 * 세 컴포넌트의 역할 분담:
 *   TrialBanner    — 홈 상단의 상시 안내("남은 N일" / "체험이 끝났어요"). 흐름을 끊지 않는다.
 *   ProUpsellSheet — Pro 기능을 시도한 그 순간의 문맥 있는 제안. 닫기 가능.
 *   설정 ANIMA PRO — 실제 결제가 일어나는 곳.
 *
 * 뜨는 조건은 오직 [authedFetch] 가 관측한 402 하나다. 클라이언트가 만료 여부를 스스로
 * 판정하지 않으므로 ENTITLEMENT_REQUIRED 가 꺼져 있으면 이 시트는 존재하지 않는 것과 같다.
 *
 * 결제 UI 를 여기에 새로 만들지 않는다 — 설정의 ANIMA PRO 섹션이 iOS StoreKit / 안드로이드
 * 네이티브 브릿지 / Digital Goods 세 경로를 이미 다 처리하고 있어서, 그 화면으로 보내는 것이
 * 유일하게 중복 없는 방법이다(TrialBanner 의 업그레이드 CTA 와 같은 목적지).
 * ───────────────────────────────────────────────────────────────── */

const PRO_ACCENT = "#D85A30"; // TrialBanner / 설정 ANIMA PRO 섹션과 동일한 강조색.

/** 설정의 ANIMA PRO 섹션으로 스크롤시키는 딥링크(설정 페이지가 ?pro=1 을 읽어 처리). */
const PRO_SECTION_PATH = "/settings?pro=1";

/**
 * 시트를 띄우지 않는 경로.
 *
 * `/settings` 가 핵심이다 — 결제 버튼이 그 안에 있어서, 시트로 덮으면 결제하러 온 사용자를
 * 결제 직전에 가로막는다. 나머지는 결제와 무관한 정적/인증 화면이라 제안이 문맥에 맞지 않는다.
 *
 * `/onboarding` 은 일부러 뺐다: 신규 가입자는 가입 즉시 체험이 켜지므로 여기서 402 를 볼 일이
 * 없고, 체험이 끝난 뒤 다시 들어온 사용자는 "왜 초상이 안 만들어지는지" 를 들어야 한다.
 * (온보딩 안에서 열리는 CoachPanel 도 같은 이유로 이 시트에 안내를 위임한다.)
 */
const SILENT_PREFIXES = [
  "/settings",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/delete-account",
  "/admin",
] as const;

function isSilentPath(pathname: string | null): boolean {
  if (!pathname) return true; // 경로를 모르면 조용히 있는다.
  if (pathname === "/") return true; // 랜딩.
  return SILENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// SSR 스냅샷 — 서버에는 402 이력이 없으므로 항상 false(하이드레이션 불일치 방지).
const getServerSnapshot = () => false;

export default function ProUpsellSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { entitlement } = useAuth();
  // 결제 가능 여부는 클라이언트에서만 참일 수 있다(서버 렌더는 항상 false).
  const canPurchase = useClientValue(detectPurchaseEnv, false);
  const requested = useSyncExternalStore(
    subscribePaymentRequired,
    getPaymentRequired,
    getServerSnapshot,
  );

  const dismiss = useCallback(() => {
    clearPaymentRequired();
  }, []);

  const goToPro = useCallback(() => {
    // 먼저 신호를 내려야 설정 화면에서 시트가 잔상으로 남지 않는다.
    clearPaymentRequired();
    router.push(PRO_SECTION_PATH);
  }, [router]);

  // 결제/복원으로 권한이 살아났다면 띄울 이유가 없다. (렌더 중 clear 를 호출하면 다른
  // 구독자의 렌더 도중 상태를 바꾸게 되므로, 여기서는 그리지 않기만 하고 해제는 하지 않는다.
  // 다음 402 가 없으면 신호는 그대로 남아도 무해하다.)
  if (!requested || hasProAccess(entitlement) || isSilentPath(pathname)) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-upsell-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pt-10 pb-[max(24px,env(safe-area-inset-bottom))] sm:items-center sm:pb-10"
      onClick={dismiss}
    >
      {/* 배경 탭으로 닫히되, 시트 안쪽 탭은 전파를 막아 오작동을 방지. */}
      <div
        className="w-full max-w-[420px] rounded-[20px] bg-[var(--bg-grouped)] px-6 py-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="pro-upsell-title"
          className="text-[22px] font-bold leading-[28px] tracking-[-0.4px] text-[var(--label)]"
        >
          {t("billing.paywall.title")}
        </p>
        <p className="mt-3 text-[15px] leading-[22px] tracking-[-0.24px] text-[var(--label-2)]">
          {t("billing.paywall.desc")}
        </p>

        {canPurchase ? (
          <>
            <button
              type="button"
              onClick={goToPro}
              className="mt-7 w-full rounded-[14px] py-4 text-[17px] font-semibold text-white"
              style={{ background: PRO_ACCENT }}
            >
              {t("billing.paywall.cta")}
            </button>
            <button
              type="button"
              onClick={goToPro}
              className="mt-3 w-full py-2 text-[15px] font-medium text-[var(--label-2)]"
            >
              {t("billing.paywall.restore")}
            </button>
          </>
        ) : (
          <>
            {/* 웹 브라우저에는 결제 수단이 없다 — 버튼을 띄우면 막다른 길이 되므로 안내만. */}
            <p className="mt-6 rounded-[12px] bg-[var(--bg-grouped-2)] px-4 py-3 text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
              {t("billing.paywall.webNotice")}
            </p>
            <button
              type="button"
              onClick={goToPro}
              className="mt-5 w-full rounded-[14px] border border-[var(--sep)] py-4 text-[17px] font-semibold text-[var(--label)]"
            >
              {t("billing.paywall.goSettings")}
            </button>
          </>
        )}

        {/* 닫기는 항상 있다 — 무료로 계속 쓰는 것이 정상 경로이기 때문. */}
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full py-3 text-[15px] font-medium text-[var(--label-2)]"
        >
          {t("billing.paywall.dismiss")}
        </button>
      </div>
    </div>
  );
}
