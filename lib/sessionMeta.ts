import type { ChatSession } from "@/types";

export interface SessionParticipantCounts {
  humans: number;
  advisors: number;
  total: number;
}

// advisorIds 가 저장되지 않은 레거시 AI/미래의 나 세션도 최소 1봇은 있다고 간주한다.
export function getSessionParticipantCounts(session: ChatSession): SessionParticipantCounts {
  const humans =
    session.participants?.length ||
    Object.keys(session.participantNames || {}).length ||
    1;
  const explicitAdvisors = session.advisorIds?.length ?? 0;
  const hasLegacyBot =
    explicitAdvisors === 0 &&
    (session.sessionType === "ai" || session.sessionType === "future-self");
  const advisors = explicitAdvisors + (hasLegacyBot ? 1 : 0);
  return { humans, advisors, total: humans + advisors };
}
