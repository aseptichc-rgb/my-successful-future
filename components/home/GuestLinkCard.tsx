"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { guestLinkDismissStore } from "@/lib/guestNotice";

/* ─────────────────────────────────────────────────────────────────
 * GuestLinkCard — 게스트(익명) 사용자에게 "기록을 지키려면 계정을 연결하세요" 를 알리는 카드.
 *
 * 자격·닫기 판정은 lib/guestNotice(순수) + NoticeSlot 이 맡고, 이 카드는 문구와 두 버튼만.
 *   [계정 연결하기] → /signup (게스트 분기: 새 계정이 아니라 현재 uid 에 로그인 수단을 붙인다)
 *   [나중에]       → 당일 닫기
 * ───────────────────────────────────────────────────────────────── */

export default function GuestLinkCard({ ymd }: { ymd: string }) {
  const t = useT();
  const router = useRouter();

  return (
    <div
      className="mx-4 mt-4 rounded-[12px] px-5 py-4"
      style={{ background: "rgba(30,27,75,0.06)" }}
      role="status"
    >
      <p className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
        {t("guest.card.title")}
      </p>
      <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
        {t("guest.card.body")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/signup")}
          className="rounded-full bg-[#1E1B4B] px-4 py-2 text-[15px] font-semibold text-white"
        >
          {t("guest.card.cta")}
        </button>
        <button
          type="button"
          onClick={() => guestLinkDismissStore.acknowledge(ymd)}
          className="ml-auto text-[15px] font-medium text-[var(--label-3)]"
        >
          {t("guest.card.later")}
        </button>
      </div>
    </div>
  );
}
