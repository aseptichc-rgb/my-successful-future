import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/types";
import NewsCard from "@/components/chat/NewsCard";

interface Props {
  message: ChatMessage;
  showPersonaHeader?: boolean;
  /** 커스텀 페르소나의 최신 프로필 사진 (있으면 personaIcon 대신 노출) */
  personaPhotoUrl?: string;
}

/**
 * AI 응답의 마크다운 → Tailwind 클래스 매핑.
 * 프로젝트에 @tailwindcss/typography 가 없어 prose 대신 직접 매핑한다.
 * raw HTML 은 react-markdown 기본 설정상 비활성화돼 있어 XSS 안전.
 */
const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 text-base font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-base font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#1E1B4B] hover:underline"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded-[5px] bg-black/[0.06] px-1.5 py-0.5 text-[13px] tracking-[-0.01em]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-[8px] bg-black/[0.04] p-3 text-[13px] tracking-[-0.01em] text-[#1E1B4B]">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-black/15 pl-3 italic text-black/70">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-black/[0.08]" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-black/10 px-2 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-black/10 px-2 py-1">{children}</td>
  ),
};

// 카카오톡: 시간 표시는 HH:MM (KST 24시간제)
function formatKstTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

function MessageBubble({ message, showPersonaHeader = true, personaPhotoUrl }: Props) {
  const isUser = message.role === "user";
  const isCouncil = !!message.councilGroupId;
  const isCouncilFinal = message.councilRound === 999;
  const isCouncilQuestion = isUser && isCouncil && message.councilRound === 0;

  // Firestore Timestamp 가 아직 서버에서 확정되지 않았을 수 있어 안전하게 처리
  let timeLabel = "";
  try {
    const d = message.createdAt?.toDate?.();
    if (d) timeLabel = formatKstTime(d);
  } catch {
    timeLabel = "";
  }

  // KakaoTalk 말풍선 팔레트 — 사용자=노란색(#FEE500), 상대=흰색+테두리.
  // 꼬리는 "발신자 쪽 상단 코너"를 살짝 줄여 표현한다 (사용자=top-right, 상대=top-left).
  const bubbleClass = isUser
    ? isCouncilQuestion
      ? "bg-black text-white rounded-[18px] rounded-tr-[4px]"
      : "bg-[#FEE500] text-[#1E1B4B] rounded-[18px] rounded-tr-[4px]"
    : isCouncilFinal
      ? "bg-white border border-[#1E1B4B]/30 text-[#1E1B4B] rounded-[18px] rounded-tl-[4px]"
      : isCouncil
        ? "bg-[#F0EDE6] border border-black/[0.04] text-[#1E1B4B] rounded-[18px] rounded-tl-[4px]"
        : "bg-white border border-black/[0.08] text-[#1E1B4B] rounded-[18px] rounded-tl-[4px]";

  const showOuterPersonaName = !isUser && message.personaName && showPersonaHeader;
  const showOuterSenderName = isUser && message.senderName && !isCouncilQuestion;
  const avatarIcon = !isUser && message.personaIcon ? message.personaIcon : null;

  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {/* 좌측 아바타 — AI/상대 메시지에서만. 연속 메시지(헤더 숨김 시)는 자리만 비워둠. */}
      {!isUser && (
        <div className="h-9 w-9 shrink-0">
          {showPersonaHeader && (personaPhotoUrl || avatarIcon) && (
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#F0EDE6] text-[18px] text-[#1E1B4B]">
              {personaPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={personaPhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                avatarIcon
              )}
            </div>
          )}
        </div>
      )}

      <div
        className={`flex max-w-[78%] flex-col ${isUser ? "items-end" : "items-start"}`}
      >
        {/* 페르소나명/카운슬 라운드 — 말풍선 외부 위쪽 (KakaoTalk 패턴) */}
        {showOuterPersonaName && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5 px-1 text-[12px] font-medium tracking-[-0.01em] text-black/60">
            <span>{message.personaName}</span>
            {isCouncil && !isCouncilFinal && typeof message.councilRound === "number" && (
              <span className="rounded-pill bg-black/[0.06] px-1.5 py-0 text-[10px] text-black/70">
                라운드 {message.councilRound}
              </span>
            )}
            {isCouncilFinal && (
              <span className="rounded-pill bg-[#1E1B4B]/10 px-1.5 py-0 text-[10px] text-[#1E1B4B]">
                종합
              </span>
            )}
            {message.scheduledSlot && (
              <span className="rounded-pill bg-black/[0.06] px-1.5 py-0 text-[10px] text-black/60">
                ⏰ {message.scheduledSlot} 정시
              </span>
            )}
          </div>
        )}

        {/* 발신자 이름 — 사용자(그룹/DM)에서만 말풍선 외부 위쪽 */}
        {showOuterSenderName && (
          <div className="mb-1 px-1 text-[12px] font-medium tracking-[-0.01em] text-black/60">
            {message.senderName}
          </div>
        )}

        {/* 말풍선 + 시간 — KakaoTalk 처럼 시간은 말풍선 바깥(발신자 안쪽)에 붙임 */}
        <div
          className={`flex items-end gap-1 ${isUser ? "flex-row-reverse" : "flex-row"}`}
        >
          <div className={`px-3.5 py-2 ${bubbleClass}`}>
            {isCouncilQuestion && (
              <div className="mb-1.5 inline-flex items-center gap-1 rounded-pill bg-white/15 px-2 py-0.5 text-[10px] font-medium tracking-[-0.01em] text-white/90">
                🪑 카운슬 질문
              </div>
            )}

            {isUser ? (
              <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.47] tracking-[-0.022em]">
                {message.content}
              </div>
            ) : (
              <div className="break-words text-[15px] leading-[1.5] tracking-[-0.022em]">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {timeLabel && (
            <span className="mb-0.5 shrink-0 text-[10px] tracking-[-0.01em] text-black/40">
              {timeLabel}
            </span>
          )}
        </div>

        {/* 뉴스 카드 — 말풍선 아래 별도 영역 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 w-full space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-black/40">
              관련 뉴스
            </p>
            {message.sources.map((source, i) => (
              <NewsCard key={i} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
