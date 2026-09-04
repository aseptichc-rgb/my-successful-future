"use client";

/** 헤더 44px 행 좌측의 뒤로가기(‹ 라벨) — 설정·기록 히스토리 같은 하위 페이지가 공유한다. */
export default function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1 px-1 py-2 text-[17px] tracking-[-0.43px] text-[var(--soul)]"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path d="M14 4l-7 7 7 7" stroke="#D85A30" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
