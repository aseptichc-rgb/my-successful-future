import type { PersonaId, SessionType } from "@/types";

/**
 * 사용자 메시지를 분석하여 가장 적절한 페르소나(들)를 자동 선택한다.
 * 여러 도메인에 걸치는 질문이면 복수 페르소나가 반환된다.
 */

interface RoutingRule {
  personaId: PersonaId;
  keywords: string[];
}

const ROUTING_RULES: RoutingRule[] = [
  {
    personaId: "healthcare-expert",
    keywords: [
      "헬스케어", "디지털헬스", "의료", "병원", "의사", "간호", "약", "신약",
      "임상", "바이오", "제약", "건강", "질병", "진료", "수술", "치료",
      "의료기기", "FDA", "식약처", "백신", "감염", "암", "정신건강",
      "원격의료", "원격진료", "의료AI", "헬스", "health", "medical",
      "biotech", "pharma", "clinical", "healthcare", "digital health",
    ],
  },
  {
    personaId: "tech-cto",
    keywords: [
      "AI", "인공지능", "개발", "프로그래밍", "코딩", "소프트웨어", "하드웨어",
      "클라우드", "서버", "데이터", "머신러닝", "딥러닝", "LLM", "GPT",
      "오픈소스", "깃허브", "API", "앱", "플랫폼", "SaaS", "반도체", "칩",
      "아키텍처", "보안", "해킹", "사이버", "블록체인", "웹3", "메타버스",
      "로봇", "자율주행", "tech", "startup", "IT", "테크", "기술",
      "개발자", "엔지니어", "CTO", "GPU", "CPU",
    ],
  },
  {
    personaId: "fund-trader",
    keywords: [
      "주식", "펀드", "투자", "금리", "환율", "채권", "증시", "코스피",
      "코스닥", "나스닥", "S&P", "다우", "ETF", "IPO", "상장", "배당",
      "PER", "PBR", "밸류에이션", "매수", "매도", "수익률", "포트폴리오",
      "금융", "은행", "보험", "자산", "부동산", "비트코인", "암호화폐",
      "M&A", "인수합병", "market", "stock", "finance", "경제성장",
      "GDP", "인플레이션", "디플레이션", "연준", "한은", "기준금리",
    ],
  },
  {
    personaId: "entrepreneur",
    keywords: [
      "창업", "스타트업", "사업", "비즈니스", "수익모델", "BM", "VC",
      "투자유치", "시리즈A", "시리즈B", "엑싯", "유니콘", "매출", "성장률",
      "시장점유율", "경쟁사", "마케팅", "브랜딩", "고객", "사업계획",
      "프랜차이즈", "이커머스", "커머스", "플랫폼사업", "B2B", "B2C",
      "D2C", "사업기회", "시장진입", "PMF", "린스타트업",
    ],
  },
  {
    personaId: "policy-analyst",
    keywords: [
      "정책", "규제", "법률", "법안", "국회", "정부", "대통령", "총리",
      "장관", "외교", "통상", "무역", "관세", "FTA", "WTO", "UN",
      "NATO", "제재", "선거", "정당", "여당", "야당", "헌법", "판결",
      "대법원", "헌재", "입법", "행정", "공공", "세금", "조세", "복지",
      "노동법", "환경규제", "탄소중립", "ESG", "인허가",
    ],
  },
];

/**
 * 메시지 내용을 분석하여 적절한 페르소나 ID 배열을 반환한다.
 * - future-self 세션에서는 라우팅하지 않음 (기존 동작 유지)
 * - 매칭되는 키워드 수가 많은 순으로 정렬
 * - 매칭이 없으면 default(뉴스봇) 반환
 */
export function routeToPersonas(
  message: string,
  sessionType: SessionType
): PersonaId[] {
  // future-self 세션은 항상 future-self만
  if (sessionType === "future-self") return ["future-self"];

  const lowerMsg = message.toLowerCase();

  // 각 페르소나별 매칭 점수 계산
  const scores: { personaId: PersonaId; score: number }[] = [];

  for (const rule of ROUTING_RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (lowerMsg.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > 0) {
      scores.push({ personaId: rule.personaId, score });
    }
  }

  if (scores.length === 0) {
    // 매칭 키워드가 없으면 뉴스봇이 답변
    return ["default"];
  }

  // 점수 내림차순 정렬
  scores.sort((a, b) => b.score - a.score);

  // 최고 점수 대비 50% 이상인 페르소나만 포함 (관련성 있는 보조 전문가)
  const topScore = scores[0].score;
  const threshold = topScore * 0.5;
  const selected = scores
    .filter((s) => s.score >= threshold)
    .map((s) => s.personaId);

  return selected;
}
