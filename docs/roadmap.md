# Anima 제품 발전 로드맵

- 날짜: 2026-07-30
- 상태: 승인됨

> **비전**: 초기에는 아주 간단하게 — 목표를 설정하고 작은 행동을 하나씩 하며
> 성취감을 높이는 것에서 시작해서, 시간이 지남에 따라 점점 스스로에게 동기부여를
> 하고 이를 코칭해주는 자기관리 앱으로.

**코칭 발전 축**: 반응형 룰베이스(현재) → **P1·P2** 능동형 룰베이스(알림·슬럼프 감지)
→ **P3** AI 회고 코멘트 → **P4** 대화형 AI 코치

**운영 원칙**

- 각 Phase는 **스토어 출시 가능한 완결 단위**다 (Android 내부테스트 + iOS 심사 진행 중인
  실제 배포 앱이므로).
- Phase 말미의 **성공 지표가 다음 Phase 진입 조건**이다. 지표 없이 다음 단계로 가지 않는다.
- **작업 단위** = 세션 1회 분량의 완결된 커밋(반나절~1일).
- 기존 설계 철학을 로드맵 수준에서 유지한다: 입력 부담 최소화(원탭 우선, 타이핑은 항상
  선택), 행동과학 근거 명시, LLM 실패 시 룰베이스 폴백 필수, 정책은 순수 함수로 분리.

---

## 0. 현재 위치 진단

비전을 3개 축으로 나누면 현재 위치는 다음과 같다.

| 비전 축 | 상태 | 근거 |
|---|---|---|
| ① 간단한 목표 + 작은 행동 + 성취감 | **거의 완성 (~90%)** | 온보딩 4단계(`app/onboarding/`), 1탭 체크(`components/home/TodayCard.tsx`), 즉시 보상(`CheckinReward.tsx`), 스트릭+회복탄력성(`lib/goalStreak.ts`), 성장 6단계(`lib/growthStage.ts`), 슬롯 해금(`lib/goalSlots.ts`), 스텝업(`lib/goalStepUp.ts`), `/progress`, `/record/history` |
| ② 스스로에게 동기부여 | **콘텐츠는 풍부, 전달은 반응형뿐 (~60%)** | 데일리 카드(`lib/dailyMotivation.ts`)·미래 자아(`lib/futureSelfPortrait.ts`, `lib/futureVision.ts`)·정체성 장부(`lib/identityEvidence.ts`)·RecommitCard 등 자산은 많으나 **전부 앱을 연 사용자에게만 작동**. 동기가 꺼진(앱을 안 여는) 사용자를 되살리는 경로가 없음 |
| ③ 코칭 | **초기 단계 (~20%)** | 단발 AI 리라이트(`lib/affirmationCoach.ts`)와 룰베이스 주간 회고(`lib/weeklyReview.ts`)뿐. 개인 데이터를 읽고 해석하는 코치·대화·능동 개입 없음 |

**병목은 기능 부족이 아니라 "능동성"이다.** Android에는 고정 시각 로컬 알림 2종
(08:00 다짐 / 21:00 기록, `android/app/src/main/java/com/michaelkim/anima/work/`)이
있으나 KST 하드코딩(`WorkScheduler.kt`의 `ZoneId.of("Asia/Seoul")`) 상태이고, iOS에는
알림 코드가 전혀 없으며, 설정 화면(`app/settings/page.tsx`)에 알림 제어가 없다.

따라서 로드맵의 순서는:
**(1) 능동 전달 채널 완성 → (2) 능동 개입 로직(슬럼프) → (3) 데이터 해석 AI → (4) 대화 AI.**
AI를 뒤에 두는 이유: 능동 채널과 측정 기반 없이 AI 코칭을 얹으면 검증도 전달도 불가능하다.

플랫폼 구성 참고: Android는 네이티브 Kotlin 앱(`android/`), iOS는 Capacitor 웹뷰 셸
(`ios-webview-shell/`, `ios-templates/plugin/`의 Swift 브리지 플러그인 패턴). 알림처럼
플랫폼별 구현이 갈리는 기능은 **정책은 웹 레이어(lib/) 단일 소스, 플랫폼은 실행만**을
원칙으로 한다.

---

## Phase 1 — "리듬 만들기": 알림 기반 능동 전달 (룰베이스)

**목표(사용자 가치)**: 앱을 열지 않아도 하루 리듬(아침 다짐 → 낮 실행 → 저녁 체크)이
유지된다. iOS·글로벌 사용자도 동등하게.

전 구간 **로컬 알림만** 사용한다 — 원격 푸시(APNs/FCM 서버)를 도입하지 않아 인프라와
심사 리스크를 만들지 않는다.

**핵심 기능**

1. **알림 정책 단일 소스** — `lib/notificationPolicy.ts` 신규(순수 함수). 알림 유형·시각·
   발송 조건을 한 곳에 정의하고, Android WorkManager와 iOS 플러그인은 실행만 담당.
   *(플랫폼 비대칭 리스크의 구조적 해법)*
2. **iOS 로컬 알림 브리지** — `ios-templates/plugin/`에 NotificationBridgePlugin.swift 추가
   (기존 StoreKit·Widget 플러그인 패턴), 웹 측 `lib/notificationBridge.ts`(기존
   `lib/widgetBridge.ts` 패턴). UNUserNotificationCenter 예약형.
   — *프롬프트/큐(BCT 7.1): 행동 시점에 외부 신호를 배치*
3. **시각 개인화 + 타임존 수정** — `WorkScheduler.kt`의 KST 하드코딩 제거, 사용자 로컬
   타임존 + 설정 시각. `lib/homeMode.ts`의 아침(<12)/저녁(≥18) 정의와 정합 유지.
   — *같은 시각·같은 맥락의 반복이 습관 형성을 촉진 (Lally et al. 2010)*
4. **조건부 저녁 리마인더** — 오늘 목표를 이미 체크했으면 침묵, 미체크 시에만 목표 문구를
   담아 발송. 문구 데이터는 위젯 파이프라인(`app/api/widget/today/route.ts`,
   `lib/iosWidget.ts`) 재사용. — *자기관찰(self-monitoring, BCT 2.3) + 불필요 알림 억제*
5. **설정 화면 알림 제어** — `app/settings/page.tsx`에 유형별 토글·시각 선택. 권한 요청은
   온보딩이 아니라 **첫 체크인 보상 직후** 등 가치를 체감한 시점에.
6. **일요일 회고 알림** — `lib/weeklyReview.ts` 준비 시 주 1회. — *성찰 프롬프트*
7. **지표 기반 마련** — `app/api/admin/stats/route.ts`에 알림 opt-in율·알림 경유 오픈·
   체크인율·리텐션 코호트 추가. **이후 모든 Phase 판정의 기반.**

**기본 발송 정책**: 하루 최대 2건(아침 1 + 조건부 저녁 1). 문구는 i18n 4개 언어 키 분리
(기존 `lib/i18n` 컨벤션).

**성공 지표(다음 Phase 진입 조건)**: 알림 opt-in ≥ 60% / 주당 체크인 일수 증가 /
D7 리텐션 개선 / 알림 전체 off 비율 < 15% / iOS 심사 통과 후 정상 배포.

**규모**: 8~10 작업 단위 (iOS 플러그인 2, Android 리팩터 2, 정책 모듈 1, 설정 UI 1~2,
i18n 1, 지표 1, QA·출시 1).

---

## Phase 2 — "넘어져도 돌아오기": 슬럼프 감지 + 복귀 플로우

**목표(사용자 가치)**: 이탈 직전/이탈한 사용자를 자동 감지해, 자기비난 없이 가장 작은
걸음으로 복귀시킨다. 능동형 룰베이스 코칭의 완성형이자, P3 이후 AI가 개입할 지점의 정의.

**핵심 기능**

1. **슬럼프 상태 판정** — `lib/slump.ts` 신규(순수 함수, 오프라인 동작).
   `lib/goalStreak.ts` + `lib/affirmationCheckin.ts` 이력으로 3단계 판정:
   안정 / 흔들림(2~3일 미체크) / 슬럼프(4일+).
   — *한 번의 lapse는 relapse가 아니며, 초기 개입이 재발을 막는다 (Marlatt & Gordon 재발 방지 모델)*
2. **ComebackCard** — 홈 최상단. `components/home/RecommitCard.tsx`·
   `DeclarationNudgeCard.tsx` 패턴 재사용. 자기비난 배제 카피 + 원탭 "다시 시작".
   — *실패 후 자기자비가 자기조절 동기를 회복시킨다 (Breines & Chen 2012)*
3. **스텝다운 제안** — `lib/goalStepUp.ts`·`StepUpCard.tsx`의 역방향: 복귀 시 수량 절반을
   원탭 제안. — *작은 성공 경험(mastery experience)이 자기효능감을 회복 (Bandura 1977)*
4. **프레시 스타트 알림** — 슬럼프 상태 사용자에게만, 월요일/월초 1회. P1의
   `notificationPolicy` 위에 조건 하나를 얹는다 — 신규 인프라 없음.
   — *시간적 랜드마크가 재시작 동기를 높인다 (fresh start effect, Dai·Milkman·Riis 2014)*
5. **회고 슬럼프 분기** — `lib/weeklyReview.ts`에 "쉬어간 주" 서사 + 회복탄력성 수치 노출.
   — *lapse를 실패가 아닌 데이터로 리프레이밍*
6. **성장 단계 보호 명문화** — 슬럼프로 `lib/growthStage.ts` 단계가 강등되지 않음을
   확인하고 문서·UI에 명시. — *손실 회피가 복귀 동기를 꺾지 않도록*

**성공 지표**: 슬럼프 진입자의 7일 내 복귀율(P1에서 기준선 측정 → 개선) / 복귀 후 2주
유지율 / 프레시 스타트 알림 오픈율 / 알림 해제율 비악화.

**규모**: 6~8 작업 단위.

---

## Phase 3 — "AI가 내 한 주를 읽어준다": AI 회고 코멘트 (비대화형 LLM)

**목표(사용자 가치)**: 룰베이스 회고 위에, 내 데이터를 읽고 해석해주는 AI 코멘트 1문단.
LLM 코칭의 최소 검증 단위이자 프리미엄 가치 축의 시작.

**진입 전제**: P1~P2 지표로 능동 개입이 리텐션을 해치지 않음이 확인된 상태.

**핵심 기능**

1. **주간 AI 코멘트 API** — `/api/weekly-review/comment` 신규.
   `lib/gemini.ts`의 `generateText` + `lib/quota.ts`의 `enforceQuota`(신규 키
   `weeklyReviewComment`, `lib/constants/quota.ts`) + `lib/entitlement.ts`의
   `hasProAccess` 게이팅. **룰베이스 회고는 무료·오프라인 그대로 유지**(weeklyReview의
   의도적 설계), AI 코멘트는 프리미엄 온라인 애드온. 실패·쿼터 초과 시 룰베이스만 노출
   (`lib/affirmationCoach.ts`의 폴백 컨벤션).
   — *행동에 대한 피드백(BCT 2.2)이 목표 지속을 강화*
2. **컨텍스트 조립기** — `lib/reviewContext.ts` 신규(순수 함수). 주간 체크 이력 +
   `lib/identityEvidence.ts` + `lib/missionResponse.ts` + wins에서 최소화된 요약만 추출.
   **수치·사실은 룰베이스가 계산해 전달하고 LLM은 해석만** — 명언 시드
   (`lib/famousQuotesSeed.ts`)와 동일한 환각 방지 철학.
3. **월간 성장 서사** — 월 1회, `lib/growthStage.ts` 단계 전환 시점에
   `/progress`(`app/progress/page.tsx`)에서 "지난 한 달의 나" AI 서사.
   — *축적된 증거를 정체성 서사로 재구성 (identity-based habits)*
4. **원탭 품질 피드백** — "도움됐어요/별로예요" → admin/stats 집계.
   **P4(대화형) 진입 여부를 판정하는 핵심 데이터.**
5. **안전 가드** — 프롬프트에 의료·심리치료 조언 금지 명시, 위기 언어 감지 시 룰베이스
   안내로 폴백 (iOS 심사·윤리 동시 대비).

**성공 지표**: 프리미엄 사용자의 AI 코멘트 열람률 ≥ 70% / "도움됨" ≥ 60% / 회고 완료율
상승 / 사용자당 주간 토큰 비용 목표 단가 이하(`lib/tokenUsage.ts` 모니터링) /
트라이얼→유료 전환 기여 확인.

**규모**: 6~8 작업 단위.

---

## Phase 4 — "대화하는 코치": 구조화된 대화형 AI 코치 (프리미엄 핵심)

**목표(사용자 가치)**: 회고·슬럼프 맥락에서 시작해 **행동으로 끝나는 짧은 대화**.
자유 챗봇이 아니다 — 입력 부담 최소화 철학을 대화에도 적용한다.

**핵심 기능**

1. **코치 세션(최대 3턴)** — AI 회고 코멘트 뒤 "한 가지만 물어봐도 될까요?" → 열린 질문
   1개 → 사용자 답(**선택지 칩 기본, 타이핑은 선택**) → 코치 응답 + 행동 제안.
   — *동기면담(MI)의 열린 질문·유발 (Miller & Rollnick); 행동에 대해 묻는 것 자체가
   실행률을 높인다 (question-behavior effect, Wood et al. 2016 메타분석)*
2. **대화→행동 종결 규칙** — 마지막 턴은 반드시 원탭 액션으로 끝난다:
   WOOP 실행계획 초안(`lib/executionPlan.ts`의 원탭 초안 패턴 재사용) / 수량 조정
   (`lib/goalStepUp.ts`) / 재다짐.
   — *의도를 if-then으로 구체화하면 실행률 상승 (implementation intentions, Gollwitzer 1999)*
3. **코치 스타일 자산 승격** — `lib/affirmationCoach.ts`의 process/question/identity
   3스타일 프롬프트를 `lib/coachStyle.ts`로 추출해 공유.
4. **코치 메모리** — `users/{uid}/coach/summary` 문서에 세션당 1~2문장 요약만 저장
   (원문 로그 장기 보관 금지 — 프라이버시·비용), 다음 세션 컨텍스트로 주입.
5. **쿼터·비용·게이팅** — `DAILY_QUOTA`에 `coachTurns`(예: 12/일) + 세션 주 2회 소프트 캡
   + `lib/tokenUsage.ts` + 프리미엄 전용(`ENTITLEMENT_REQUIRED` 경로).
6. **심사 대비** — AI 생성 콘텐츠 고지, 부적절 응답 신고 버튼, "의료·치료가 아님" 문구,
   연령 등급 재확인.

**출시 분할**: 4a 단일 질문→답→제안(1턴) → 4b 3턴+메모리 → 4c 슬럼프 진입점 연결.

**성공 지표**: 대화 시작률(코멘트 노출 대비) / 대화→행동 전환율 ≥ 40% / 코치 사용자 vs
미사용자 4주 유지율 / 프리미엄 전환·유지 개선 / 사용자당 비용 상한 준수.

**규모**: 10~12 작업 단위.

---

## 그 이후 (비전 백로그 — 약속 아님)

- 능동형 AI: 알림 문구 자체를 코치가 개인화 (사전 생성·캐시로 비용 통제)
- 온보딩에서 코치와의 첫 만남
- 회고 음성 입력 (입력 부담 추가 하향)

---

## 리스크와 가드레일 (전 Phase 공통)

1. **LLM 비용·쿼터**: 모든 신규 LLM 기능은 `enforceQuota` + `tokenUsage` 필수(기존 컨벤션),
   캐시 우선(`lib/dailyMotivation.ts`의 첫 생성 무과금·재생성 과금 정책 준용), 룰베이스
   폴백 필수. 프리미엄 게이팅으로 비용-수익 정렬.
2. **알림 피로(notification fatigue)**: 기본 하루 최대 2건, 이미 한 일에는 침묵(조건부
   억제), 유형별 개별 토글, 2주간 알림 무반응 시 자동 빈도 축소, 신규 알림 유형은 기존
   유형 지표 확인 후에만 추가.
3. **iOS 심사**: 전 구간 로컬 알림만 사용(원격 푸시 서버 불필요 → 인프라·심사 리스크
   최소), AI 콘텐츠 고지·신고 수단(P4), 의료·정신건강 효능 주장 금지 — 스토어 문구
   (`docs/app-store-listing-*.md`) 포함 점검.
4. **입력 부담 증가 금지**: "원탭 우선, 타이핑은 항상 선택" 원칙을 로드맵 수준에서 명문화.
   대화형 코치조차 선택지 칩이 기본.
5. **측정 인프라**: 성공 지표 다수가 현재 admin/stats에 없다 → P1에 지표 작업을 포함해
   기준선부터 확보. 지표 없이는 Phase 전환 판정 불가.
6. **플랫폼 비대칭**: Android(네이티브 Kotlin + WorkManager)와 iOS(Capacitor 웹뷰 +
   Swift 플러그인)의 알림 구현이 완전히 별개 → 정책은 `lib/notificationPolicy.ts` 단일
   소스, 플랫폼은 실행만.

---

## 구현 세션을 위한 결합 지점 (검증됨)

| 지점 | 역할 |
|---|---|
| `android/app/src/main/java/com/michaelkim/anima/work/WorkScheduler.kt` | 기존 Android 알림 스케줄러 — KST 하드코딩 해소 + 개인화의 출발점 (P1) |
| `lib/weeklyReview.ts` | 룰베이스 회고 — P2 슬럼프 분기, P3 AI 코멘트가 얹히는 기반 |
| `lib/gemini.ts` `generateText` | LLM 단일 진입점 (P3·P4) |
| `lib/quota.ts` `enforceQuota` + `lib/constants/quota.ts` `DAILY_QUOTA` | 신규 LLM 기능마다 쿼터 키 추가 (P3·P4) |
| `lib/entitlement.ts` `hasProAccess` | 프리미엄 게이팅 결합 지점 (P3·P4) |
| `lib/goalStreak.ts` | 스트릭·회복탄력성 데이터 — `lib/slump.ts` 판정의 입력 (P2) |
