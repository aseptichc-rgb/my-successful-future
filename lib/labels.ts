/**
 * UI 라벨 사전.
 *
 * 원칙:
 * - 이 파일은 **사용자에게 노출되는 텍스트**만 관리한다.
 * - 코드·타입·Firestore 스키마·API 경로의 "persona" 같은 내부 용어는 그대로 둔다.
 *   (리네이밍 하면 데이터 마이그레이션 부담이 생기고 회귀 위험이 크다)
 * - 한 곳에 모으는 이유:
 *   1) 톤 앤 매너 일관성 (자문단/AI 비서/미래의 나 표현 통일)
 *   2) 나중 A/B 테스트나 국제화 시 한 파일만 건드리면 됨
 *
 * 사용법:
 *   import { LABELS } from "@/lib/labels";
 *   <h2>{LABELS.advisors}</h2>
 */

export const LABELS = {
  // 앱 브랜딩
  appName: "Anima",
  appTagline: "미래의 나와 자문단, 당신만을 위한 대화",

  // 주요 영역
  advisors: "자문단",
  advisorsHint: "분야별 AI 전문가에게 조언을 구해보세요",
  myAdvisors: "내 자문단",
  customMentor: "내 멘토",
  futureSelf: "미래의 나",
  futureSelfHint: "5년·10년 뒤 되고 싶은 내가 오늘의 나에게 메시지를 보냅니다",
  currentSelf: "현재의 나",
  currentSelfHint: "내가 어떤 사람인지, AI가 대화에 반영하도록 알려주세요",

  // 설정
  settings: "설정",
  settingsHint: "내 프로필과 자동 메시지를 한 곳에서",
  dailyRitual: "데일리 리추얼",
  dailyRitualHint: "아침·저녁에 미래의 나가 먼저 말을 걸어줍니다",
  accountAndTopics: "계정과 관심사",

  // 액션
  edit: "편집",
  save: "저장",
  cancel: "취소",
  clear: "초기화",
  next: "다음",
  back: "이전",
  skip: "건너뛰기",
  done: "완료",
  start: "시작하기",
} as const;

export type LabelKey = keyof typeof LABELS;
