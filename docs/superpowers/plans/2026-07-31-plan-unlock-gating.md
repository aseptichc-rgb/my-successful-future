# 실행 설계 잠금·해금 + 뇌과학 인트로 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실행 설계(WOOP)를 최고 연속 7일에 해금하고, 그 전엔 홈에 잠금 행만 예고하며, CTA는 홈에서 설계 시트를 바로 열고, 시트에 뇌과학 인트로를 접힘으로 둔다.

**Architecture:** 순수 판정 모듈 `lib/planUnlock.ts`(기존 `bestStreakCount` 재사용) 하나가 홈·설정 양쪽의 게이트를 결정한다. Firestore 스키마 변경 없음. 스펙: `docs/superpowers/specs/2026-07-31-plan-unlock-gating-design.md`.

**Tech Stack:** Next.js 16(App Router) · React 19 · Firebase(기존 구독 재사용) · vitest(신규 devDep) · 자체 i18n(`lib/i18n`)

## Global Constraints

- 해금 임계값은 `PLAN_UNLOCK_STREAK = 7` 하나뿐 — `GOAL_SLOT_THRESHOLDS`를 참조하지 않는다.
- `goalCount`는 항상 "trim 후 비어있지 않은 목표 수"로 센다.
- 신규 i18n 키는 ko·en·es·zh **4개 사전 모두**에 넣는다. 하나라도 빠지면 키 문자열이 그대로 노출된다.
- `plansLoaded`(첫 스냅샷 도착) 전에는 실행 설계 UI를 그리지 않는다 — 기존 사용자 잠금 행 깜빡임 방지.
- 이 프로젝트는 이모지·한국어 주석이 표준이다. 주석 밀도·톤은 이웃 코드와 맞춘다.
- 커밋 메시지는 기존 컨벤션(`feat(scope): 한국어 요약`) + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: 해금 판정 순수 모듈 + vitest 도입

**Files:**
- Modify: `lib/constants/growth.ts` (상수 추가)
- Create: `lib/planUnlock.ts`
- Create: `lib/planUnlock.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (vitest devDep + test 스크립트)

**Interfaces:**
- Consumes: `bestStreakCount(streak?: StreakCounter | null): number` — `lib/goalSlots.ts`에서 export됨. `StreakCounter { count?: number; bestCount?: number }` — `types/index.ts:78`.
- Produces: `computePlanUnlock(opts): PlanUnlockState`, `PLAN_UNLOCK_STREAK = 7`. Task 3·5가 import한다.

- [ ] **Step 1: vitest 설치**

```bash
npm install -D vitest
```

- [ ] **Step 2: vitest.config.ts 작성** (vitest는 tsconfig의 `@/*` 별칭을 스스로 읽지 않는다)

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * vitest 설정 — 순수 모듈(lib/**) 단위 테스트 전용.
 * tsconfig 의 "@/*" 경로 별칭을 vitest 는 스스로 읽지 않으므로 여기서 등록한다.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: package.json 의 scripts 에 `"test": "vitest run"` 추가**

- [ ] **Step 4: `lib/constants/growth.ts` 에 상수 추가** (`STEPUP_MULTIPLIER` 아래)

```ts
/**
 * 실행 설계(WOOP)를 여는 최소 "역대 최고 연속일" — 다짐 전사·목표 달성 두 축 중 큰 값.
 * GOAL_SLOT_THRESHOLDS[1](7일)과 지금 값이 같지만 서로 다른 정책이라 독립 상수로 둔다 —
 * 배열 인덱스로 묶으면 목표 칸 임계값을 조정할 때 실행 설계 해금이 조용히 따라 움직인다.
 */
export const PLAN_UNLOCK_STREAK = 7;
```

- [ ] **Step 5: 실패하는 테스트 작성** — `lib/planUnlock.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { PLAN_UNLOCK_STREAK } from "@/lib/constants/growth";
import { computePlanUnlock } from "@/lib/planUnlock";

describe("computePlanUnlock", () => {
  it("목표도 플랜도 없으면 hidden", () => {
    expect(computePlanUnlock({ goalCount: 0, planCount: 0 })).toEqual({ kind: "hidden" });
  });

  it("시작 직후(목표 1, 스트릭 없음)는 locked / progress 0", () => {
    expect(computePlanUnlock({ goalCount: 1 })).toEqual({
      kind: "locked",
      progress: 0,
      threshold: PLAN_UNLOCK_STREAK,
    });
  });

  it("임계 직전(6일)은 locked", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 6, bestCount: 6 } }),
    ).toEqual({ kind: "locked", progress: 6, threshold: PLAN_UNLOCK_STREAK });
  });

  it("임계 도달(7일)은 open", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 7, bestCount: 7 } }).kind,
    ).toBe("open");
  });

  it("전사 축만 7일이어도 open", () => {
    expect(
      computePlanUnlock({
        goalCount: 1,
        affirmation: { count: 7, bestCount: 7 },
        goal: { count: 0, bestCount: 0 },
      }).kind,
    ).toBe("open");
  });

  it("목표 달성 축만 9일이어도 open (progress 는 큰 축)", () => {
    expect(computePlanUnlock({ goalCount: 1, goal: { count: 9, bestCount: 9 } }).kind).toBe(
      "open",
    );
  });

  it("스트릭이 끊겨도(count 0, best 12) open — 역대 최고 기준", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 0, bestCount: 12 } }).kind,
    ).toBe("open");
  });

  it("손상 문서(count 8 > bestCount 3)는 큰 값을 채택해 open", () => {
    expect(
      computePlanUnlock({ goalCount: 1, affirmation: { count: 8, bestCount: 3 } }).kind,
    ).toBe("open");
  });

  it("스트릭 0이어도 플랜이 있으면 open — 기존 사용자 보존(hidden/locked 아님)", () => {
    expect(computePlanUnlock({ goalCount: 0, planCount: 2 }).kind).toBe("open");
  });

  it("레거시 문서(bestCount 없음, count 7)도 open", () => {
    expect(computePlanUnlock({ goalCount: 1, affirmation: { count: 7 } }).kind).toBe("open");
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/planUnlock'` (또는 동등한 resolve 오류)

- [ ] **Step 7: `lib/planUnlock.ts` 구현**

```ts
/**
 * 실행 설계(WOOP) 해금 판정 — 순수 함수.
 *
 * 실행 설계는 첫날부터 열려 있지 않다. 이 앱의 다른 복잡도와 같은 규칙으로,
 * 꾸준함으로 벌어서 연다(lib/goalSlots 와 동일 사상). 판정 기준은 현재 연속일이
 * 아니라 역대 최고(bestStreakCount)라, 스트릭이 한 번 끊겨도 다시 잠기지 않는다.
 *
 * 이미 플랜이 있는 사용자는 무조건 open — 쓰던 기능을 회수하면 그건 처벌이고,
 * 처벌은 재시작을 막는다(computeGoalSlots 의 기존 목표 보존과 같은 규칙).
 */
import { PLAN_UNLOCK_STREAK } from "@/lib/constants/growth";
import { bestStreakCount } from "@/lib/goalSlots";
import type { StreakCounter } from "@/types";

export type PlanUnlockState =
  | { kind: "hidden" }
  | { kind: "locked"; progress: number; threshold: number }
  | { kind: "open" };

export function computePlanUnlock({
  affirmation,
  goal,
  goalCount = 0,
  planCount = 0,
}: {
  /** 다짐 전사 스트릭 (users.affirmationStreak). */
  affirmation?: StreakCounter | null;
  /** 목표 달성 스트릭 (users.goalStreak). */
  goal?: StreakCounter | null;
  /** trim 후 비어있지 않은 목표 수 — 호출부가 cleanGoals 규칙으로 센다. */
  goalCount?: number;
  /** 저장된 실행 설계 수. */
  planCount?: number;
} = {}): PlanUnlockState {
  // 설계할 목표가 없으면 잠금 예고조차 그리지 않는다 (ExecutionPlansSection 과 같은 규칙).
  if (goalCount <= 0 && planCount <= 0) return { kind: "hidden" };
  if (planCount > 0) return { kind: "open" };

  const progress = Math.max(bestStreakCount(affirmation), bestStreakCount(goal));
  if (progress >= PLAN_UNLOCK_STREAK) return { kind: "open" };
  return { kind: "locked", progress, threshold: PLAN_UNLOCK_STREAK };
}
```

- [ ] **Step 8: 통과 확인**

Run: `npm test`
Expected: PASS — 10 tests

- [ ] **Step 9: 커밋**

```bash
git add lib/planUnlock.ts lib/planUnlock.test.ts lib/constants/growth.ts vitest.config.ts package.json package-lock.json
git commit -m "feat(plan): 실행 설계 해금 판정 순수 모듈 + vitest 도입"
```

---

### Task 2: i18n 신규 키 9개 × 4개 사전

**Files:**
- Modify: `lib/i18n/dictionaries/ko.ts` · `en.ts` · `es.ts` · `zh.ts`

**Interfaces:**
- Produces: 키 `plan.locked.title` · `plan.locked.body` · `home.plans.manageLocked` · `woop.why.toggle` · `woop.why.p1`~`p4` · `woop.why.source`. Task 3·4가 `t(...)`로 소비.
- `plan.locked.body`는 `{days}`(임계값)·`{progress}`(현재 최고 연속일) 2중 보간 — `lib/i18n`의 `interpolate`가 지원함(확인됨).

배치: `plan.locked.*`는 각 사전의 `plan.today.firstAction` 바로 아래, `woop.why.*`는 `woop.suggestFailed` 바로 아래, `home.plans.manageLocked`는 `home.plans.manage` 바로 아래. 잠금 아이콘(🔒)은 카드의 아이콘 칸이 담당하므로 body 문구에는 넣지 않는다.

- [ ] **Step 1: ko.ts**

```ts
  "plan.locked.title": "실행 설계 (if-then)",
  "plan.locked.body": "{days}일 연속이면 열려요 · 지금 {progress}일",
```

```ts
  "woop.why.toggle": "왜 미리 정해두나요?",
  "woop.why.p1":
    "결정의 순간엔 의지력이 가장 약해요. 피곤한 저녁, 손에 잡힌 휴대폰 — 그때 무엇을 할지 고민하면 대개 져요.",
  "woop.why.p2":
    "'만약 A면, 나는 B 한다'를 미리 한 문장으로 정해두면 행동을 부르는 주체가 '나'에서 '상황'으로 바뀌어요. 뇌영상 연구에서도 실행의도를 세운 뒤에는 스스로 떠올리는 데 쓰이는 안쪽 전전두엽 대신, 단서에 반응하는 회로가 일을 맡았어요.",
  "woop.why.p3":
    "그래서 효과가 커요 — 94개 연구를 모은 메타분석에서 목표 달성 효과크기 d = 0.65였어요.",
  "woop.why.p4":
    "그리고 반드시 '내 안의 장애물'을 함께 적어요. 좋은 결과만 상상하면 오히려 실행 에너지가 떨어진다는 게 반복해서 확인됐어요.",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",
```

```ts
  "home.plans.manageLocked": "목표 관리",
```

- [ ] **Step 2: en.ts**

```ts
  "plan.locked.title": "Execution plan (if-then)",
  "plan.locked.body": "Unlocks after a {days}-day streak · now {progress} days",
```

```ts
  "woop.why.toggle": "Why decide in advance?",
  "woop.why.p1":
    "Willpower is weakest at the moment of decision. A tired evening, a phone already in your hand — deliberate then, and you usually lose.",
  "woop.why.p2":
    "Setting one sentence in advance — 'If A, then I do B' — hands the trigger from 'me' to the situation. In brain-imaging research, once an implementation intention was set, cue-driven circuits took over from the medial prefrontal regions used for self-initiated recall.",
  "woop.why.p3":
    "That is why the effect is large — a meta-analysis of 94 studies found an effect size of d = 0.65 on goal attainment.",
  "woop.why.p4":
    "And always name the obstacle inside you. Imagining only the good outcome has repeatedly been shown to drain the energy to act.",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",
```

```ts
  "home.plans.manageLocked": "Manage goals",
```

- [ ] **Step 3: es.ts**

```ts
  "plan.locked.title": "Diseño de ejecución (if-then)",
  "plan.locked.body": "Se abre con {days} días seguidos · ahora {progress} días",
```

```ts
  "woop.why.toggle": "¿Por qué decidirlo por adelantado?",
  "woop.why.p1":
    "La fuerza de voluntad es más débil en el momento de decidir. Una noche cansada, el teléfono ya en la mano — si lo piensas entonces, sueles perder.",
  "woop.why.p2":
    "Fijar de antemano una frase — 'Si A, entonces hago B' — pasa el disparador de 'yo' a la situación. En estudios de neuroimagen, con una intención de implementación fijada, los circuitos guiados por señales asumieron el trabajo de las regiones prefrontales mediales usadas para el recuerdo autoiniciado.",
  "woop.why.p3":
    "Por eso el efecto es grande: un metaanálisis de 94 estudios halló un tamaño de efecto de d = 0.65 en el logro de metas.",
  "woop.why.p4":
    "Y nombra siempre el obstáculo dentro de ti. Se ha comprobado una y otra vez que imaginar solo el buen resultado drena la energía para actuar.",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",
```

```ts
  "home.plans.manageLocked": "Gestionar objetivos",
```

- [ ] **Step 4: zh.ts**

```ts
  "plan.locked.title": "执行设计 (if-then)",
  "plan.locked.body": "连续{days}天即可解锁 · 目前{progress}天",
```

```ts
  "woop.why.toggle": "为什么要提前定好？",
  "woop.why.p1":
    "做决定的那一刻，意志力最薄弱。疲惫的夜晚、已经拿在手里的手机——那时才思考做什么，往往会输。",
  "woop.why.p2":
    "提前写下一句'如果A，我就做B'，触发行动的主体就从'我'变成了'情境'。脑成像研究也显示，设定执行意图后，接管工作的是对线索作出反应的回路，而不是自主回想所依赖的内侧前额叶。",
  "woop.why.p3":
    "所以效果显著——汇总94项研究的元分析发现，目标达成的效应量为 d = 0.65。",
  "woop.why.p4":
    "还要写下'我内心的障碍'。只想象好结果反而会削弱行动的能量——这一点被反复验证。",
  "woop.why.source":
    "Gollwitzer 1999 · Gollwitzer & Sheeran 2006 · Gilbert et al. 2009 · Kappes & Oettingen 2011",
```

```ts
  "home.plans.manageLocked": "管理目标",
```

- [ ] **Step 5: 검증 — 4개 사전 키 수 일치 확인**

Run: `npm run lint`
Expected: PASS (사전은 `Record<키, string>` 타입이라 오타 키는 사용처 컴파일에서 잡힌다 — 최종 확인은 Task 6의 build)

- [ ] **Step 6: 커밋**

```bash
git add lib/i18n/dictionaries/ko.ts lib/i18n/dictionaries/en.ts lib/i18n/dictionaries/es.ts lib/i18n/dictionaries/zh.ts
git commit -m "feat(i18n): 실행 설계 잠금·뇌과학 인트로 문구 4개 언어 추가"
```

---

### Task 3: 홈 게이팅 — DailyPlanCard 3-상태 · MoreSection 시트 마운트 · 홈 배선

세 파일이 props 로 맞물려 있어 한 태스크로 묶는다(중간 상태는 컴파일이 깨진다).

**Files:**
- Modify: `components/home/DailyPlanCard.tsx`
- Modify: `components/home/MoreSection.tsx`
- Modify: `app/home/page.tsx`

**Interfaces:**
- Consumes: `computePlanUnlock` · `PlanUnlockState` (Task 1), i18n 키 (Task 2), `ExecutionPlanSheet`(기존 — props: `uid, goals, identityLabels, existingPlan?, initialGoal?, onClose, onSaved?`).
- Produces: `DailyPlanCard` 신규 prop `unlock: PlanUnlockState`. `MoreSection` props 변경 — `extraGoals: string[]` 제거, `goals: string[]` · `identityLabels: string[]` · `unlock: PlanUnlockState | null`(null = 플랜 로딩 전) 추가.

- [ ] **Step 1: `DailyPlanCard.tsx` — unlock prop + 잠금/숨김 분기**

props 에 `unlock: PlanUnlockState` 추가(`import type { PlanUnlockState } from "@/lib/planUnlock";`). 헤더 주석에 `· locked: 잠금 예고 행(탭 불가) · hidden: 첫 행동만(없으면 null)` 한 줄 추가. 함수 본문 최상단(기존 `if (!plan)` 앞)에 삽입:

```tsx
  if (unlock.kind === "hidden") {
    // 설계할 목표가 없다 — 첫 행동 회수 행만 남기고, 그마저 없으면 카드 자체를 접는다.
    if (!compact && yesterdayFirstAction) {
      return (
        <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
          <FirstActionRow text={yesterdayFirstAction} />
        </div>
      );
    }
    return null;
  }

  if (unlock.kind === "locked") {
    // 아직 잠김 — 조건·진행도만 예고한다. 눌러도 아무 일이 없는 행은 button 이 아니다.
    return (
      <div className="bg-[var(--bg-grouped-2)] rounded-[12px] overflow-hidden">
        {!compact && yesterdayFirstAction && (
          <FirstActionRow text={yesterdayFirstAction} withSeparator />
        )}
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="text-[17px]" aria-hidden>
            🔒
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-medium text-[var(--label-2)]">
              {t("plan.locked.title")}
            </span>
            <span className="block mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)]">
              {t("plan.locked.body", { days: unlock.threshold, progress: unlock.progress })}
            </span>
          </span>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: `MoreSection.tsx` — props 교체 + 시트 마운트 + 래퍼 조건 렌더**

1. import 추가: `ExecutionPlanSheet`, `type PlanUnlockState`.
2. props 변경: `extraGoals: string[]` → `goals: string[]` · `identityLabels: string[]` · `unlock: PlanUnlockState | null` 추가. JSDoc: `/** null = 플랜 목록 첫 스냅샷 전 — 실행 설계 영역을 그리지 않는다(기존 사용자 잠금 깜빡임 방지). */`
3. 본문에 파생·상태 추가:

```tsx
  // 첫 목표는 오늘 카드가 이미 보여주므로 여기서는 나머지만 그린다.
  const extraGoals = goals.slice(1);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
```

4. 오늘의 if-then 블록(래퍼 div 포함)을 교체 — 카드가 그려질 때만 래퍼째 그린다:

```tsx
      {/* 오늘의 if-then — 아침엔 전체, 그 외엔 한 줄 축약. 잠김/로딩 전엔 래퍼(구분선)째 생략. */}
      {(() => {
        if (!unlock) return null;
        const firstAction = homeMode === "morning" ? yesterdayFirstAction : null;
        if (unlock.kind === "hidden" && !firstAction) return null;
        return (
          <div className="border-b border-[var(--sep)]">
            <DailyPlanCard
              plan={todayPlan}
              yesterdayFirstAction={firstAction}
              compact={homeMode !== "morning"}
              unlock={unlock}
              onCreateCta={() => setPlanSheetOpen(true)}
            />
          </div>
        );
      })()}
```

5. 관리 행 — 주석·문구 교체 (동작은 설정 이동 그대로):

```tsx
      {/* 목표 관리 — 홈 첫 화면에 자유입력이 깔리지 않는다. 편집은 시트/설정에서. */}
```

행 텍스트: `{t(unlock?.kind === "open" ? "home.plans.manage" : "home.plans.manageLocked")}`

6. 루트를 프래그먼트로 감싸 시트를 DisclosureSection **바깥**에 마운트한다(섹션을 접어도 시트가 살아 있도록):

```tsx
  return (
    <>
      <DisclosureSection ...기존 그대로...>
        ...기존 children...
      </DisclosureSection>
      {planSheetOpen && (
        <ExecutionPlanSheet
          uid={uid}
          goals={goals}
          identityLabels={identityLabels}
          onClose={() => setPlanSheetOpen(false)}
        />
      )}
    </>
  );
```

- [ ] **Step 3: `app/home/page.tsx` 배선**

1. import: `computePlanUnlock` (`@/lib/planUnlock`).
2. `const [plansLoaded, setPlansLoaded] = useState(false);` — `plans` state 옆.
3. 플랜 구독 effect 교체 (계정 전환 시 리셋 포함):

```tsx
  // WOOP 실행설계 목록 구독 — "오늘의 if-then" 회전 + 해금 판정에 쓴다.
  useEffect(() => {
    if (!firebaseUser) return;
    // 계정이 바뀌면 새 첫 스냅샷을 기다린다 — 이전 계정의 plans 로 해금을 오판하지 않도록.
    setPlansLoaded(false);
    const unsub = onExecutionPlansSnapshot(
      firebaseUser.uid,
      (next) => {
        setPlans(next);
        setPlansLoaded(true);
      },
      () => {
        // 구독 실패(규칙 미배포 등) 시 섹션만 비운다 — 홈 나머지는 정상 동작.
        setPlans([]);
        setPlansLoaded(true);
      },
    );
    return unsub;
  }, [firebaseUser]);
```

4. `const extraGoals = goals.slice(1);` 삭제. 그 자리에:

```tsx
  // 실행 설계 해금 — 첫 스냅샷 전(null)에는 카드를 그리지 않는다(깜빡임 방지).
  const planUnlock = plansLoaded
    ? computePlanUnlock({
        affirmation: user?.affirmationStreak,
        goal: user?.goalStreak,
        goalCount: goals.filter((g) => g.trim().length > 0).length,
        planCount: plans.length,
      })
    : null;
```

5. `<MoreSection>` props: `extraGoals={extraGoals}` → `goals={goals}`, 추가 `identityLabels={user?.identities?.labels ?? []}` · `unlock={planUnlock}`.

- [ ] **Step 4: 검증**

Run: `npm run lint && npm run build`
Expected: PASS (build 는 Task 6에서도 다시 돈다 — 여기서 깨지면 즉시 수정)

- [ ] **Step 5: 커밋**

```bash
git add components/home/DailyPlanCard.tsx components/home/MoreSection.tsx app/home/page.tsx
git commit -m "feat(plan): 실행 설계 7일 해금 게이트 — 홈 잠금 행 + 홈에서 설계 시트 직접 열기"
```

---

### Task 4: 뇌과학 인트로 — ExecutionPlanSheet `WhyIntro`

**Files:**
- Modify: `components/woop/ExecutionPlanSheet.tsx`

**Interfaces:**
- Consumes: i18n 키 `woop.why.*` (Task 2).
- Produces: 없음 (파일 로컬 컴포넌트).

- [ ] **Step 1: 파일 하단에 로컬 컴포넌트 추가** (default export 함수 뒤)

```tsx
/**
 * WhyIntro — "왜 미리 정해두나요?" 접힘 인트로.
 * 시트의 설계 목표는 3탭 저장이라 기본 접힘 — 궁금한 사람만 연다. 열림 상태는
 * 저장하지 않는다(시트는 매번 새로 뜬다). 근거: Gollwitzer 1999 · Gollwitzer &
 * Sheeran 2006(d=0.65) · Gilbert et al. 2009 · Kappes & Oettingen 2011.
 */
function WhyIntro() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 rounded-[12px] bg-[var(--bg-grouped-2)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className="text-[15px]" aria-hidden>
          🧠
        </span>
        <span className="flex-1 text-[15px] font-medium tracking-[-0.24px] text-[var(--label)]">
          {t("woop.why.toggle")}
        </span>
        <svg
          width="8"
          height="14"
          viewBox="0 0 8 14"
          fill="none"
          aria-hidden
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <path
            d="M1 1l6 6-6 6"
            stroke="rgba(60,60,67,0.3)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p1")}
          </p>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p2")}
          </p>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p3")}
          </p>
          <p className="text-[13px] leading-[19px] tracking-[-0.08px] text-[var(--label-2)]">
            {t("woop.why.p4")}
          </p>
          <p className="text-[11px] leading-[16px] text-[var(--label-3)]">
            {t("woop.why.source")}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 두 경로 모두에 마운트** — quick 리턴의 `<Sheet onClose={onClose} title={t("woop.quick.title")}>` 바로 다음 줄, wizard 리턴의 `<Sheet onClose={onClose} title={t("woop.sheet.title")}>` 바로 다음 줄(단계 도트 위)에 각각 `<WhyIntro />` 삽입.

- [ ] **Step 3: 검증**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add components/woop/ExecutionPlanSheet.tsx
git commit -m "feat(woop): 설계 시트에 '왜 미리 정해두나요?' 뇌과학 인트로 (기본 접힘)"
```

---

### Task 5: 설정 화면 게이팅

**Files:**
- Modify: `app/settings/page.tsx`

**Interfaces:**
- Consumes: `computePlanUnlock` (Task 1). 설정에는 이미 `goals`·`plans`·`user`(두 스트릭)·`goalCount` useMemo(trim 필터, `app/settings/page.tsx:574`)가 있다.

- [ ] **Step 1: `plansLoaded` state + 구독 콜백 갱신**

`const [plans, setPlans] = useState<ExecutionPlanWithId[]>([]);` 옆에
`const [plansLoaded, setPlansLoaded] = useState(false);` 추가. 구독 effect 교체:

```tsx
  // WOOP 실행설계 구독 — 실패 시 섹션만 비운다(설정 나머지는 정상 동작).
  useEffect(() => {
    if (!firebaseUser) return;
    setPlansLoaded(false);
    const unsub = onExecutionPlansSnapshot(
      firebaseUser.uid,
      (next) => {
        setPlans(next);
        setPlansLoaded(true);
      },
      () => {
        setPlans([]);
        setPlansLoaded(true);
      },
    );
    return unsub;
  }, [firebaseUser]);
```

- [ ] **Step 2: 해금 판정 + 조건 렌더**

import `computePlanUnlock` 추가. 렌더 근처에 판정 변수(기존 `goalCount` useMemo 재사용):

```tsx
  // 실행 설계 섹션은 해금된 사용자에게만 — 잠금 예고는 홈 한 곳으로 충분하다.
  const planUnlockOpen =
    plansLoaded &&
    computePlanUnlock({
      affirmation: user?.affirmationStreak,
      goal: user?.goalStreak,
      goalCount,
      planCount: plans.length,
    }).kind === "open";
```

기존 `{firebaseUser && (<ExecutionPlansSection ... />)}` 조건을 `{firebaseUser && planUnlockOpen && (<ExecutionPlansSection ... />)}`로 교체(주석에 `— 해금 전엔 섹션 숨김` 추가).

- [ ] **Step 3: 검증**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add app/settings/page.tsx
git commit -m "feat(settings): 실행 설계 섹션 해금 전 숨김 — 홈 잠금 행과 동일 판정"
```

---

### Task 6: 최종 검증 + 푸쉬

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 검증**

Run: `npm test && npm run lint && npm run build`
Expected: 테스트 10개 PASS · lint PASS · build 성공

- [ ] **Step 2: 수동 확인 항목 기록** (코드 리뷰어용 — 실기기/브라우저에서)

1. 스트릭 0 신규 계정: 홈 더 보기에 🔒 잠금 행("7일 연속이면 열려요 · 지금 0일"), 탭 불가. 설정에 실행 설계 섹션 없음.
2. 플랜 보유 기존 계정: 진입 직후 잠금 행 깜빡임 없이 기존 플랜 카드 그대로.
3. 해금 계정에서 CTA 탭 → 설정 이동 없이 홈 위로 설계 시트. 시트 상단 "왜 미리 정해두나요?" 접힘 → 탭하면 4문단 + 출처.

- [ ] **Step 3: CLAUDE.md 마무리 규칙**

프로젝트 dev/build Node 프로세스만 종료(세션 MCP 서버 제외 — 메모리 규칙), 전체 커밋 후 푸쉬, `git status` clean 확인:

```bash
git push origin master
git status
```

---

## Self-Review 결과

- 스펙 §1(판정 규칙·상수)→Task 1, §2(3-상태·빈 구분선)→Task 3, §3(시트 마운트·관리 행·주석)→Task 3, §4(WhyIntro)→Task 4, §5(설정 숨김)→Task 5, §6(i18n)→Task 2, §9(테스트·vitest 별칭)→Task 1·6. 커버리지 누락 없음.
- 깜빡임 방지 `plansLoaded`는 홈(Task 3 Step 3)·설정(Task 5 Step 1) 모두 반영.
- 타입 일관성: `PlanUnlockState`·`computePlanUnlock` 시그니처가 Task 1 정의와 Task 3·5 사용처에서 동일함을 확인.
