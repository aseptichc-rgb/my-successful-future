import type { ComponentType } from "react";

// 빌트인 페르소나는 모노크롬 라인 아이콘으로 렌더링.
// 커스텀 페르소나는 사용자가 고른 이모지를 그대로 보여주되 호출부에서 톤다운(opacity)으로 처리.

interface Props {
  personaId: string;
  fallbackEmoji?: string;
  /** 커스텀 페르소나의 사용자 업로드 사진. 있으면 SVG/이모지 대신 이미지로 렌더. */
  photoUrl?: string;
  className?: string;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Briefcase({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}
function BarChart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function Monitor({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
function Bank({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" />
    </svg>
  );
}
function HeartPulse({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M20.8 11.5a5.5 5.5 0 0 0-9.3-3.3 5.5 5.5 0 0 0-9.3 3.9c.4 5.7 9.3 9.4 9.3 9.4s4.6-1.9 7.4-5.5" />
      <path d="M3 12h4l2-3 3 6 2-3h6" />
    </svg>
  );
}
function Newspaper({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 5h13a2 2 0 0 1 2 2v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5z" />
      <path d="M19 8h2v10a2 2 0 0 1-2 2M8 9h7M8 13h7M8 17h5" />
    </svg>
  );
}
function Sparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4zM18 16l.7 1.8L20.5 18.5l-1.8.7L18 21l-.7-1.8L15.5 18.5l1.8-.7L18 16z" />
    </svg>
  );
}
function Star({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L12 3.5z" />
    </svg>
  );
}

const BUILTIN_ICON: Record<string, ComponentType<{ className?: string }>> = {
  default: Newspaper,
  entrepreneur: Briefcase,
  "fund-trader": BarChart,
  "tech-cto": Monitor,
  "policy-analyst": Bank,
  "healthcare-expert": HeartPulse,
  "future-self": Star,
};

export default function PersonaIcon({ personaId, fallbackEmoji, photoUrl, className = "h-5 w-5" }: Props) {
  // 사용자가 업로드한 사진이 최우선 — 컨테이너를 꽉 채우는 둥근 이미지.
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        className={`${className} rounded-full object-cover`}
      />
    );
  }
  const Cmp = BUILTIN_ICON[personaId];
  if (Cmp) return <Cmp className={className} />;
  // 커스텀 페르소나(사진 없음): 사용자가 고른 이모지를 톤다운해 노출
  return (
    <span aria-hidden className="leading-none opacity-80 grayscale">
      {fallbackEmoji || "✨"}
    </span>
  );
}

export function isBuiltinPersonaIcon(personaId: string): boolean {
  return personaId in BUILTIN_ICON;
}
