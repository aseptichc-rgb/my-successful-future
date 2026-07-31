# 실행 설계 잠금·해금과 뇌과학 인트로 — 설계

- 날짜: 2026-07-31
- 상태: 승인됨

## 배경

지금 홈의 "더 보기" 안에는 실행 설계가 없는 사용자에게 CTA 한 줄이 상시 노출된다 —
"오늘의 실행 설계를 만들어보세요"(`plan.today.emptyCta`). 두 가지 문제가 있다.

**1. 처음부터 노출된다.** 앱을 막 시작한 사람에게 "WOOP 실행 설계"는 맥락 없는 숙제다.
이 앱의 다른 복잡도는 전부 꾸준함으로 벌어서 연다 — 목표 칸은 1개로 시작해 7·21·45·66일에
하나씩 열리고(`lib/goalSlots.ts`), 스텝업 제안은 목표 달성 7일 연속에만 나타난다
(`lib/goalStepUp.ts`). 실행 설계만 첫날부터 열려 있어 이 원칙에서 혼자 떨어져 있다.

**2. CTA 목적지가 맥락을 잃는다.** `components/home/MoreSection.tsx`가 `onOpenSettings`
(= `router.push("/settings")`)를 넘겨서, 탭하면 설정 화면 **맨 위**에 떨어진다. 실행 설계
섹션은 `app/settings/page.tsx` 한참 아래에 있어 사용자는 자기가 누른 것과 무관한 화면을
본다. 오류가 아니라 딥링크 누락이다 — 설정은 이미 `?sheet=goals` / `?sheet=affirmations`
딥링크를 갖고 있는데(`app/settings/page.tsx`의 `sheet` 파라미터 처리), 실행 설계만 빠져 있다.

**3. 왜 하는지가 어디에도 없다.** `woop.section.footer`("장애물을 미리 정해두면 실행 확률이
크게 올라가요.") 한 줄이 전부고, 그마저 설정 화면에만 있다. 낯선 개념을 근거 없이 시키면
거부감이 남는다.

이 설계는 셋을 함께 해결한다: **꾸준함으로 열고, 열린 뒤엔 한 번에 도달하며, 왜 하는지를
읽을 수 있게 한다.**

## 스키마

**변경 없다.** Firestore 필드도, 보안 규칙도 건드리지 않는다. 해금 판정에 필요한 값
(`users/{uid}.affirmationStreak`, `users/{uid}.goalStreak`, `users/{uid}/executionPlans`)이
이미 홈과 설정에 구독돼 있다. 해금 상태를 서버 필드로 저장하지 않는 이유는 저장할 것이
없기 때문이다 — 기존 값으로 전부 계산된다.

## 1. 해금 규칙 — `lib/planUnlock.ts` (신규, 순수 모듈)

```ts
export type PlanUnlockState =
  | { kind: "hidden" }                                   // 설계할 목표가 없음
  | { kind: "locked"; progress: number; threshold: number }
  | { kind: "open" };

export function computePlanUnlock(opts: {
  affirmation?: StreakCounter | null;
  goal?: StreakCounter | null;
  goalCount?: number;
  planCount?: number;
}): PlanUnlockState;
```

판정 순서:

1. `goalCount === 0 && planCount === 0` → `hidden`.
   설계할 대상이 없는데 잠금 행을 보여주면 "열려도 할 게 없는 칸"이 된다.
   `components/woop/ExecutionPlansSection.tsx`가 이미 쓰는 것과 같은 규칙이다.
2. `planCount > 0` → `open`. **이미 쓰던 기능을 회수하지 않는다.**
   `computeGoalSlots`의 `unlocked = max(earned, existing)` 보존 규칙과 같은 이유다 —
   이미 얻은 것을 뺏으면 그건 처벌이고, 처벌은 재시작을 막는다.
3. `progress >= PLAN_UNLOCK_STREAK` → `open`, 아니면 `locked`.

`progress` = `max(bestStreakCount(affirmation), bestStreakCount(goal))`.
`bestStreakCount`는 `lib/goalSlots.ts`에서 **import 한다** — 같은 판정 함수를 두 번 정의하면
한쪽만 고쳐지는 날이 온다(DRY). 이 함수는 `Math.max(bestCount, count)`라 `bestCount`가 없는
레거시 문서와 `bestCount < count`인 손상 문서 양쪽에서 이미 연 것을 잠그지 않는다.

현재 연속일이 아니라 **역대 최고 연속일** 기준이므로, 스트릭이 한 번 끊겨도 실행 설계가
다시 잠기지 않는다.

### 상수

`lib/constants/growth.ts`에 추가한다 (`STEPUP_MIN_STREAK` 옆 — 같은 성격의 성장 게이트 값).

```ts
/** 실행 설계를 여는 최소 "역대 최고 연속일"(다짐 전사·목표 달성 두 축 중 큰 값).
 *  GOAL_SLOT_THRESHOLDS[1] 과 같은 7일 — 두 번째 목표 칸이 열리는 순간과 리듬을 맞춘다. */
export const PLAN_UNLOCK_STREAK = 7;
```

`GOAL_SLOT_THRESHOLDS[1]`을 참조하지 않고 독립 상수로 두는 이유: 목표 칸 임계값과 실행 설계
해금 시점은 지금 우연히 같을 뿐 서로 다른 정책이다. 배열 인덱스로 묶으면 한쪽을 조정할 때
다른 쪽이 조용히 따라 움직인다.

## 2. 홈 표시 — `DailyPlanCard` 3-상태

`DailyPlanCard`의 props에서 `onCreateCta: () => void`는 유지하고 `unlock: PlanUnlockState`를
추가한다. 렌더 분기:

| `unlock.kind` | `plan` | 렌더 |
|---|---|---|
| `hidden` | — | `yesterdayFirstAction`만. 그것도 없으면 `null`을 반환해 카드 자체가 사라진다 |
| `locked` | — | 🔒 잠금 행 + `yesterdayFirstAction` (있을 때) |
| `open` | `null` | 지금의 ⚡ CTA 행 (동작만 바뀜 — §3) |
| `open` | 있음 | 지금과 동일 (full / compact) |

잠금 행:

```
┌──────────────────────────────────────┐
│ 🔒  실행 설계 (if-then)                │
│     7일 연속이면 열려요 · 지금 3일       │
└──────────────────────────────────────┘
```

- `<button>`이 아니라 `<div>`다. 눌러도 아무 일이 없는 행은 눌리면 안 된다.
- `compact`(중립/저녁 모드)에서도 같은 잠금 행을 쓴다. 두 줄짜리 행 하나라 축약할 것이 없고,
  모드마다 다른 잠금 문구를 두면 "왜 아침엔 다르게 보이지"라는 혼란만 생긴다.
- 뇌과학 설명은 여기 넣지 않는다. 아직 쓸 수 없는 기능에 강의를 붙이면 잔소리가 된다 —
  설명은 실제로 설계를 시작하는 순간(§4)에 있어야 한다.

`FirstActionRow`(어젯밤의 내가 정한 첫 행동)는 세 상태 모두에서 지금 규칙 그대로 렌더된다.
그건 실행 설계와 무관한 기능이므로 게이트에 걸리면 안 된다.

## 3. CTA 목적지 — 홈에서 설계 시트를 연다

`MoreSection`이 `ExecutionPlanSheet`를 직접 마운트한다. `router.push("/settings")`는 이
경로에서 사라진다.

```
[⚡ 오늘의 실행 설계를 만들어보세요]  →  ExecutionPlanSheet (quick 모드)
```

- 홈은 이미 `uid` · `goals` · `plans` · `user.identities.labels`를 구독하고 있어 새 구독이
  없다. `MoreSection`의 props에서 `extraGoals: string[]`를 **`goals: string[]`로 바꾸고**
  `extraGoals = goals.slice(1)`를 컴포넌트 안에서 파생한다 — 같은 배열을 두 벌로 넘기지
  않는다.
- `identityLabels: string[]` props를 추가한다.
- 시트가 닫히면 `onSnapshot` 구독이 새 플랜을 밀어 넣으므로 별도 갱신 코드가 없다.
  설정 화면의 `ExecutionPlansSection`과 같은 방식이다.

### 홈의 "자유입력 진입점 0" 원칙과의 관계

`MoreSection`에 "홈은 읽기 전용, 편집은 설정에서 (홈의 자유입력 진입점 0)"라는 주석이 있다.
이 변경은 그 문장을 그대로 지키지 못한다. 대신 원칙의 목적 — **홈 화면에 자유입력이 깔려
있지 않을 것** — 은 지켜진다:

- 시트의 기본 경로는 `quick`이다 (목표 선택 → 초안 3개 → 카드 탭 → 저장, 키보드 0회).
- 자유입력(`wizard`)은 "직접 다듬기"를 눌러야만 나온다 — 홈에서 두 단계 뒤다.

주석을 "홈 첫 화면에 자유입력이 깔리지 않는다 — 편집은 시트/설정에서"로 갱신한다.
`?sheet=plan` 딥링크는 **만들지 않는다.** 홈에서 시트가 바로 열리면 쓸 곳이 없다(YAGNI).

### "목표·실행 설계 관리" 행

`MoreSection` 아래쪽의 설정 진입 행(`home.plans.manage`)은 잠긴 동안 문구를
`home.plans.manageLocked`("목표 관리")로 바꾼다. 잠긴 기능의 이름이 화면에 두 번 남으면
잠금 행의 예고 효과가 흐려진다. 동작(설정으로 이동)은 그대로다.

## 4. 뇌과학 인트로 — `ExecutionPlanSheet` 상단, 기본 접힘

시트 본문 맨 위에 접힘 상태의 "왜 미리 정해두나요?" 행을 둔다. `quick`·`wizard` 양쪽에서
같은 위치에 렌더된다.

기본 접힘인 이유: 이 시트의 설계 목표는 3탭 저장이다. 매번 강의를 먼저 읽히면 그 이점이
사라진다. 궁금한 사람만 한 번 열어 보고, 열림 상태는 저장하지 않는다(시트는 매번 새로 뜬다).

`components/ui/DisclosureSection`은 홈 섹션 셸(`mt-7` · `px-7` · 인셋 카드)이라 시트 안에
맞지 않는다. `ExecutionPlanSheet` 파일 안의 로컬 컴포넌트 `WhyIntro`로 만든다 —
`DailyPlanCard`의 `FirstActionRow`와 같은 패턴(단일 사용처 = 로컬 정의)이다.

### 카피 (ko 기준)

**요약 행:** `woop.why.toggle` — "왜 미리 정해두나요?"

**본문 4문단:**

1. `woop.why.p1` — "결정의 순간엔 의지력이 가장 약합니다. 피곤한 저녁, 손에 잡힌 휴대폰 —
   그때 무엇을 할지 고민하면 대개 집니다."
2. `woop.why.p2` — "'만약 A면, 나는 B 한다'를 미리 한 문장으로 정해두면 그 행동을 부르는
   주체가 '나'에서 '상황'으로 바뀝니다. 뇌영상 연구에서도 실행의도를 세운 뒤에는 스스로
   떠올리는 데 쓰이는 안쪽 전전두엽 대신 단서에 반응하는 회로가 일을 맡았습니다."
3. `woop.why.p3` — "그래서 효과가 큽니다 — 94개 연구를 모은 메타분석에서 목표 달성
   효과크기 d = 0.65였습니다."
4. `woop.why.p4` — "그리고 반드시 '내 안의 장애물'을 함께 적습니다. 좋은 결과만 상상하면
   오히려 실행 에너지가 떨어진다는 것이 반복해서 확인됐습니다."

**출처 각주:** `woop.why.source` —
"Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011"

근거 확인:

- **d = 0.65** — Gollwitzer & Sheeran (2006), 독립 연구 94개 메타분석. 이미
  `types/index.ts`가 인용하는 값이라 앱 안에서 숫자가 갈리지 않는다.
- **전략적 자동화** — Gollwitzer (1999). 행동 통제를 의식적 의도에서 상황 단서로 위임한다.
- **전전두엽 전환** — Gilbert, Gollwitzer, Cohen, Oettingen & Burgess (2009). 실행의도
  조건에서 지연된 의도의 실현이 자기주도적 인출(안쪽 rostral PFC) 경로에서 단서 주도
  경로로 옮겨갔다. p2는 "활동이 줄었다"고 단정하지 않고 **관여하는 회로가 바뀌었다**고만
  쓴다 — 그것이 이 연구가 보인 것이다.
- **긍정 상상의 역효과** — Kappes & Oettingen (2011). 이미 `ExecutionPlanSheet` 상단
  주석이 인용하는 문헌이다.

## 5. 설정 화면

`app/settings/page.tsx`는 `computePlanUnlock(...).kind === "open"`일 때만
`<ExecutionPlansSection>`을 렌더한다. 잠긴 동안에는 **섹션 자체를 숨긴다** — 예고(잠금 행)는
홈 한 곳이면 충분하고, 설정에 잠긴 섹션을 두면 탭해도 아무 일이 없는 죽은 행이 하나 더 생긴다.

설정에는 `user`(→ 두 스트릭) · `goals` · `plans`가 이미 있어 추가 구독이 없다.

## 6. i18n

신규 키 9개를 `ko` · `en` · `es` · `zh` 4개 사전 **모두**에 추가한다. 한 사전이라도 빠지면
그 언어에서 키 문자열이 그대로 노출된다.

| 키 | 용도 | 보간 |
|---|---|---|
| `plan.locked.title` | 잠금 행 제목 | — |
| `plan.locked.body` | 잠금 행 조건·진행도 | `{days}` `{progress}` |
| `home.plans.manageLocked` | 잠긴 동안의 관리 행 문구 | — |
| `woop.why.toggle` | 인트로 요약 행 | — |
| `woop.why.p1` ~ `p4` | 인트로 본문 4문단 | — |
| `woop.why.source` | 출처 각주 | — |

`plan.locked.body`의 보간 형식은 기존 `goalSlot.locked`("🔒 {days}일 연속이면 열려요") ·
`goalSlot.lockedProgress`("지금 {progress}일")와 같은 규약을 쓴다.

## 7. 위젯·온보딩

**변경 없다.** `app/api/widget/today/route.ts`는 저장된 플랜이 있을 때만 if-then 섹션을
내보낸다. 잠긴 사용자는 플랜이 0개이므로 위젯은 이미 자연 생략된다. 온보딩은 실행 설계를
다루지 않는다.

## 8. 예외 처리

새로 추가되는 비동기 로직은 없다. `computePlanUnlock`은 순수 함수이고, 시트 저장 경로
(`saveExecutionPlan` · `/api/execution-plan/obstacles`)는 `ExecutionPlanSheet`가 이미 갖고
있는 try-catch를 그대로 쓴다. 홈에서 시트를 여는 것은 마운트일 뿐 새 I/O가 아니다.

민감정보 마스킹은 해당 없다 — 이 기능이 다루는 값은 사용자가 직접 쓴 목표·계획 문장뿐이고,
새로 로깅하는 지점이 없다.

## 9. 테스트

이 저장소에는 현재 단위 테스트 러너가 없다(`@playwright/test`가 devDependency에 있으나
`.spec.ts` 파일이 0개이고 `test` 스크립트도 없다). 이 작업에서 **`vitest`를 devDependency로
추가하고 `"test": "vitest run"` 스크립트를 넣는다.** 런타임 번들에는 영향이 없다.

`lib/planUnlock.test.ts` — 순수 함수 하나만 대상으로 한다:

| 케이스 | 입력 | 기대 |
|---|---|---|
| 목표·플랜 없음 | `goalCount: 0, planCount: 0` | `hidden` |
| 시작 직후 | `goalCount: 1`, 두 스트릭 0 | `locked`, `progress: 0` |
| 임계 직전 | `bestCount: 6` | `locked`, `progress: 6` |
| 임계 도달 | `bestCount: 7` | `open` |
| 전사 축만 도달 | 전사 `bestCount: 7`, 목표 0 | `open` |
| 목표 축만 도달 | 목표 `bestCount: 9`, 전사 0 | `open`, `progress: 9` |
| 스트릭 끊김 | `count: 0, bestCount: 12` | `open` (역대 최고 기준) |
| 손상 문서 | `count: 8, bestCount: 3` | `open` (큰 값 채택) |
| 기존 사용자 보존 | 두 스트릭 0, `goalCount: 0`, `planCount: 2` | `open` (`hidden`도 `locked`도 아님) |
| 레거시 문서 | `bestCount` 없음, `count: 7` | `open` |

UI(잠금 행 렌더·시트 마운트)는 러너가 없으므로 수동 확인한다:
`npm run lint` · `npm run build` 통과 후, 스트릭 0인 계정에서 잠금 행이 뜨는지 / 플랜이 있는
계정에서 지금과 똑같이 보이는지 두 가지만 눈으로 본다.

## 변경 파일 요약

| 파일 | 변경 |
|---|---|
| `lib/planUnlock.ts` | 신규 — `computePlanUnlock` · `PlanUnlockState` |
| `lib/planUnlock.test.ts` | 신규 — 순수 함수 테스트 10케이스 |
| `lib/constants/growth.ts` | `PLAN_UNLOCK_STREAK = 7` 추가 |
| `components/home/DailyPlanCard.tsx` | `unlock` props 추가, 잠금 행 렌더 |
| `components/home/MoreSection.tsx` | 시트 마운트, `extraGoals`→`goals`, `identityLabels` 추가, 관리 행 문구 분기 |
| `app/home/page.tsx` | `computePlanUnlock` 호출, 새 props 전달, `extraGoals` 파생 제거 |
| `app/settings/page.tsx` | `kind === "open"`일 때만 `ExecutionPlansSection` 렌더 |
| `components/woop/ExecutionPlanSheet.tsx` | `WhyIntro` 로컬 컴포넌트 추가 |
| `lib/i18n/dictionaries/{ko,en,es,zh}.ts` | 신규 키 9개 |
| `package.json` | `vitest` devDependency + `test` 스크립트 |

## 하지 않는 것

- `?sheet=plan` 딥링크 — 홈에서 시트가 직접 열리므로 쓸 곳이 없다.
- 해금 순간의 1회성 축하 배너 — `SlotUnlockBanner`가 이미 같은 7일 지점에서 뜬다.
  같은 날 배너 두 개는 축하가 아니라 소음이다.
- Firestore 해금 필드 — 기존 값으로 전부 계산된다.
- `GOAL_SLOT_THRESHOLDS` 재사용 — 우연히 같은 값이지 같은 정책이 아니다.
