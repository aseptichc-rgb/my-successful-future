import type { BuiltinPersonaId, PersonaId } from "@/types";
import { isBuiltinPersona, isCustomPersonaId } from "@/lib/personas";

/**
 * 페르소나별 "추천 키워드 풀".
 * `PERSONA_SPECIALTIES.searchKeywords`(내부 자동 수집용, 짧은 일반 질의)와는 분리된 큐레이션.
 * 사용자가 정시 뉴스 키워드를 고를 때 칩으로 노출된다. 카테고리별로 그룹핑해 UX 정리.
 */
export interface KeywordGroup {
  category: string;
  keywords: string[];
}

const COMMON_KEYWORDS: KeywordGroup[] = [
  {
    category: "시사·국내",
    keywords: ["오늘의 주요 뉴스", "속보", "국내 정치 이슈", "사회 이슈"],
  },
  {
    category: "글로벌",
    keywords: ["글로벌 증시", "미국 금리", "중국 경제", "지정학 리스크"],
  },
];

const PERSONA_KEYWORD_POOL: Record<BuiltinPersonaId, KeywordGroup[]> = {
  default: [
    ...COMMON_KEYWORDS,
    {
      category: "생활",
      keywords: ["날씨", "주요 스포츠 소식", "문화·엔터"],
    },
  ],
  entrepreneur: [
    {
      category: "창업·투자",
      keywords: [
        "스타트업 투자 유치",
        "시드 라운드",
        "시리즈 A",
        "VC 동향",
        "액셀러레이터",
        "유니콘 기업",
      ],
    },
    {
      category: "시장·제품",
      keywords: [
        "신규 런칭",
        "제품-시장 적합성 PMF",
        "피봇 사례",
        "고객 확보 CAC",
        "리텐션",
      ],
    },
    {
      category: "비즈니스 트렌드",
      keywords: ["D2C 브랜드", "구독 경제", "SMB SaaS", "B2B 플랫폼", "크리에이터 이코노미"],
    },
  ],
  "healthcare-expert": [
    {
      category: "디지털 헬스케어",
      keywords: [
        "디지털 치료제",
        "원격 의료",
        "의료 AI",
        "헬스케어 스타트업",
        "웨어러블 디바이스",
      ],
    },
    {
      category: "신약·임상",
      keywords: [
        "신약 개발",
        "FDA 승인",
        "임상 3상 결과",
        "바이오 IPO",
        "항암 신약",
        "희귀질환 치료제",
      ],
    },
    {
      category: "제도·규제",
      keywords: ["의료 수가", "비대면 진료 제도", "바이오 규제", "건강보험 정책"],
    },
  ],
  "fund-trader": [
    {
      category: "매크로",
      keywords: [
        "연준 금리 결정",
        "한국은행 기준금리",
        "달러 환율",
        "국채 금리",
        "CPI 지표",
        "고용지표",
      ],
    },
    {
      category: "국내 증시",
      keywords: ["코스피", "코스닥", "삼성전자", "SK하이닉스", "반도체 수출", "2차전지"],
    },
    {
      category: "해외 증시",
      keywords: ["S&P 500", "나스닥", "엔비디아", "테슬라", "원자재 가격", "유가"],
    },
    {
      category: "딜 & 이벤트",
      keywords: ["IPO 상장", "M&A 딜", "실적 발표", "배당 정책"],
    },
  ],
  "tech-cto": [
    {
      category: "AI",
      keywords: [
        "생성형 AI",
        "LLM 신모델",
        "AI 에이전트",
        "멀티모달",
        "오픈소스 모델",
        "AI 반도체",
      ],
    },
    {
      category: "플랫폼·인프라",
      keywords: ["클라우드 AWS", "쿠버네티스", "엣지 컴퓨팅", "데이터 플랫폼"],
    },
    {
      category: "개발자 생태계",
      keywords: ["개발자 도구", "오픈소스 트렌드", "프로그래밍 언어", "보안 취약점"],
    },
    {
      category: "하드웨어",
      keywords: ["반도체 시황", "AI 가속기", "로보틱스", "양자 컴퓨팅"],
    },
  ],
  "policy-analyst": [
    {
      category: "국내 정책",
      keywords: ["정부 정책", "세제 개편", "부동산 정책", "노동·고용 정책", "복지 제도"],
    },
    {
      category: "규제·법률",
      keywords: ["규제 개혁", "공정거래", "개인정보보호법", "AI 기본법", "플랫폼 규제"],
    },
    {
      category: "국제 정세",
      keywords: ["미중 갈등", "한미 통상", "EU 규제", "일본 정책", "지정학 리스크"],
    },
  ],
  "future-self": [
    {
      category: "성장·동기부여",
      keywords: ["자기계발", "성공 사례", "동기부여", "습관 형성", "시간 관리"],
    },
    {
      category: "커리어",
      keywords: ["커리어 전환", "이직 인사이트", "리더십", "인생 설계"],
    },
  ],
};

/**
 * 빌트인 페르소나면 해당 페르소나의 풀을, 커스텀이면 공통 풀만 반환한다.
 * 사용자가 자유 입력도 가능하므로 추천 풀은 "제안"일 뿐 강제는 아님.
 */
export function getCuratedKeywords(personaId: PersonaId): KeywordGroup[] {
  const id = String(personaId);
  if (isBuiltinPersona(id)) {
    return PERSONA_KEYWORD_POOL[id as BuiltinPersonaId] ?? COMMON_KEYWORDS;
  }
  if (isCustomPersonaId(id)) {
    // 커스텀 멘토는 범용 풀 + 실용 그룹을 노출
    return COMMON_KEYWORDS;
  }
  return COMMON_KEYWORDS;
}
