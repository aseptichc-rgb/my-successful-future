"use client";

import { useLanguage } from "@/lib/i18n";
import { useSheetHistory } from "@/lib/useSheetHistory";

/* ─────────────────────────────────────────────────────────────
 * Sheet — bottom sheet modal (iOS pattern)
 *   Backdrop dim · rounded top corners · handle · safe area bottom
 *
 * settings 의 로컬 정의를 승격 — WOOP 실행설계 등 다른 화면도 공유(DRY).
 * 히스토리 엔트리 하나를 차지한다(lib/useSheetHistory) — Android 뒤로가기가 앱을 닫는 대신
 * 시트를 먼저 닫는다. 취소·배경 탭도 같은 경로로 닫는다.
 * ───────────────────────────────────────────────────────────── */
export default function Sheet({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const requestClose = useSheetHistory(onClose);
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <button
        type="button"
        onClick={requestClose}
        aria-label="close"
        className="flex-1 bg-black/40"
      />
      <div className="bg-[var(--bg-grouped)] rounded-t-[14px] pb-8 safe-pb max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-2.5 pb-3">
          <div className="w-9 h-[5px] rounded-full bg-[#C7C7CC]" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <button
            type="button"
            onClick={requestClose}
            className="text-[17px] tracking-[-0.43px] text-[var(--soul)]"
          >
            {t("common.cancel")}
          </button>
          <span className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">{title}</span>
          <div className="w-12" />
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}
