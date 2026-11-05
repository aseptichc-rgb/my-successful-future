export const COACH_QUESTION_MAX = 300;
export const COACH_REPLY_MAX = 520;
export const COACH_CONTEXT_TURNS = 2;
export const COACH_DAILY_QUESTION_LIMIT = 3;

export type CoachTurn = { question: string; answer: string };
export type CoachReply = { kind: 'answer' | 'blocked' | 'crisis'; text: string };
export type CoachUsage = { ymd: string; limit: number; remaining: number };
