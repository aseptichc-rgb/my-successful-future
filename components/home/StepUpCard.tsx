"use client";

import { useSyncExternalStore } from "react";
import { createAckStore } from "@/lib/ackStore";
import { useT } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * StepUpCard — 목표 달성 스트릭이 이어졌을 때 한 번만 뜨는 스텝업 제안.
 *
 * 초안은 전부 클라이언트 로컬 계산(lib/goalStepUp — AI 호출 없음)이고, 이 카드는
 * suggestStepUp() 이 초안을 돌려줄 때만 렌더된다. goalStreak 은 "하루에 목표 1개
 * 이상"의 스트릭이라 특정 목표를 지목할 수 없다 — 문구도 목표를 단정하지 않는다.
 *
 * 확인 여부는 "확인한 초안 문자열"로 남긴다(lib/ackStore) — 같은 초안은 다시 뜨지
 * 않고, 목표가 바뀌거나 수량이 더 오르면(초안이 달라지면) 새 제안으로 다시 뜬다.
 * SSR 스냅샷은 null — 초안 문자열 값 공간 밖의 신호라 어떤 초안과도 충돌하지 않고,
 * 서버 렌더에서는 항상 숨겨졌다가 하이드레이션 후에만 실제 판정된다.
 * ───────────────────────────────────────────────────────────────── */

/** "확인한 초안 문자열" — 알림 슬롯(components/home/NoticeSlot)이 자격 판정에 같은 값을 읽는다. */
export const stepUpAckStore = createAckStore<string | null>("anima.stepUp.ack", {
  parse: (raw) => raw ?? "",
  serialize: (value) => value ?? "",
  serverSnapshot: null,
});

/** 초안이 있고, SSR 센티널(null)이 아니며, 아직 확인하지 않은 초안일 때만. */
export function shouldShowStepUp(draft: string | null, ack: string | null): boolean {
  return Boolean(draft) && ack !== null && ack !== draft;
}

export default function StepUpCard({
  draft,
  onApply,
}: {
  /** lib/goalStepUp.suggestStepUp() 의 초안. null 이면 카드 자체를 그리지 않는다. */
  draft: string | null;
  /** [설정으로 이동] — 목표 편집 시트로 보낸다(초안 적용은 사용자가 직접). */
  onApply: () => void;
}) {
  const t = useT();
  const ack = useSyncExternalStore(
    stepUpAckStore.subscribe,
    stepUpAckStore.getSnapshot,
    stepUpAckStore.getServerSnapshot,
  );

  if (!draft || !shouldShowStepUp(draft, ack)) return null;

  const dismiss = () => stepUpAckStore.acknowledge(draft);

  return (
    <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-4">
      <p className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
        {t("stepUp.title")}
      </p>
      <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {t("stepUp.body", { draft })}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            dismiss();
            onApply();
          }}
          className="rounded-full bg-[#1E1B4B] px-4 py-2 text-[15px] font-semibold text-white"
        >
          {t("stepUp.apply")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto text-[15px] font-medium text-[var(--label-3)]"
        >
          {t("stepUp.later")}
        </button>
      </div>
    </div>
  );
}
