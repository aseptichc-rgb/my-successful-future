"use client";

import { useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-[18px] bg-white p-6 shadow-apple-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1d1d1f]">
          {title}
        </h2>
        {description && (
          <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.45] tracking-[-0.01em] text-black/64">
            {description}
          </p>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-pill bg-[#f5f5f7] px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-black/80 transition-colors hover:bg-black/[0.06] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-white transition-colors disabled:opacity-60 ${
              destructive
                ? "bg-[#ff3b30] hover:bg-[#ff453a]"
                : "bg-[#0071e3] hover:bg-[#0077ed]"
            }`}
          >
            {loading && (
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
