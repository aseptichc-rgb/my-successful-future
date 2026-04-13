/**
 * 외부 AI 챗봇 레지스트리.
 * 슬래시 명령어로 호출되며, OpenAI Chat Completions API 등 외부 LLM의 응답을
 * 본 채팅방의 어시스턴트 메시지로 통합한다.
 */

export type ExternalBotProvider = "openai";

export interface ExternalBotConfig {
  /** 메시지 personaId 로 사용되는 고유 ID. "ext:" 접두사로 빌트인 페르소나와 충돌 방지. */
  id: string;
  /** 트리거 슬래시 명령어 (소문자, 예: "/gpt"). */
  triggerCommand: string;
  /** 채팅방에 표시되는 이름. */
  name: string;
  /** 이모지 또는 이미지 URL. */
  icon: string;
  provider: ExternalBotProvider;
  /** 호출할 모델 ID. */
  model: string;
  /** 시스템 프롬프트 (Custom GPT 의 instructions 를 복제해 넣을 수 있음). */
  systemPrompt: string;
  /** 사용할 환경 변수 이름. */
  apiKeyEnv: string;
}

export const EXTERNAL_BOTS: ExternalBotConfig[] = [
  {
    id: "ext:gpt",
    triggerCommand: "/gpt",
    name: "ChatGPT",
    icon: "🤖",
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt:
      "당신은 친절하고 박식한 AI 어시스턴트입니다. 항상 한국어로 답합니다. " +
      "정확하지 않은 정보는 추측하지 말고 모른다고 답하세요.",
    apiKeyEnv: "OPENAI_API_KEY",
  },
];

export function getBotById(id: string): ExternalBotConfig | undefined {
  return EXTERNAL_BOTS.find((b) => b.id === id);
}

/**
 * 입력 메시지가 외부 봇 슬래시 명령어인지 감지한다.
 * 매칭되면 봇 설정과 명령어를 제거한 본문 메시지를 반환한다.
 */
export function detectBotCommand(
  input: string
): { bot: ExternalBotConfig; message: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const firstSpace = trimmed.indexOf(" ");
  const cmd = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

  const bot = EXTERNAL_BOTS.find((b) => b.triggerCommand.toLowerCase() === cmd);
  if (!bot) return null;
  if (!rest) return null;

  return { bot, message: rest };
}
