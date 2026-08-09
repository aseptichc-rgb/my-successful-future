"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { useClientValue } from "@/lib/useClientValue";
import { detectPurchaseEnv } from "@/lib/purchaseEnv";
import { computeTrialStatus } from "@/lib/trialStatus";

/* ─────────────────────────────────────────────────────────────────
 * TrialBanner — 홈 상단의 무료 체험 상태 배너.
 *
 *   체험 중         → "남은 무료 체험 N일"  (조용한 안내 + 업그레이드)
 *   만료            → "무료 체험이 끝났어요." (강조 + 업그레이드)
 *   결제완료/정보없음 → 아무것도 그리지 않음.
 *
 * "업그레이드" CTA 는 결제 가능한 환경(iOS/Android 앱)에서만 노출한다 — 웹 브라우저에는
 * 결제 수단이 없어 버튼을 띄우면 막다른 길이 되므로 안내 문구만 보여준다. 탭하면 설정의
 * ANIMA PRO 섹션으로 이동한다(?pro=1 → 자동 스크롤).
 *
 * 판정은 순수 함수 computeTrialStatus 에 위임하고(단위 테스트로 커버), 여기서는 렌더만 한다.
 * 권한/트라이얼 상태는 auth-context 가 게이트와 동일한 readEntitlement 로 파생해 내려준다.
 * ───────────────────────────────────────────────────────────────── */

const PRO_ACCENT = "#D85A30"; // 설정 ANIMA PRO 섹션과 동일한 강조색.

export default function TrialBanner() {
  const router = useRouter();
  const t = useT();
  const { entitlement, trialEndsAt } = useAuth();
  // 결제 가능 여부는 클라이언트 환경에서만 참일 수 있다(서버 렌더는 항상 false → CTA 숨김).
  const canPurchase = useClientValue(detectPurchaseEnv, false);

  const status = computeTrialStatus(entitlement, trialEndsAt);
  if (status.kind === "pro" || status.kind === "none") return null;

  const goToPro = () => router.push("/settings?pro=1");

  const upgradeButton = canPurchase ? (
    <button
      type="button"
      onClick={goToPro}
      className="flex-shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold text-white"
      style={{ background: PRO_ACCENT }}
    >
      {t("billing.upgrade")}
    </button>
  ) : null;

  if (status.kind === "expired") {
    return (
      <div
        role="status"
        className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-[12px] px-5 py-4"
        style={{ background: "rgba(216,90,48,0.10)" }}
      >
        <p className="flex-1 text-[15px] font-semibold tracking-[-0.24px] text-[var(--label)]">
          {t("billing.trialEnded")}
        </p>
        {upgradeButton}
      </div>
    );
  }

  // status.kind === "trial"
  return (
    <div
      role="status"
      className="mx-4 mt-4 flex items-center gap-3 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-3"
    >
      <span
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: PRO_ACCENT }}
        aria-hidden
      />
      <p className="flex-1 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {t("billing.trialBanner", { days: status.daysLeft })}
      </p>
      {canPurchase && (
        <button
          type="button"
          onClick={goToPro}
          className="flex-shrink-0 text-[13px] font-semibold"
          style={{ color: PRO_ACCENT }}
        >
          {t("billing.upgrade")}
        </button>
      )}
    </div>
  );
}
