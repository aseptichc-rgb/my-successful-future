"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useClientValue } from "@/lib/useClientValue";
import { detectPurchaseEnv } from "@/lib/purchaseEnv";
import { PRO_SECTION_PATH } from "@/lib/constants/storeLinks";

/** 설정 ANIMA PRO 섹션·TrialBanner 와 동일한 강조색. */
const PRO_ACCENT = "#D85A30";

/**
 * 잠금 예고 행 — 어떤 기능인지는 밝히지 않고 조건과 진행도만 알린다.
 *
 * 실행 설계(내 꿈 탭)·잘한 일 기록(기록 탭)이 이 한 행을 공유한다.
 * 이름과 설명을 미리 보여주면 "곧 열릴 것"이 아니라 "지금 못 쓰는 것"의 목록이 되고,
 * 목록은 궁금함을 남기지 않는다 — 정체는 열리는 날의 몫이다.
 *
 * 결제 진입점: 이용권은 모든 해금을 첫날부터 통과하므로(lib/entitlement unlocksEverything),
 * "기다리거나, 지금 열거나" 의 선택지를 이 자리에서 준다. 결제 가능한 환경(앱)에서만 버튼을
 * 그리고, 웹에서는 예고 문구만 남긴다.
 */
export default function LockedTeaserRow({
  progress,
  threshold,
}: {
  progress: number;
  threshold: number;
}) {
  const t = useT();
  const router = useRouter();
  const canPurchase = useClientValue(detectPurchaseEnv, false);
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <span className="w-9 flex-shrink-0 text-center text-[17px] leading-[22px]" aria-hidden>
        🔒
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] leading-[20px] font-medium text-[var(--label-2)]">
          {t("unlock.teaser.title")}
        </p>
        <p className="mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
          {t("unlock.teaser.hint")}
        </p>
        <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)]">
          {t("unlock.locked.body", { days: threshold, progress })}
        </p>
        {canPurchase && (
          <button
            type="button"
            onClick={() => router.push(PRO_SECTION_PATH)}
            className="mt-2 text-[13px] font-semibold"
            style={{ color: PRO_ACCENT }}
          >
            {t("unlock.teaser.proCta")}
          </button>
        )}
      </div>
    </div>
  );
}
