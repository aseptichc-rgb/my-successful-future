"use client";

import { useEffect } from "react";

/**
 * 단일 "확인" 버튼 인앱 알림 다이얼로그.
 *
 * window.alert 를 대체한다 — TWA(Chrome) 에서 alert 는 "<origin> 내용:" 헤더가 붙어
 * 앱처럼 보이지 않는다. 결제 성공/복원 등 사용자 안내에 이 컴포넌트를 쓴다.
 * 애플 그룹드 시트 톤의 스타일을 따른다.
 */
interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** success=인디고(긍정), error=주황(경고). 기본 success. */
  tone?: "success" | "error";
  onClose: () => void;
}

export default function NoticeDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  tone = "success",
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      role="alertdialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[18px] bg-white p-6 shadow-apple-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1E1B4B]">
          {title}
        </h2>
        {description && (
          <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.45] tracking-[-0.01em] text-black/64">
            {description}
          </p>
        )}
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className={`rounded-pill px-5 py-2 text-[13px] font-medium tracking-[-0.01em] text-white transition-colors ${
              tone === "error"
                ? "bg-[#D85A30] hover:bg-[#C24E28]"
                : "bg-[#1E1B4B] hover:bg-[#2A2766]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
