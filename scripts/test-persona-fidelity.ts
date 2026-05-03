// 5-lens scaffolding 적용 후 각 페르소나의 응답 충실도를 빠르게 확인하는 일회성 테스트.
// 실행: npx tsx scripts/test-persona-fidelity.ts
//
// 빌트인 PERSONAS 자체에 인물 정체성(피터 틸·워렌 버핏 등)이 박혀 있고,
// PERSONA_SCAFFOLDINGS가 buildSystemPrompt에서 자동 주입된다. 사용자
// PersonaOverride는 빌트인과 동일한 값이라 호출하지 않는다.

import { readFileSync } from "node:fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildSystemPrompt } from "../lib/prompts";
import { PERSONAS } from "../lib/personas";
import type { BuiltinPersonaId } from "../types";

// ── .env.local 로드 ─────────────────────────────────────
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  console.error(".env.local 로드 실패");
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY 없음");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const MODEL = "gemini-2.5-flash-lite";

interface TestCase {
  personaId: BuiltinPersonaId;
  question: string;
  /** 응답에 한 줄로 드러나야 하는 "필수 렌즈"의 키워드(검증용 힌트). */
  mandatoryLensHint: string;
}

const CASES: TestCase[] = [
  {
    personaId: "entrepreneur",
    question: "요즘 AI 스타트업 거품이라는 얘기가 많이 나오는데, 어떻게 봐요?",
    mandatoryLensHint: "역발상: 다들 ~라고 본다 / 그 반대편",
  },
  {
    personaId: "healthcare-expert",
    question: "노화 역전 약물 임상 결과가 좋다는 기사를 봤어요. 진짜 가까운 미래에 가능한 거예요?",
    mandatoryLensHint: "보도 vs 임상 현실 격차",
  },
  {
    personaId: "fund-trader",
    question: "지금 코스피 분위기 어떻게 보세요? 더 빠질까요, 반등할까요?",
    mandatoryLensHint: "컨센서스 vs 비대칭",
  },
  {
    personaId: "tech-cto",
    question: "GPT-5 나오면 백엔드 개발자 일자리 진짜 위험할까요?",
    mandatoryLensHint: "마케팅 발표 vs 코드·운영 현실",
  },
  {
    personaId: "policy-analyst",
    question: "한국도 AI 규제법을 만든다는데 EU AI Act랑 비슷한 방향인가요?",
    mandatoryLensHint: "비교 선례 (국가명 구체)",
  },
];

async function ask(personaId: BuiltinPersonaId, question: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(
    "전체",
    personaId,
    [personaId],
    undefined,
    undefined,
    undefined,
    { includeStockRules: false }
  );

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: question }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1024,
    },
  });

  return result.response.text();
}

async function main(): Promise<void> {
  for (const c of CASES) {
    const base = PERSONAS[c.personaId];
    const banner = "═".repeat(72);
    console.log(`\n${banner}`);
    console.log(`▶ ${base.icon} ${base.name} (${c.personaId})`);
    console.log(`  Q: ${c.question}`);
    console.log(`  필수 렌즈: ${c.mandatoryLensHint}`);
    console.log(banner);
    try {
      const answer = await ask(c.personaId, c.question);
      console.log(answer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [에러] ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
