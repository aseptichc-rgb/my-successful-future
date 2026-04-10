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
      className="text-blue-600 underline"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    // 인라인 코드(언어 클래스 없음)와 블록 코드 구분
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-gray-200 px-1 py-0.5 text-xs">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded bg-gray-800 p-2 text-xs text-gray-100">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-300 pl-3 italic text-gray-600">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 px-2 py-1 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 px-2 py-1">{children}</td>
  ),
};

export default function MessageBubble({ message, showPersonaHeader = true }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        {/* 사용자 메시지: 발신자 이름 표시 (다중 사용자 대화 시) */}
        {isUser && message.senderName && (
          <div className="mb-1 text-xs font-semibold text-blue-200">
            {message.senderName}
          </div>
        )}

        {/* 페르소나 표시 (연속 메시지에서는 첫 번째만 표시) */}
        {!isUser && message.personaName && showPersonaHeader && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <span>{message.personaIcon}</span>
            <span>{message.personaName}</span>
          </div>
        )}

        {isUser ? (
          // 사용자 메시지는 마크다운 해석 없이 원문 그대로
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </div>
        ) : (
          // AI 응답은 마크다운 렌더링
          <div className="text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* 어시스턴트 메시지의 뉴스 카드 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500">관련 뉴스</p>
            {message.sources.map((source, i) => (
              <NewsCard key={i} source={source} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
