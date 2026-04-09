import type { ChatMessage } from "@/types";
import MedicalDisclaimer from "@/components/ui/MedicalDisclaimer";
import NewsCard from "@/components/chat/NewsCard";

interface Props {
  message: ChatMessage;
}

const HEALTHCARE_KEYWORDS = ["의료", "건강", "헬스케어", "병원", "치료", "진단", "의료진 상담"];

function containsHealthcareContent(content: string): boolean {
  return HEALTHCARE_KEYWORDS.some((kw) => content.includes(kw));
}

export default function MessageBubble({ message }: Props) {
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

        {/* 페르소나 표시 */}
        {!isUser && message.personaName && (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <span>{message.personaIcon}</span>
            <span>{message.personaName}</span>
          </div>
        )}

        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>

        {/* 어시스턴트 메시지의 뉴스 카드 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-500">관련 뉴스</p>
            {message.sources.map((source, i) => (
              <NewsCard key={i} source={source} />
            ))}
          </div>
        )}

        {/* 헬스케어 콘텐츠 면책 */}
        {!isUser && containsHealthcareContent(message.content) && (
          <MedicalDisclaimer />
        )}
      </div>
    </div>
  );
}
