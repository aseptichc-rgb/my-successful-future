# Motivator · Home Redesign Patch v1.1

> Anima 브랜드 시스템에 맞춰 `app/layout.tsx`, `app/globals.css`, `app/home/page.tsx`, `components/home/MotivationCard.tsx`, `components/affirmations/AffirmationCheckin.tsx` 다섯 파일을 재작성/패치한 패키지입니다. 비즈니스 로직(Firebase, i18n, qDate 핸드오프, TWA 위젯 브릿지)은 전부 보존됐고, **시각/인터랙션만** 바뀌었습니다.

## v1.1 변경 (v1.0 → v1.1)

실기기 테스트에서 발견된 두 가지 큰 이슈를 수정했습니다.

### 1. Samsung Internet · 강제 다크 모드 차단

증상: 사용자 기기에서 cream 배경이 검은색으로 반전돼 렌더링.
원인: Samsung Internet, 일부 Chrome의 "night mode" 기능이 페이지 색을 자동 반전.
수정:
- `app/layout.tsx` — `Viewport.themeColor`를 light 단일로, `colorScheme: "light"` 추가, `<meta name="color-scheme" content="only light" />` 헤드에 주입, `<html style={{ colorScheme: "light" }}>`
- `app/globals.css` — `html, body { color-scheme: light; }` 추가

### 2. 한글 italic / 와이드 tracking 제거

증상: Fraunces가 라틴 전용이라 한글은 시스템 명조로 폴백 → italic이 강제 oblique로 적용돼 어색. mono+wide-tracking이 한글 음절을 떨어뜨려 보임.
수정:
- Fraunces italic → 라틴 숫자(01, 02)에만. 한글 본문(인용·페르소나·미션·다짐 타깃·placeholder)에서 `italic` 클래스 모두 제거.
- 인용 강조: `font-light italic text-soul` → `font-medium text-soul` (색 + 굵기로만 강조).
- 한글 라벨(`섹션 헤더`, `편집/취소/저장됨/추가` 등)에서 `font-mono uppercase tracking-[0.14~0.18em]` → `text-[12px] font-medium tracking-[-0.005em]` (Pretendard 자연 한글).
- 라틴 메타(`5 · 24 · WEEK 21`, `STREAK 1`, `01`, `02`)는 mono + 적정 tracking 유지.

---

## 적용 방법

1. `patch/` 폴더 안의 파일들을 `my-successful-future/` 동일 경로에 덮어쓰세요:
   - `patch/app/layout.tsx` → `app/layout.tsx`
   - `patch/app/globals.css` → `app/globals.css`
   - `patch/app/home/page.tsx` → `app/home/page.tsx`
   - `patch/components/home/MotivationCard.tsx` → `components/home/MotivationCard.tsx`
   - `patch/components/affirmations/AffirmationCheckin.tsx` → `components/affirmations/AffirmationCheckin.tsx`
2. `npm run dev` 로 확인. 콘솔에 i18n key 미스 경고가 뜨면 아래 "i18n 추가 권장 키" 참조.
3. **Samsung Internet에서 night mode를 ON으로 둔 채 테스트**해보세요 — 우리 페이지가 light 톤 그대로 나와야 정상.

## 변경 요약 (파일별)

### `app/layout.tsx` (NEW)

- `Viewport.themeColor` light 단일 값으로 (다크 항목 제거)
- `Viewport.colorScheme = "light"` 추가
- `<html style={{ colorScheme: "light" }}>`
- `<meta name="color-scheme" content="only light" />` 헤드에 주입

### `app/globals.css` (NEW)

- `html, body` 블록에 `color-scheme: light;` 한 줄 추가 — 그 외 변경 없음.

### `app/home/page.tsx`

| 영역 | 변경 |
|------|------|
| 헤더 | 흰 배경 + H1 "오늘" 제거 → 메타 스트립 (날짜 mono · 라틴 톤 + streak + gear) |
| 탭 | 알약 안의 알약 → 텍스트 + 1.5px Soul 밑줄 인디케이터, 라틴 count badge mono |
| 카드 | 모든 흰 rounded-16 + shadow 카드 제거 → cream + hairline 분리 |
| 섹션 아이콘 | H2 옆 SVG 전부 삭제 |
| 섹션 헤더 | 한글 깨끗한 sans 라벨 (12px · medium · 음수 tracking · indigo/55) |
| 미래의 나 | 카드 → 직접 본문. Fraunces 300 light (italic 제거) 17px |
| 목표 | 컨트롤 hidden, 편집 모드 토글로만 노출. 번호 = Fraunces italic Soul 22px (Latin) |
| 잘한 일 | 600ms debounce auto-save, 저장 버튼 제거 |
| 로딩 | 1.5px 얇은 spinner |

### `components/home/MotivationCard.tsx`

| 영역 | 변경 |
|------|------|
| 배경 | 보라 그라데이션 **제거** → cream 평면 |
| Tone 분기 | dark/light 분기 전체 삭제 |
| 인용문 | 700 sans → Fraunces 300 (italic 없음, 한글에서 자연) 26–30px |
| 인용문 강조 | `quoteEmphasis` 단어를 medium + Soul 색으로 (italic 없음) |
| 미션 박스 | 박스-안-박스-안-박스 → hairline + left border accent |
| 액션 바 | fill button → 텍스트 링크 (단, 한글 라벨이라 sans medium) |
| 잠금화면 PNG | Canvas는 그대로 — 카메라 롤용 그라데이션 유지. 인용은 Fraunces italic OK (Canvas에서는 italic 한글이 시스템 명조로 적당히 렌더됨) |

### `components/affirmations/AffirmationCheckin.tsx`

| 영역 | 변경 |
|------|------|
| 컨테이너 | rounded 회색 박스 제거 |
| 입력 박스 | border + bg 박스 → border-bottom only (hairline → Soul on match) |
| 번호 | Fraunces italic Soul 22px (Latin 01/02) |
| 목표 텍스트 | ghost (Pretendard 300, italic 없음) |
| streak | 🔥 + 알약 → Soul glow dot + 한글 sans label |
| 제출 버튼 | 알약 → 텍스트 링크 (한글이라 sans medium) |
| Tone 분기 | 전체 삭제 |

## 디자인 토큰 — 신규 추가 0개

여전히 모두 `app/globals.css`의 기존 Anima 토큰만 사용.

## 활자 처리 규칙 (한글 친화)

| 컨텍스트 | 처리 |
|---------|------|
| 본문 / 섹션 헤더 / 버튼 라벨 (한글) | `text-[12~14px] font-medium tracking-[-0.005em]` (Pretendard) |
| 인용문·페르소나·미션 (한글) | `font-display font-light` (Fraunces → Korean serif fallback, italic 없음) |
| 라틴 mono (날짜·STREAK·count) | `font-mono text-[10~11px] uppercase tracking-[0.06~0.16em]` |
| 번호 표시 (01, 02 Latin) | `font-display font-light italic text-soul` |
| 강조 단어 (인용 안의 한 부분) | `font-medium text-soul` (italic 안 씀) |

## i18n 추가 권장 키

이전과 동일. 카피 변경은 권장이고 강제는 아닙니다.

```
home.wins.title:  "잘한 일 3가지" → "오늘의 작은 승리"
home.future.title:  "10년 후의 나의 모습" → "10년 후의 나"
home.goals.title:  "나의 목표" → "이번 달 목표"
common.done:  "완료"  (편집 모드 종료용)
```

## 인터랙션 차이

이전과 동일.

## 적용 후 확인 체크리스트

- [ ] `/home` 첫 로드 시 **cream 배경** (Samsung Internet night mode ON 상태에서도)
- [ ] 우상단 streak dot · 숫자 표시 (한글 "X일째 연속" 자연 sans)
- [ ] 인용문이 Fraunces light, **italic 없이** 깨끗한 serif 톤
- [ ] 강조 단어는 색(Soul) + medium 굵기로만 다르게 표시
- [ ] 섹션 라벨이 한글 sans, 자연 자간 (음절이 분리돼 보이지 않음)
- [ ] 탭/버튼 라벨 "오늘", "나의 행동", "편집", "취소" 등이 깨끗한 한글 sans
- [ ] 라틴 메타(STREAK, 01, 02, WEEK XX)만 mono 톤
- [ ] 목표 행 평시 X 안 보임, 편집 클릭 후만 노출
- [ ] 잘한 일 입력 → 1초쯤 "저장됨" 안내

## 향후 Phase

이번 v1.1 패치는 시각/인터랙션 + 다크 모드 차단 + 활자 한글 친화까지 포함. Phase 4 IA 재정렬(오늘 ↔ 나)은 별도 PR.

---

*motivator · home redesign patch · v1.1 · 2026-05-24*


## 적용 방법

1. `patch/` 폴더 안의 파일들을 `my-successful-future/` 동일 경로에 덮어쓰세요:
   - `patch/app/home/page.tsx` → `app/home/page.tsx`
   - `patch/components/home/MotivationCard.tsx` → `components/home/MotivationCard.tsx`
   - `patch/components/affirmations/AffirmationCheckin.tsx` → `components/affirmations/AffirmationCheckin.tsx`
2. `app/globals.css` 는 **수정 불필요** — 기존 Anima 토큰만 사용했습니다.
3. `npm run dev` 로 확인. 콘솔에 i18n key 미스 경고가 뜨면 아래 "i18n 추가 권장 키" 참조.

## 변경 요약 (파일별)

### `app/home/page.tsx`

| 영역 | 변경 |
|------|------|
| 헤더 | 흰 배경 + H1 "오늘" 제거 → mono 메타 스트립 (날짜·요일·주차) + streak dot + gear icon |
| 탭 | 알약 안의 알약 → 텍스트 + 1.5px Soul 밑줄 인디케이터, mono count badge |
| 카드 | 모든 흰 rounded-16 + shadow-apple 카드 제거 → cream + hairline 분리 |
| 섹션 아이콘 | H2 옆 SVG(별·동심원·체크) 전부 삭제 |
| 섹션 헤더 | uppercase 11px mono 0.16em letter-spacing — 모든 섹션 동일 패턴 |
| 미래의 나 | 카드 → 직접 본문. Fraunces 300 italic 17px |
| 목표 | 체크박스·X 버튼 항상 노출 → **편집 모드 토글** 후에만 노출. 번호는 Fraunces italic Soul 22px |
| 잘한 일 | 박스 + 저장 버튼 → border 없는 textarea + **600ms debounce auto-save**. 우상단 mono 토스트 "저장됨" 1.8초 |
| 로딩 | 큰 indigo border → 1.5px 가는 spinner |

### `components/home/MotivationCard.tsx`

| 영역 | 변경 |
|------|------|
| 배경 | `linear-gradient(135deg, #1E1B4B → #7C3AED)` 보라 그라데이션 **제거** → cream 평면 |
| Tone 분기 | `dark`/`light` 분기 전체 삭제 — 항상 indigo on cream |
| 인용문 | `font-weight: 700` sans → **Fraunces 300 italic 26–30px** |
| 인용문 강조 | 선택 단어 1개만 Soul italic 강조 — 백엔드가 `quoteEmphasis` 필드 채울 때 자동 적용 (없으면 plain) |
| 미션 박스 | 박스-안-박스-안-박스 → hairline 1줄 + left border accent |
| 액션 바 | 잠금화면 받기 fill button + 다시 받기 ghost → **둘 다 mono 텍스트 링크** |
| 잠금화면 PNG | 그대로 유지 (Canvas는 그라데이션 OK — 카메라 롤용). 단, 인용 폰트는 Fraunces italic으로 통일 |

### `components/affirmations/AffirmationCheckin.tsx`

| 영역 | 변경 |
|------|------|
| 컨테이너 | `rounded-14 bg-black/4` 회색 박스 제거 |
| 입력 박스 | `border + bg-white` 박스 → border-bottom only (hairline → Soul on match/error) |
| 번호 | Inter semibold → **Fraunces 300 italic Soul 22px**, 완료 시 ✓ Soul |
| 목표 텍스트 | placeholder로만 표시 → ghost italic으로 행 위에 명시 (사용자가 "무엇을 적어야 하나" 매번 안 떠올려도 됨) |
| streak | "🔥" 이모지 + 알약 → Soul glow dot + mono uppercase (페이지 헤더와 동일 형식) |
| 제출 버튼 | indigo fill 알약 → mono 텍스트 링크 Soul |
| Tone 분기 | dark/light 전체 삭제 — 항상 light. tone prop은 호환을 위해 받지만 무시 |

## 디자인 토큰 — 신규 추가 0개

모두 `app/globals.css`의 기존 Anima 토큰만 사용:
- `bg-cream` `bg-soul` `bg-hairline`
- `text-indigo` (+ opacity `/40` `/45` `/55` `/60`)
- `text-soul` `text-soul-press`
- `border-hairline`
- `font-display` `font-mono` `font-sans`

신규 색·폰트 추가 **없음**. 단순히 일관 적용으로 다른 시각이 되는 게 핵심.

## i18n 추가 권장 키

대부분 기존 키 그대로 사용했지만, 카피 톤을 권장값으로 바꿀 경우:

```ts
// lib/i18n/ko (또는 해당 catalog)
home.wins.title:  "잘한 일 3가지" → "오늘의 작은 승리"
home.wins.subtitle:  "오늘 잘한 일을 적어주세요" → "한 줄로 적어주세요"
home.wins.placeholder1/2/3:  ghost italic으로 표시되므로 더 짧은 prompt로
home.future.title:  "10년 후의 나의 모습" → "10년 후의 나"
home.goals.title:  "나의 목표" → "이번 달 목표"

common.done:  "완료"  (편집 모드 종료용 — 없으면 추가)
```

이 카피 변경은 **권장**이지 필수 아닙니다. 기존 카피 그대로 두면 톤만 변형됩니다.

## 인터랙션 차이 — 사용자가 체감할 변화

| 행동 | 변경 전 | 변경 후 |
|------|---------|---------|
| 잘한 일 입력 | 저장 버튼 눌러야 저장 | 멈춘 후 600ms 자동 저장, 우상단 "SAVED" 토스트 1.8초 |
| 목표 편집 | 행에 input + X 항상 보임 → 매번 결정 | 평시 정적 리스트, 우상단 "편집" 누르면 입력+X 등장 |
| 목표 달성 | 행 좌측 round badge 탭 | 그대로 (번호 자체가 토글 버튼) |
| 다짐 일치 | 박스 input 글자 색만 변함 | 번호 → ✓ Soul, border 색 Soul로 |
| 잠금화면 받기 | 카드 푸터 fill 버튼 | 카드 푸터 mono 텍스트 링크 (위계 격하) |

## 적용 후 확인 체크리스트

- [ ] `/home` 첫 로드 시 흰 헤더 없이 cream 한 톤
- [ ] 우상단 streak dot · 숫자 표시 (`user.affirmationStreak.count > 0`일 때)
- [ ] 탭 클릭 시 Soul 1.5px 밑줄 이동
- [ ] "오늘" 탭: MotivationCard 인용이 Fraunces italic, 보라색 사라짐
- [ ] "나의 행동" 탭: 3섹션 모두 hairline으로만 구분, 카드 그림자 없음
- [ ] 목표 행 평시 — X 버튼 안 보임. "편집" 클릭 → X 등장
- [ ] 잘한 일 입력 → 멈춘 후 1초쯤 "SAVED" 토스트
- [ ] 다짐 따라쓰기 — 행 위에 italic ghost로 목표문이 떠 있음
- [ ] 다짐 일치 → ✓ Soul + border Soul
- [ ] iPhone/Android 양쪽에서 텍스트 크기 적절 (sm: 브레이크포인트 확인)

## 향후 Phase

이번 v1 패치는 **시각 + 인터랙션** 단계입니다. 디렉티브 문서의 Phase 4 (정보 구조 재정렬: 오늘 = 인용 + 다짐 + 잘한 일 / 나 = 페르소나 + 목표)는 **별도 PR** 권장 — Firestore 스키마와 무관하고 라우팅·탭 키만 바뀌므로 안전한 후속 작업.

## 알려진 한계

1. `quoteEmphasis` 강조 단어 시스템은 백엔드가 필드를 채워야 작동. 없으면 plain quote로 fallback (다운그레이드 안전).
2. AffirmationCheckin의 `tone` prop은 호환을 위해 받지만 무시됩니다 — 호출부에서 `tone="light"` 또는 아무거나 넘겨도 동작.
3. 자동 저장 debounce는 600ms 고정. 추후 사용자 입력 속도 모니터링 후 조정 가능.

---

*motivator · home redesign patch · v1.0 · 2026-05-24*
