import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/types";
import NewsCard from "@/components/chat/NewsCard";

interface Props {
  message: ChatMessage;
  showPersonaHeader?: boolean;
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
      className="text-[#0066cc] hover:underline"
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
    <pre className="my-2 overflow-x-auto rounded-[8px] bg-black/[0.04] p-3 text-[13px] tracking-[-0.01em] text-[#1d1d1f]">
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

function MessageBubble({ message, showPersonaHeader = true }: Props) {
  const isUser = message.role === "user";
  const isCouncil = !!message.councilGroupId;
  const isCouncilFinal = message.councilRound === 999;
  const isCouncilQuestion = isUser && isCouncil && message.councilRound === 0;

  // Apple iMessage 버블 팔레트 — 단일 액센트(Apple Blue)로 수렴
  const bubbleClass = isUser
    ? isCouncilQuestion
      ? "bg-black text-white"
      : "bg-[#0071e3] text-white"
    : isCouncilFinal
      ? "bg-white border border-black/[0.08] text-[#1d1d1f]"
      : isCouncil
        ? "bg-[#f5f5f7] border border-black/[0.04] text-[#1d1d1f]"
        : "bg-[#f5f5f7] text-[#1d1d1f]";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[78%] rounded-[22px] px-4 py-2.5 ${bubbleClass}`}>
        {/* 카운슬 질문 표시 */}
        {isCouncilQuestion && (
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-pill bg-white/15 px-2 py-0.5 text-[10px] font-medium tracking-[-0.01em] text-white/90">
            🪑 카운슬 질문
          </div>
        )}

        {/* 사용자 메시지: 발신자 이름 */}
        {isUser && message.senderName && !isCouncilQuestion && (
          <div className="mb-1 text-[11px] font-semibold tracking-[-0.01em] text-white/85">
            {message.senderName}
          </div>
        )}

        {/* 페르소나 표시 (연속 메시지에서는 첫 번째만) */}
        {!isUser && message.personaName && showPersonaHeader && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold tracking-[-0.01em] text-black/60">
            <span>{message.personaIcon}</span>
            <span>{message.personaName}</span>
            {isCouncil && !isCouncilFinal && typeof message.councilRound === "number" && (
              <span className="rounded-pill bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium text-black/70">
                라운드 {message.councilRound}
              </span>
            )}
            {isCouncilFinal && (
              <span className="rounded-pill bg-[#0071e3]/10 px-2 py-0.5 text-[10px] font-medium text-[#0071e3]">
                종합
              </span>
            )}
            {message.scheduledSlot && (
              <span className="rounded-pill bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium text-black/60">
                ⏰ {message.scheduledSlot} 정시
              </span>
            )}
          </div>
        )}

        {isUser ? (
          <div className="whitespace-pre-wrap text-[15px] leading-[1.47] tracking-[-0.022em] break-words">
            {message.content}
          </div>
        ) : (
          <div className="text-[15px] leading-[1.5] tracking-[-0.022em] break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* 뉴스 카드 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-black/[0.08] pt-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-black/48">
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
