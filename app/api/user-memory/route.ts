import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";

export const maxDuration = 30;

interface UpdateMemoryRequest {
  existingMemory?: string;            // 기존 누적 메모리
  recentUserMessages: string[];       // 최근 사용자 메시지들 (메모리 추출 대상)
  userPersona?: string;               // 사용자가 직접 입력한 자기소개 (참고용)
}

const MEMORY_EXTRACTION_PROMPT = `당신은 사용자의 정보를 누적 정리하는 메모리 어시스턴트입니다.

목적: 사용자가 AI와 나눈 대화에서 사용자 본인에 대한 정보를 추출하고, 기존 메모리와 통합하여 업데이트된 메모리를 만듭니다.

추출 대상 (사용자 본인에 대한 정보):
- 직업, 역할, 회사, 산업
- 관심사, 취미, 좋아하는 것
- 목표, 꿈, 현재 고민
- 의견, 가치관, 성향
- 거주지, 가족, 생활 패턴
- 전문 지식 수준, 학습 중인 분야
- 사용자가 명시적으로 공유한 개인 사실

추출 제외:
- 사용자가 던진 질문 자체 (예: "트럼프 관련 뉴스 알려줘" → 트럼프에 관심 있다는 정보가 아닐 수 있음)
- 추측이나 해석 (사실만 기록)
- 일회성 호기심 (반복되거나 강조된 것만)
- 너무 사소한 디테일

작성 규칙:
- 한국어로 작성
- 간결한 명사구나 짧은 문장으로 정리 ("관심사: AI 스타트업, 부동산 투자")
- 카테고리별로 그룹화 (직업, 관심사, 목표, 의견 등)
- 전체 길이 1500자 이내
- 기존 메모리에 새 정보를 추가하거나 갱신만 하세요. 모순되는 새 정보가 나오면 새 정보로 교체합니다.
- 추출할 정보가 전혀 없으면 기존 메모리를 그대로 반환하세요.
- 메모리 외 다른 설명, 인사, 마크다운 형식은 절대 포함하지 마세요. 오직 메모리 본문만 출력하세요.`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateMemoryRequest;
    const { existingMemory = "", recentUserMessages, userPersona } = body;

    if (!recentUserMessages || recentUserMessages.length === 0) {
      return NextResponse.json({ memory: existingMemory });
    }

    // 메시지가 너무 짧으면 추출 가치가 없음
    const meaningfulMessages = recentUserMessages.filter((m) => m.trim().length >= 5);
    if (meaningfulMessages.length === 0) {
      return NextResponse.json({ memory: existingMemory });
    }

    const prompt = `${MEMORY_EXTRACTION_PROMPT}

## 기존 메모리
${existingMemory || "(없음)"}

## 사용자가 직접 작성한 자기소개 (참고용)
${userPersona || "(없음)"}

## 최근 사용자 메시지
${meaningfulMessages.map((m, i) => `${i + 1}. ${m}`).join("\n")}

## 업데이트된 메모리 (1500자 이내, 카테고리별 정리, 본문만 출력):`;

    const updatedMemory = await generateText(prompt, 800);

    // 1500자 안전하게 자르기
    const trimmed = updatedMemory.trim().slice(0, 1500);

    return NextResponse.json({ memory: trimmed });
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    console.error("User memory API error:", errorDetail);
    return NextResponse.json(
      { error: `메모리 업데이트 실패: ${errorDetail}` },
      { status: 500 }
    );
  }
}
