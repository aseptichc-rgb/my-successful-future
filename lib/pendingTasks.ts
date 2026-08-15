/**
 * "아직 시행하지 못한 과업" 정책 단일 소스 — 순수 함수 모듈 (Firestore·AI 접근 없음).
 *
 * 왜 필요한가: 온보딩은 의도적으로 얇다 — "미래의 나" 8차원 중 `dream` 하나, 다짐 1줄,
 * 목표 1개만 묻고 끝낸다(이탈 방지). 그래서 **시작만 하고 끝내지 못한 과업이 구조적으로 남고**,
 * 그것들은 설정 화면 깊숙이 있어 존재조차 발견되지 않는다. 이 모듈이 그 목록을 도출한다.
 *
 * 발송은 lib/notificationPolicy.ts 의 저녁 슬롯 판정을 탄다 — 오늘 할 일을 이미 다 해서
 * 저녁 리마인더가 **침묵하는 날의 빈 슬롯만** 쓰므로 하루 최대 2건 가드레일이 유지된다.
 *
 * ⚠️ lib/dailyMotivation.ts 의 hash32 를 import 하면 클라이언트 번들에 firebase-admin 이
 *    딸려 들어온다 — lib/planRotation.ts 의 admin 무의존 fnv1a 만 쓴다(같은 파일 5행 주석).
 */
import { FUTURE_SELF_DIMENSIONS, normalizeFutureSelfAnswers } from "@/lib/futureSelf";
import { fnv1a } from "@/lib/planRotation";
import type { DictKey } from "@/lib/i18n/translate";
import type { FutureSelfAnswers, NotificationTapTarget } from "@/types";

export type PendingTaskId = "goals" | "futureSelf" | "affirmations" | "portrait" | "plan";

/**
 * "채웠다" 로 볼 최소 개수. 전부 명명 상수 — 알림이 언제 멈추는지가 곧 정책이라
 * 숫자가 코드에 박히면 나중에 어디를 고쳐야 하는지 알 수 없게 된다.
 */
/** 미래의 나 8차원 중 이만큼 채우면 "충분히 적었다"로 본다(전부 강요하지 않는다). */
export const FUTURE_SELF_TARGET_ANSWERS = 3;
/** 다짐 목표 개수 — 회전 따라쓰기가 의미를 가지려면 최소 이 정도는 있어야 한다. */
export const AFFIRMATION_TARGET_COUNT = 3;
/** 목표는 하나만 있어도 앱의 핵심 루프(오늘 목표 체크)가 돈다. */
export const GOAL_TARGET_COUNT = 1;
/** WOOP 실행설계도 하나만 있으면 "오늘의 if-then" 회전이 시작된다. */
export const PLAN_TARGET_COUNT = 1;

export interface PendingTask {
  id: PendingTaskId;
  /** 진행도 — 알림 본문에 숫자로만 보간한다(원문은 절대 싣지 않는다). */
  filled: number;
  total: number;
  /** 알림 본문 i18n 키. */
  bodyKey: DictKey;
  /** 탭 시 열 화면. */
  target: NotificationTapTarget;
}

/**
 * 판정 입력 — 클라(useAuth 의 User)와 서버(Admin 스냅샷) 양쪽이 같은 모양으로 넘긴다.
 * User 타입을 직접 받지 않는 이유: 서버는 Firestore raw 문서를 들고 있고 클라는 변환된
 * User 를 들고 있어, 어느 한쪽에 맞추면 반대쪽이 억지 변환을 하게 된다.
 */
export interface PendingTaskInput {
  futureSelfAnswers?: FutureSelfAnswers;
  successAffirmations?: string[];
  /** users/{uid}.futureSelfPortrait 존재 여부. */
  hasPortrait: boolean;
  goals?: string[];
  /** users/{uid}/executionPlans 문서 수. */
  executionPlanCount: number;
}

/** 공백만 있는 값은 "채움"으로 세지 않는다 — 빈 문자열 저장이 넛지를 조용히 끄면 안 된다. */
function countNonEmpty(raw: string[] | undefined): number {
  if (!Array.isArray(raw)) return 0;
  return raw.filter((v) => typeof v === "string" && v.trim().length > 0).length;
}

/**
 * 아직 끝내지 못한 과업 목록 — 고정 우선순위 순서.
 * 순서 근거: 목표가 없으면 앱의 핵심 루프(오늘 목표 체크)가 아예 돌지 않으므로 최우선.
 * 그 다음이 개인화의 재료(미래의 나 → 다짐), 그로부터 파생되는 보상(초상), 마지막이 심화(실행설계).
 */
export function listPendingTasks(input: PendingTaskInput): PendingTask[] {
  const tasks: PendingTask[] = [];

  const goalCount = countNonEmpty(input.goals);
  if (goalCount < GOAL_TARGET_COUNT) {
    tasks.push({
      id: "goals",
      filled: goalCount,
      total: GOAL_TARGET_COUNT,
      bodyKey: "notify.pending.goals.body",
      target: "settings-goals",
    });
  }

  // 초상 재생성 판정(sourceHash)과 같은 기준으로 세야 한다 — 여기서만 다르게 세면
  // "답변을 채웠는데 계속 채우라고 한다" 는 모순이 생긴다.
  const answerCount = Object.keys(normalizeFutureSelfAnswers(input.futureSelfAnswers ?? {})).length;
  const futureSelfPending = answerCount < FUTURE_SELF_TARGET_ANSWERS;
  if (futureSelfPending) {
    tasks.push({
      id: "futureSelf",
      filled: answerCount,
      total: FUTURE_SELF_DIMENSIONS.length,
      bodyKey: "notify.pending.futureSelf.body",
      target: "settings-future-self",
    });
  }

  const affirmationCount = countNonEmpty(input.successAffirmations);
  if (affirmationCount < AFFIRMATION_TARGET_COUNT) {
    tasks.push({
      id: "affirmations",
      filled: affirmationCount,
      total: AFFIRMATION_TARGET_COUNT,
      bodyKey: "notify.pending.affirmations.body",
      target: "settings-affirmations",
    });
  }

  // 초상은 답변이 쌓여야 만들어지는 **보상**이다. 답변이 아직 모자란 상태에서
  // "초상이 없다"고 알리면 무엇을 하라는 건지 알 수 없으므로 그때는 넣지 않는다.
  if (!futureSelfPending && !input.hasPortrait) {
    tasks.push({
      id: "portrait",
      filled: 0,
      total: 1,
      bodyKey: "notify.pending.portrait.body",
      target: "settings-future-self",
    });
  }

  if (input.executionPlanCount < PLAN_TARGET_COUNT) {
    tasks.push({
      id: "plan",
      filled: input.executionPlanCount,
      total: PLAN_TARGET_COUNT,
      bodyKey: "notify.pending.plan.body",
      target: "home",
    });
  }

  return tasks;
}

/**
 * 오늘 알릴 과업 **한 개**를 고른다. 여러 개를 나열한 알림은 읽히지 않는다.
 *
 * 우선순위 최상단을 고정 노출하지 않고 (uid, ymd) 시드로 회전시키는 이유: 상단 과업 하나가
 * 몇 주씩 안 채워지면 같은 문구만 반복돼 알림 피로 → opt-out 으로 직결된다. 회전이면
 * 밀린 과업들이 돌아가며 노출된다. 같은 (uid, ymd) 는 항상 같은 결과 — Android(런타임 판정)와
 * iOS(예약 시점 판정)가 저장소 없이 같은 답을 낸다.
 */
export function pickPendingTask(
  input: PendingTaskInput,
  uid: string,
  ymd: string,
): PendingTask | null {
  const tasks = listPendingTasks(input);
  if (tasks.length === 0) return null;
  return tasks[fnv1a(`${uid}|${ymd}|pendingTask`) % tasks.length];
}
