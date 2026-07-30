# 성공 선언과 오늘의 목표 분리 — 설계

- 날짜: 2026-07-30
- 상태: 승인됨

## 배경

지금 다짐은 목표에서 자동 파생된다(`lib/affirmationDerive`). "매일 30분 책을 읽는다"
라는 목표에 1인칭 접두사를 붙여 "나는 매일 30분 책을 읽는다"를 다짐으로 만든다.
온보딩 입력을 두 배로 늘리지 않으려는 선택이었고, 그 결과 **두 문장이 같은 것을
가리키도록** 의도적으로 묶여 있었다.

이 설계는 그 묶음을 푼다.

- **성공한 미래의 나** — 이미 이룬 상태의 1인칭 선언. 자기암시(as-if)의 대상.
- **오늘의 목표** — 그 사람이 되기 위해 오늘 옮기는 행동. 실행 체크의 대상.

두 문장은 성격이 다르므로 각각 받아야 한다. 파생을 유지한 채 홈 카드 제목만
"성공한 미래의 나"로 바꾸면, 내용이 행동 문장인 채로 제목이 그것을 배신한다.

설정 화면은 이미 이 구분을 갖고 있다 — `settings.goals.title`이 "목표를 이루기
위한 오늘의 행동", `settings.affirmations.header`가 "성공한 나의 모습 다짐"이다.
온보딩과 홈만 옛 파생 모델에 남아 있었고, 이 작업은 그 둘을 설정에 맞춘다.

## 스키마

**변경 없다.** `users/{uid}.successAffirmations`와 `users/{uid}.goals`는 이미 분리된
필드다. 마이그레이션도 없다. 끊는 것은 두 필드를 잇던 클라이언트 측 파생 함수뿐이다.

| 필드 | 성격 | 매일 하는 일 | 상한 |
|---|---|---|---|
| `successAffirmations[0]` | 이미 이룬 상태의 1인칭 선언 | 그대로 전사 → 체크인 | `SUCCESS_AFFIRMATION_MAX_LEN` = 60 |
| `goals[0]` | 그 사람이 되기 위한 오늘의 행동 | 지켰나 1탭 | `GOAL_TEXT_MAX` = 56 |

## 1. 온보딩 Step 2 — 한 화면, 두 칸

단계 수는 4개를 유지한다. Step 2 한 화면에 선언과 목표를 위아래로 놓아 "이 사람이
되기 위해 → 오늘 이것"의 인과를 한눈에 보이게 한다.

```
Step 2 / 4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
성공한 미래의 나를 한 줄로

 ◉ 나는 돈에 쫓기지 않는 사람이다
 ○ 나는 몸과 마음이 건강한 사람이다
 ○ 나는 내 일로 누군가를 돕는 사람이다
   [ ✎ 직접 쓰기 ]

──────────────────────────────────
그 사람이 되기 위해, 오늘 딱 하나

 ┌────────────────────────────┐
 │ 매일 30분 책을 읽는다        │
 └────────────────────────────┘
 "~한다"로 끝나면 매일 체크가 쉬워요

              [ 다음 → ]
```

- 위 칸은 Step 1의 예시 칩 패턴(`handleSelectExample` + `customOpen`)을 그대로
  재사용한다 — 타이핑 0으로 완주 가능한 성질을 잃지 않는다.
- 파생 미리보기 블록(`app/onboarding/page.tsx` 의 `derivedAffirmation` 카드)을
  삭제하고 그 자리에 칩 그룹을 올린다.
- `affirmationDraft: string | null`(파생 fallback 신호) → `affirmation: string`
  (독립 값)으로 단순화한다. 렌더 시점 파생이 사라지므로 `derivedAffirmation`,
  `affirmationLine` 파생 변수도 함께 사라진다.
- 두 칸 모두 **선택 입력**을 유지한다. 빈 값으로 넘어가도 온보딩은 완료된다
  (기존 `saveAndPreview` 의 빈 배열 정규화 동작 보존).

### 예시 칩 문구 (ko)

서로 다른 축을 덮는다 — 경제적 자유 / 건강 / 기여.

1. `나는 돈에 쫓기지 않는 사람이다`
2. `나는 몸과 마음이 건강한 사람이다`
3. `나는 내 일로 누군가를 돕는 사람이다`

## 2. 홈 카드 제목

| 키 | 이전 | 이후 |
|---|---|---|
| `affirmations.focus.title` | 오늘의 다짐 | **성공한 미래의 나** |
| `affirmations.focus.hint` | 이 한 줄만 그대로 적으면 오늘 체크인이 완성돼요. | **이미 그렇게 된 사람처럼, 이 한 줄을 그대로 적어보세요.** |

`AffirmationCheckin` 은 이미 이 두 키를 읽으므로 컴포넌트 코드 변경은 없다.
ko/en/es/zh 4개 로케일 동일 키 세트를 유지한다.

## 3. 파생 로직 제거

| 대상 | 처리 |
|---|---|
| `deriveAffirmation` | 삭제 |
| `shouldOfferAffirmationSync` | 삭제 |
| `normalizeGoalText` | 유지 — 온보딩·설정이 계속 쓴다 |
| `lib/affirmationDerive.ts` | 삭제. `normalizeGoalText` 만 `lib/goalText.ts` 로 이동 |
| 설정 "다짐도 바꿀까요?" 시트 | `syncPrompt` state · `handleApplyAffirmationSync` · 관련 JSX 제거 |

파일을 옮기는 이유: `normalizeGoalText` 하나만 남으면 `affirmationDerive` 라는
이름이 거짓이 된다. 목표 텍스트 정규화는 `lib/constants/goal.ts` 와 같은 관심사다.

### i18n 삭제 키 (× 4 로케일)

- `onboarding.goal.affirmationLabel`, `.affirmationHint`, `.affirmationEdit`, `.affirmationReset`
- `settings.goals.sync.title`, `.desc`, `.current`, `.next`, `.apply`, `.keep`
- `home.tab.future`, `home.tab.actions` — 탭 UI 가 `75a1f9f` 에서 제거된 뒤 남은
  죽은 키. 이 작업에서 같이 정리한다.

## 4. 기존 사용자 1회성 제안 배너

파생본을 그대로 쓰던 기존 사용자는 홈에서 거의 같은 문장을 두 번 본다
("나는 매일 30분 책을 읽는다" / "매일 30분 책을 읽는다"). 버그처럼 읽히므로 한 번
안내한다.

새 컴포넌트: `components/home/DeclarationNudgeCard.tsx`

- **판정** — 파생 함수를 되살리지 않는다. 두 문장은 접두사만 다른 관계이므로
  순수 문자열 비교로 충분하다: 정규화한 다짐이 정규화한 목표로 끝나면
  "사실상 같은 문장"으로 본다. 둘을 이미 다르게 쓴 사용자에겐 뜨지 않는다.
- **dismiss** — `RecommitCard` 의 localStorage 패턴을 재사용하되 날짜별이 아니라
  영구 1회성 키를 쓴다.
- **위치** — 홈 조건부 배너 그룹. `RecommitCard` 다음, `SlotUnlockBanner` 앞.
- **문구** — "다짐과 목표가 같은 문장이에요. 다짐은 '이미 성공한 나'로 바꿔보면
  어떨까요?" → `[설정에서 바꾸기]` `[괜찮아요]`
- 설정 딥링크는 기존 `?sheet=affirmations` 경로를 쓴다.

## 5. 위젯

Android `WidgetUi.kt` 의 섹션 라벨은 이미 `"VOW · 성공한 나의 다짐"` 으로 방향이
맞다. 문구를 더 다듬어도 APK 재빌드가 필요하므로 이 작업에 포함하지 않고 대기 중인
다른 네이티브 변경과 함께 다음 빌드에 묶는다.

## 6. 검증

1. `npx tsc --noEmit` 클린
2. 변경분 `npx eslint` 클린
3. `npm run build` 성공
4. 4개 로케일 키 세트 동일성 — 추가·삭제 키가 ko/en/es/zh 에 빠짐없이 반영됐는지
5. 수동 — 신규 계정 온보딩 완주 후 홈에서 두 문장이 서로 다르게 뜨는지
6. 수동 — 파생본을 쓰던 계정에서 제안 배너가 뜨고, 닫으면 다시 안 뜨는지

## 범위에서 제외

- 위젯 문구 (네이티브 빌드 필요 — 다음 APK 에 묶는다)
- 기존 다짐의 자동 변환 (AI 필요·되돌리기 어려움 — 사용자가 직접 고친다)
- 다짐 2개 이상 추가 흐름 (설정에서 기존과 동일하게 동작)
