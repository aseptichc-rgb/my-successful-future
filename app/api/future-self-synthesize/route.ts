import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";

export const maxDuration = 30;

interface QA {
  question: string;
  answer: string;
}

interface SynthesizeRequest {
  answers: QA[];
  userPersona?: string;
}

const MAX_ANSWER_LEN = 600;
const MAX_TOTAL_ANSWERS = 12;
const MAX_OUTPUT_LEN = 500;

const SYSTEM_PROMPT = `당신은 사용자가 적은 답변을 모아 "10년 후 미래의 나"의 모습을 한 편의 짧은 서술형 글로 정리해 주는 라이팅 코치입니다.

목표: 사용자가 매일 다시 읽었을 때, 마치 이미 그 삶을 살고 있는 듯한 생생함을 느끼게 한다.

작성 규칙:
- 한국어로 출력. 전체 분량은 한국어 250~450자 이내(공백 포함).
- 1인칭 현재형으로 적는다 ("나는 ~한다", "~하고 있다"). 미래형/조건형(~할 것이다, ~하고 싶다)은 절대 쓰지 않는다.
- 사용자의 답변에서 언급된 구체적 사실(직업·장소·금액·시간·관계·습관·감정 등)을 최대한 살린다. 답변에 없는 사실은 새로 만들어내지 않는다.
- 시각·청각·촉각 같은 감각 디테일을 한두 곳에 자연스럽게 끼워 넣어 장면이 그려지도록 한다.
- 자연스러운 단락 1~2개. 항목 나열, 불릿(•/-), 번호, 제목, 마크다운 기호(**, ##, \`)를 절대 쓰지 않는다.
- 답변이 비어 있는 항목은 무시한다. 모든 답변이 거의 비어 있으면, 있는 정보만으로 짧고 따뜻한 한 단락을 만든다.
- 인사·서두·맺음말·메타 설명 ("아래는...", "당신의 미래는...")을 붙이지 않는다. 본문만 출력한다.`;

function buildUserPrompt(answers: QA[], userPersona?: string): string {
  const filtered = answers
    .filter((qa) => qa.answer && qa.answer.trim().length > 0)
    .slice(0, MAX_TOTAL_ANSWERS)
    .map((qa, i) => {
      const a = qa.answer.trim().slice(0, MAX_ANSWER_LEN);
      return `Q${i + 1}. ${qa.question}\nA${i + 1}. ${a}`;
    })
    .join("\n\n");

  return `## 현재 사용자 자기소개 (참고용, 시점은 "지금")
${userPersona?.trim() || "(없음)"}

## 사용자 답변 (10년 후의 모습에 대한 질문/응답)
${filtered || "(거의 비어 있음 — 있는 단서만으로 따뜻한 한 단락을 만들어주세요.)"}

## 출력 (1인칭 현재형, 한국어 250~450자, 1~2 단락, 본문만):`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SynthesizeRequest;
    const { answers, userPersona } = body;

    if (!Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json(
        { error: "answers 배열이 필요합니다." },
        { status: 400 },
      );
    }

    const meaningful = answers.filter((qa) => qa?.answer && qa.answer.trim().length >= 2);
    if (meaningful.length === 0) {
      return NextResponse.json(
        { error: "최소 한 가지 질문에는 답해 주세요." },
        { status: 400 },
      );
    }

    const userPrompt = buildUserPrompt(answers, userPersona);
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

    const raw = await generateText(fullPrompt, 800);
    const cleaned = raw
      .trim()
      // 만일 모델이 마크다운/불릿을 섞어 출력했다면 안전하게 정리
      .replace(/^#+\s*/gm, "")
      .replace(/^[-•*]\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .trim()
      .slice(0, MAX_OUTPUT_LEN);

    if (!cleaned) {
      return NextResponse.json(
        { error: "AI 응답이 비어 있습니다. 다시 시도해 주세요." },
        { status: 502 },
      );
    }

    return NextResponse.json({ description: cleaned });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("future-self-synthesize API error:", detail);
    return NextResponse.json(
      { error: `정리에 실패했어요: ${detail}` },
      { status: 500 },
    );
  }
}
