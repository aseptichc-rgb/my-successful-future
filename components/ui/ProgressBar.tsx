/**
 * ProgressBar — 4px 진행바 (성장 단계 등).
 *
 * 트랙/필 색과 접근성 속성(role="progressbar" + aria-value*)을 여기서만 소유한다 —
 * 마크업을 소비처마다 복제하면 a11y 속성이 한쪽만 고쳐지는 드리프트가 생긴다.
 */
export default function ProgressBar({
  pct,
  className,
}: {
  /** 0~100. 범위 밖 값은 클램프한다. */
  pct: number;
  /** 여백 등 배치용 클래스만 — 색/높이는 이 컴포넌트가 소유한다. */
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  return (
    <div
      className={`h-[4px] rounded-full overflow-hidden${className ? ` ${className}` : ""}`}
      style={{ background: "rgba(30,27,75,0.10)" }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, background: "#1E1B4B" }}
      />
    </div>
  );
}
