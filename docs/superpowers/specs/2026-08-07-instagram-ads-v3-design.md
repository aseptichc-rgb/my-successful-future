# Instagram Ads EN v3 — 통일 캐러셀 설계

- 날짜: 2026-08-07
- 대체 대상: `Instagram Ads EN v2 (standalone).html`
- 산출물: `Instagram Ads EN v3 (standalone).html`

## 1. 문제 정의

v2는 5장짜리 인스타그램 소재 세트지만, 캐러셀로 이어 붙였을 때 한 편으로 읽히지 않는다.

### 1-1. 비주얼 불일치

| 슬라이드 | 배경 | 디스플레이 서체 | 액센트 | 하단 구조 |
| --- | --- | --- | --- | --- |
| 01 DECLARE | 블랙 라디얼 | Fraunces | 골드 | 카드 |
| 02 ONE MISSION | 인디고 2분할 | **Anton** | 오렌지 | 카드 |
| 03 VOTES | **크림** | Fraunces | 오렌지 | 히트맵 |
| 04 GROWTH | 네이비 + 블루프린트 그리드 | Fraunces | **블루** | 6칸 이모지 |
| 05 MOMENTUM | **오렌지 풀블리드** | Fraunces | 인디고 | CTA 버튼 |

전 장에 걸쳐 고정된 요소는 로고 락업과 mono eyebrow 두 개뿐이다. 배경 세계 5개,
디스플레이 서체 2개, 액센트 4개, 하단 레이아웃 문법 4개가 공존한다.

### 1-2. 카피 결함

1. **저작권/독창성 리스크** — 03번 `Every action is a vote for who you're becoming.`
   는 James Clear 『Atomic Habits』의 "Every action you take is a vote for the type of
   person you wish to become."를 거의 그대로 옮긴 문장이다. 습관 앱 카테고리 사용자에게
   즉시 식별되며, 유료 광고에 출처 없이 노출할 경우 파생 앱이라는 인상만 남는다.
2. **문법 오류** — 05번 헤드라인 `Do today's.`는 소유격 뒤 명사가 없어 문장이 끝나지
   않는다. 원어민에게는 오타로 읽힌다.
3. **어휘 중복** — `becoming.`이 01번과 03번에서 동일한 골드 이탤릭 처리로 반복된다.
4. **지시 대상 부재** — 04번 `You don't chase it. You grow into it.`의 `it`은 해당
   슬라이드 단독 노출 시 지시 대상이 없다.
5. **스텝 체계 붕괴** — eyebrow가 `STEP 01 DECLARE → 02 MISSION → 03 PROOF → 04 GROW`로
   진행하다가 05번에서 `ONE MISSION A DAY`로 규격이 깨진다. 전환이 일어나는 마지막
   장에서 시리즈 신호가 사라진다.
6. **지표 단위 분열** — `Day 12 · streak unbroken`(01), `83% CONSISTENT`(03),
   `STAGE 3 / 6 · 84 VOTES`(04). 서로 다른 세 앱의 스크린샷처럼 읽힌다.

### 1-3. 기술 결함

1. **eyebrow 가독성** — mono eyebrow가 1080px 캔버스 기준 13~17px. 인스타그램 피드
   렌더 폭(약 350px)에서 실효 4~6px이 되어 판독 불가.
2. **1:1 크롭 손실** — 01·05번 헤드라인 블록이 `margin-top:auto`로 하단 정렬되어 있다.
   프로필 그리드의 정사각 크롭에서 헤드라인이 잘린다.
3. **저대비 소형 텍스트** — 오렌지 `#D85A30`는 `#16141A` 위에서 대비 약 4.2:1이다.
   WCAG AA 본문 기준(4.5:1) 미달이므로 소형 텍스트에 사용할 수 없으나, v2 01번은
   15px eyebrow에 사용하고 있다.
4. **이모지 의존** — 04번 성장 사다리가 🌰🌱🌿🍃🌳🌲 이모지로 구성되어 있다. 플랫폼별
   렌더가 다르고, 나머지 슬라이드의 커스텀 타이포와 완성도 격차가 크다.
5. **export 파이프라인 결함 (근본 원인 규명됨)** — `anima-ig-02-two-minds.png`와
   `anima-ig-03-quiet-proof.png`가 바이트 단위로 동일하다
   (md5 `5ecc4309a44ce5ce2230b4c324c1d455`). 두 파일 모두 **백지 PNG**다.

   v3 구현 중 동일 증상을 재현하여 원인을 특정했다. 보드는 캔버스 위에
   `left: 0 / 1260 / 2520 / 3780 / 5040`으로 가로 배치되는데, `html-to-image`는
   대상 노드를 1080px 폭 `foreignObject`로 복제하면서 **computed `left` 오프셋을
   그대로 이관한다.** 따라서 `left: 0`인 첫 보드만 정상 렌더되고, 나머지 네 장은
   캡처 박스 바깥으로 밀려나 백지가 된다.

   v2는 이를 `toPng(node, { style: { left: '0', top: '0' } })`로 막으려 했으나,
   복제 과정에서 복사되는 computed style이 이 오버라이드를 덮어써 무력화된다.
   결과적으로 v2/v1 export는 **첫 장만 유효하고 나머지는 전부 동일한 백지**를
   생성했으며, 사용자가 보관 중인 깨진 PNG 2개가 정확히 이 산출물이다.

   → 해결: `style` 오버라이드에 의존하지 않고, 캡처 직전 **실제 노드를 `left: 0`으로
   이동**시켜 복제 대상의 computed style 자체를 0으로 만든다. 원래 오프셋은
   `finally`에서 복원한다. (§5-3, §6-7 참조)

## 2. 확정 방향

사용자 선택 결과:

- **비주얼**: Obsidian & Gold 단일톤 (v2 01번을 전 장으로 확장)
- **목표**: 설치 전환 (성과형)
- **언어**: 영어 단독
- **분량**: 5장

## 3. 디자인 시스템 (전 슬라이드 고정)

통일성은 "비슷하게 보이는 것"이 아니라 **변하지 않는 상수 집합**으로 구현한다.

### 3-1. 불변 토큰

| 항목 | 값 |
| --- | --- |
| 캔버스 | 1080 × 1350 (4:5), export 2160 × 2700 (pixelRatio 2) |
| 배경 | `radial-gradient(120% 90% at 50% 0%, #26232E 0%, #16141A 46%, #0E0D12 100%)` |
| 본문색 | cream `#F7F3EC` |
| 골드 `#D9A441` | **구조 전용** — eyebrow, 헤어라인, 카드 보더, 라벨 |
| 오렌지 `#D85A30` | **슬라이드당 액센트 1개소** — "지금 살아있는 지점" 표시. 로고 락업의 조리개 점은 전 장 공통 브랜드 상수이므로 이 카운트에서 제외한다 |
| 디스플레이 | Fraunces 300 (Anton 전면 제거) |
| UI/라벨 | Inter |
| mono | JetBrains Mono |
| 이모지 | 사용 금지 |

### 3-2. 불변 레이아웃 뼈대

모든 슬라이드가 동일한 5밴드 구조를 따른다. 밴드의 y 위치와 패딩은 전 장 동일하며,
내용만 교체된다.

```
padding: 96px 88px
┌──────────────────────────────────────┐
│ [A] 상단바   ◐ anima      NO.0n · TAG │  로고 락업 좌 / eyebrow 우
│                                       │
│ [B] 헤드라인 밴드                      │  중앙 정렬 밴드 — 1:1 크롭 안전지대
│     Fraunces 300, 그리드 스냅 크기     │
│                                       │
│ ──────────────────────────────────── │  [C] 골드 헤어라인 (고정 y)
│ ┌──────────────────────────────────┐ │
│ │ [D] proof 카드                    │ │  보더·radius·패딩 전 장 동일
│ │     내용만 슬라이드별로 교체       │ │
│ └──────────────────────────────────┘ │
│ [E] 러닝 메트릭   DAY nn              │  단일 지표
└──────────────────────────────────────┘
```

- **[B] 헤드라인 밴드**: `margin: auto 0`로 **수직 중앙 배치**. v2의 `margin-top:auto`
  하단 정렬을 폐기하여 1:1 크롭에서 헤드라인이 보존되도록 한다.
- **[D] proof 카드**: `border: 1px solid rgba(217,164,65,.28)`, `border-radius: 20px`,
  `background: rgba(247,243,236,.035)`, `padding: 34px 36px` — 5장 전부 동일.

### 3-3. 타이포 스케일 (가독성 하한 반영)

| 역할 | 크기 | 근거 |
| --- | --- | --- |
| eyebrow (mono) | **22px** | 1080 기준 22px = 피드 렌더 약 7px. v2의 13~17px 문제 해소 |
| 헤드라인 | 88 ~ 116px | 슬라이드별 글자 수에 맞춰 조정, 전부 Fraunces 300 |
| 카드 라벨 (mono) | 22px | eyebrow와 동일 하한 |
| 카드 본문 | 34 ~ 44px | |
| 러닝 메트릭 (mono) | 24px | |

**오렌지 사용 규칙**: `#D85A30`는 헤드라인 강조(대형)와 포인트 요소에만 사용한다.
22px 이하 텍스트에는 사용하지 않는다.

## 4. 카피 (영어, 설치 전환형)

### 4-1. 슬라이드 구성

| # | 역할 | eyebrow | 헤드라인 | proof 카드 | 메트릭 |
| --- | --- | --- | --- | --- | --- |
| 01 | 훅 | `NO.01 · THE IDEA` | A dream is just *today*, repeated. | 선언 입력 + 오렌지 커서 | `DAY 01` |
| 02 | 작동원리 | `NO.02 · HOW` | Your whole dream, cut down to *one thing* before noon. | IF → THEN | `DAY 04` |
| 03 | 증거 | `NO.03 · PROOF` | 25 of the last 30 days. That's not motivation — that's a *system*. | 30일 히트맵 | `DAY 12` |
| 04 | 보상 | `NO.04 · WHO` | 84 days in, it isn't discipline anymore. It's just *who you are*. | 골드 6분할 성장 바 | `DAY 84` |
| 05 | CTA | `NO.05 · START` | Declare it tonight. *Do it by noon.* | `GET THE APP →` | `DAY 01 · yours` |

*이탤릭 = Fraunces italic + 골드 강조*

### 4-2. 설계 근거

1. **최고 카피를 1번으로.** 캐러셀은 1장이 노출의 대부분을 가져가고 후반부로 갈수록
   이탈한다. v2에서 2번에 있던 `A dream is just today, repeated.`를 훅으로 올리고,
   5번 부제에 묻혀 있던 `before noon` 베네핏을 2번으로 승격한다.
2. **지표를 하나로 통합.** 서로 다른 세 지표 대신 **같은 사용자의 DAY 카운터**가
   `01 → 04 → 12 → 84`로 성장한다. 5번에서 `DAY 01 · yours`로 시청자에게 넘겨
   CTA와 서사를 연결한다. 이것이 5장을 한 편으로 묶는 핵심 장치다.
3. **인용문 제거.** Atomic Habits 파생 문장을 삭제하고, 앱의 실제 히트맵 데이터
   (30일 중 25일 = 83%)를 근거로 하는 자체 문장으로 교체한다. 데이터는 v2의
   `on[]` 배열과 동일하게 유지하여 스토어 스크린샷과 일치시킨다.
4. **문법 수정.** `Do today's.` → `Do it by noon.`
5. **`becoming` 0회.** identity 페이오프는 04번의 `It's just who you are.`가 담당한다.
6. **eyebrow 규격 통일.** `NO.0n · TAG` 형식을 5장 전부에 적용하여 v2의 05번
   규격 붕괴를 해소한다.

### 4-3. 카드 본문

- **01**: 라벨 `TONIGHT'S DECLARATION` / 본문 `I am a founder who ships something real` + 오렌지 커서
  (라벨을 `TONIGHT'S`로 잡아 05번 헤드라인 `Declare it tonight.`과 수미상관을 만들고,
  동시에 `becoming` 사용 횟수를 0으로 유지한다)
- **02**: 라벨 `TODAY'S IF–THEN` / `IF` `it's 7:00am and I've finished my coffee` / `THEN` `I write one commit before email`
- **03**: 라벨 `LAST 30 DAYS` + `83% CONSISTENT` / 15열 히트맵 그리드
- **04**: 라벨 `SEED → FOREST` / 6분할 진행 바 (3칸 채움, 3번째 칸 오렌지) + `STAGE 3 / 6`
- **05**: CTA 버튼 + `iOS · Android · Free to start`

## 5. 구현

### 5-1. 파일

- 신규: `Instagram Ads EN v3 (standalone).html`
- 삭제: `anima-ig-02-two-minds.png`, `anima-ig-03-quiet-proof.png`
  — §1-3-5의 백지 PNG 2개. 내용이 없으므로 보존 가치가 없다.
- **보존**: `anima-ig-01-obsidian-gold.png` — 당초 삭제 대상이었으나,
  `components/ui/BootSplash.tsx`가 이 파일을 앱 부팅 스플래시의 아트디렉션
  원본으로 명시하고 있다(흑요석 배경 · 크림 세리프 · 마지막 단어만 골드 이탤릭).
  v3이 채택한 Obsidian & Gold 언어의 출처이므로 유지한다.
- v2 파일은 참조용으로 보존

### 5-2. 의존성

리포지토리의 기존 `design/*.html` 컨벤션을 따른다.

- 폰트: Google Fonts CDN `<link>` (Fraunces / Inter / JetBrains Mono)
- PNG export: `https://unpkg.com/html-to-image@1.11.13/dist/html-to-image.js` (버전 고정)

### 5-3. Export

v2의 `renderAd` / `downloadAd` 골격을 유지하되, §1-3-5의 오프셋 결함을 수정한다.

- 개별 다운로드 버튼 × 5 + 일괄 다운로드 버튼 1
- `document.fonts.ready` 대기 후 렌더
- `pixelRatio: 2` → 2160 × 2700 PNG
- 파일명: `anima-ig-v3-0n-<slug>.png`
- **캡처 직전 대상 노드를 `left: 0`으로 이동**(+`z-index` 상향)하고, `finally`에서
  원래 오프셋과 z-index를 복원한다. `style: { left, top }` 오버라이드는 신뢰할 수
  없으므로 사용하지 않는다.

검증 결과 (Chrome headless, 2026-08-07): 5장 모두 2160×2700 / 2.3~2.4MB /
서로 다른 md5로 출력됨. 수정 전에는 1장만 유효(2370KB)하고 2~5장이 동일한
백지 120KB PNG(md5 `5ecc4309…`)로 생성되어 결함을 재현했다.

### 5-4. 오류 처리

CLAUDE.md 품질 기준(비동기 로직 try-catch)에 따라:

- `renderAd`, `downloadAd`, 일괄 다운로드 루프 전부 try-catch로 감싼다.
- 실패 시 상태 표시줄에 사유를 노출하고, 숨겼던 chrome(캡션·툴바)을 `finally`에서
  반드시 복원한다. v2는 예외 발생 시 chrome이 숨겨진 채 남는 결함이 있다.
- 일괄 다운로드는 개별 실패가 전체 루프를 중단시키지 않도록 하고, 최종 성공/실패
  건수를 보고한다.

### 5-5. 중복 제거 (DRY)

v2는 5개 슬라이드가 각각 인라인 스타일로 상단바·카드를 반복 정의한다. v3은 공용
클래스로 승격한다.

- `.ad` — 캔버스 + 배경 (전 장 동일, 인라인 배경 제거)
- `.topbar`, `.eyebrow`, `.headline`, `.hairline`, `.card`, `.cardlabel`, `.metric`
- 매직 넘버는 `:root` CSS 변수로 승격 (`--pad`, `--card-radius`, `--eyebrow-size` 등)

## 6. 검증 기준

1. 5장 모두 배경 그라데이션 선언이 동일한 단일 CSS 클래스에서 나온다.
2. 문서 전체에 Anton 참조 0건, 이모지 0건.
3. 모든 mono 텍스트가 22px 이상.
4. 각 슬라이드에서 오렌지 `#D85A30` 액센트가 1개소 (로고 조리개 점 제외).
5. 헤드라인 블록이 캔버스 수직 중앙 밴드에 위치하여 중앙 1080×1080 크롭에 온전히 포함된다.
6. `becoming` 0회, `Do today's` 0건, Atomic Habits 파생 문장 0건.
7. 5장의 PNG가 서로 다른 md5를 가진다.
