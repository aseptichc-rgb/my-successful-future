import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";

export const maxDuration = 30;

interface UpdatePersonaMemoryRequest {
  personaId: string;
  personaName: string;
  existingMemory?: string;
  recentExchanges: { role: "user" | "assistant"; content: string }[];
}

const MEMORY_EXTRACTION_PROMPT = `당신은 특정 전문가(페르소나)와 사용자 사이의 대화 맥락을 누적 정리하는 메모리 어시스턴트입니다.

목적: 사용자가 이 특정 전문가와 나눈 대화에서, "이 전문가만의 관점에서 기억할 만한 맥락"을 추출해 기존 메모리와 통합합니다.

추출 대상 (이 전문가 관점에서 의미 있는 것들):
- 사용자가 이 전문가에게 반복적으로 물어보는 주제
- 사용자가 이 분야에서 가진 고민, 의사결정 딜레마
- 사용자가 이 분야에서 공유한 상황 (예: 사업 아이디어, 투자 포지션, 개발 프로젝트 등)
- 사용자가 이 전문가에게 받은 조언 중 실제로 실행한 것
- 사용자의 이 분야에 대한 의견·선호·가치관

추출 제외:
- 다른 분야의 일반 정보 (예: 금융 애널리스트 메모리에 헬스케어 이야기 넣지 말 것)
- 한 번만 언급된 가벼운 호기심
- 추측이나 해석 (사실만)
- 이미 userMemory 전역 메모리에 있을 법한 일반 개인 정보

작성 규칙:
- 한국어로 작성
- 짧은 명사구/문장으로 정리
- 카테고리나 토픽별로 그룹화 가능
- 전체 길이 1000자 이내
- 기존 메모리에 새 정보를 추가하거나 갱신. 모순되는 새 정보가 나오면 새 정보로 교체.
- 추출할 정보가 전혀 없으면 기존 메모리를 그대로 반환.
- 메모리 외 다른 설명, 인사, 마크다운 금지. 오직 메모리 본문만 출력.`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdatePersonaMemoryRequest;
    const { personaId, personaName, existingMemory = "", recentExchanges } = body;

    if (!personaId || !recentExchanges || recentExchanges.length === 0) {
      return NextResponse.json({ memory: existingMemory });
    }

    const meaningful = recentExchanges.filter((m) => m.content.trim().length >= 5);
    if (meaningful.length === 0) {
      return NextResponse.json({ memory: existingMemory });
    }

    const dialogue = meaningful
      .map((m, i) => {
        const who = m.role === "user" ? "사용자" : personaName;
        return `${i + 1}. [${who}] ${m.content.slice(0, 300)}`;
      })
      .join("\n");

    const prompt = `${MEMORY_EXTRACTION_PROMPT}

## 전문가 페르소나
${personaName}

## 기존 메모리 (이 전문가 관점)
${existingMemory || "(없음)"}

## 최근 대화 (사용자 ↔ ${personaName})
${dialogue}

## 업데이트된 메모리 (1000자 이내, 본문만 출력):`;

    const updated = await generateText(prompt, 600);
    const trimmed = updated.trim().slice(0, 1000);

    return NextResponse.json({ memory: trimmed });
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("Persona memory API error:", errorDetail);
    return NextResponse.json(
      { error: `페르소나 메모리 업데이트 실패: ${errorDetail}` },
      { status: 500 }
    );
  }
}
