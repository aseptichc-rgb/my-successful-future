# Anima · Apple iOS Redesign — v2.0

> 전체 앱 디자인 시스템을 Anima Cream/Coral에서 **Apple iOS native**로 마이그레이션. SF Pro + Pretendard, 12색 시스템 컬러 팔레트, Large Title 네비게이션, Grouped Inset List, Segmented Control, 컬러 아이콘 사각형, Bottom Sheet 모달.

---

## 패치 파일 목록

```
patch/
├── CHANGES.md
├── app/
│   ├── globals.css                              # ← Apple iOS 토큰으로 전면 교체
│   ├── layout.tsx                               # ← SF Pro + Pretendard 폰트 스택
│   ├── home/page.tsx                            # ← Large Title + Segmented + Grouped Inset Cards
│   ├── settings/page.tsx                        # ← 컬러 아이콘 사각형, 프로필 그라데이션 카드, Sheet 모달
│   ├── wins-history/page.tsx                    # ← 일자별 컬러 로테이션 카드
│   └── (auth)/login/page.tsx                    # ← 그라데이션 로고 hero, 인셋 입력 카드
└── components/
    ├── home/MotivationCard.tsx                  # ← 따뜻한 그라데이션 hero 인용 카드
    └── affirmations/AffirmationCheckin.tsx      # ← 컬러 번호 뱃지 + underline 입력
```

**Phase 2 권장** (이번 패치 미포함):
- `app/onboarding/page.tsx` (630줄, 별도 PR 권장)
- `app/(auth)/signup/page.tsx` (login과 동일 패턴 적용)
- 추가 마이너 컴포넌트들 (`AffirmationsEditor` 등은 기존 그대로 동작)

---

## 적용 → GitHub Push

### 1. 패치 적용

zip을 풀어 `patch/` 안의 모든 파일을 `my-successful-future/` 동일 경로에 덮어쓰세요.

### 2. 캐시 클리어

```bash
cd ~/path/to/my-successful-future
rm -rf .next .turbo node_modules/.cache
```

### 3. 로컬 확인

```bash
npm run dev
# http://localhost:3000/home — Apple iOS 톤이 적용되어야 함
```

### 4. GitHub Push

```bash
git checkout -b apple-ios-redesign
git add app/ components/
git commit -m "feat: migrate to Apple iOS native design system

- Switch entire design system from Anima Cream/Coral to Apple iOS
- Adopt SF Pro + Pretendard font stack
- Replace cards with Grouped Inset List pattern
- Add Large Title navigation
- Add Segmented Control for tab navigation
- Add colored icon squares in Settings (iOS Settings.app pattern)
- Add gradient hero card for daily quote
- Add per-row category colors (12-color iOS palette)
- Add Bottom Sheet modals for edit flows
- Add orange streak chip
- Block forced dark mode (Samsung Internet etc.)"

git push origin apple-ios-redesign
# 또는 직접 master로 푸시
git push origin master
```

### 5. 검증

```bash
# 토큰이 제대로 적용됐는지
grep -c "Apple iOS Design System" app/globals.css      # → 1
grep -c "Apple iOS native redesign" app/home/page.tsx  # → 1
grep -c "Large Title" components/home/MotivationCard.tsx || true
grep -c "SF Pro" app/layout.tsx                         # → 1
```

브라우저 DevTools → Computed → `font-family`:
- `__Inter_*, -apple-system, BlinkMacSystemFont, "SF Pro Text", ...`

---

## 변경 핵심 요약

### 디자인 시스템 토큰 (`globals.css`)

| 영역 | Before (Anima) | After (Apple iOS) |
|------|---------------|-------------------|
| 배경 | `#F7F3EC` cream | `#F2F2F7` systemGroupedBackground |
| 카드 | `#FBF8F2` 살짝 떠 있는 cream | `#FFFFFF` secondarySystemGroupedBackground |
| Accent | `#D85A30` Coral Warm | `#007AFF` System Blue (+ 12색 시스템 팔레트) |
| 본문 색 | `#1E1B4B` Indigo | `#000000` Label |
| 보조 색 | `rgba(30,27,75,.62)` | `rgba(60,60,67,0.6)` Label 2 |
| 구분선 | `rgba(30,27,75,.14)` | `rgba(60,60,67,0.12)` |
| 폰트 (영) | Inter | SF Pro Text/Display (`-apple-system`) |
| 폰트 (한) | Pretendard | Pretendard (그대로) |
| Display | Fraunces serif (제거) | SF Pro Display |
| 모서리 | 16/20px | 12/14/18px (iOS standard) |
| 그림자 | warm tinted | iOS subtle |
| Tailwind `bg-blue-500` | Anima Indigo | iOS System Blue |
| Tailwind `bg-rose-500` | Anima Coral | iOS Pink #FF2D55 |
| Tailwind `bg-orange-500` | Anima Coral | iOS Orange #FF9500 |
| Tailwind `bg-green-500` | Sage muted | iOS Green #34C759 |
| 다크 모드 | (없음) | color-scheme: light로 차단 |

### Home 페이지

- 흰 헤더 + H1 "오늘" 제거 → **Large Title** "Anima" + 한글 long date subtitle
- 알약 안의 알약 탭 → **Segmented Control** (iOS 17 native)
- 3중 카드 적층 → **Grouped Inset Lists** (uppercase header + white card + footnote footer)
- 보라 그라데이션 카드 → **따뜻한 오렌지 그라데이션 hero** (Apple Music / Books 패턴)
- 인용 강조 단어 → **System Orange medium**
- 다짐 행 → 인디고/그린/핑크 **카테고리 컬러** 체크마크
- 목표 → 카테고리별 컬러 (Writing 인디고 / Reading 그린 / Fitness 핑크) progress bar
- 잘한 일 → SLOT_COLORS 3색 로테이션 + 600ms debounce auto-save
- 우상단 streak chip — **Orange ⚡ 12** (위젯과 통일)
- 목표 X/입력 → 편집 모드 토글로만 노출

### MotivationCard

- 보라 그라데이션 카드 배경 **완전 제거** → 따뜻한 오렌지 그라데이션 + 그림자
- 좌상단 큰 인용 부호 글리프 (decorative, 18% alpha)
- "오늘의 한 마디" eyebrow — **#FF9500 uppercase bold**
- 인용문 — **23px SF Pro Display semibold**
- 인용 강조 (`quoteEmphasis`) — Orange bold
- 미션 입력 — **iOS rounded input** + System Blue 텍스트 버튼
- 잠금화면 PNG export — **그대로 유지** (Canvas 그라데이션 OK)

### AffirmationCheckin

- 회색 박스 컨테이너 제거 → **Grouped Inset Card** (white rounded 12px)
- 각 행 — **컬러 번호 뱃지** (인디고/그린/핑크/오렌지/시안 로테이션)
- 일치 시 → **컬러 뱃지가 ✓ 체크마크로** 변환
- streak — Orange chip (위젯·페이지 헤더와 통일)
- 입력 — **underline only**, 일치 시 카테고리 컬러
- 제출 버튼 — **System Blue 텍스트 링크**

### Settings

- 흰 헤더 + 알약 설정 버튼 제거 → **Large Title** + 좌상단 백 chevron
- 프로필 카드 — **Blue→Indigo→Purple 그라데이션 아바타** + Orange streak chip
- 모든 행에 **컬러 아이콘 사각형** (Apple Settings.app 시그니처):
  - Indigo 미래의 나 · Green 목표 · Orange 다짐
  - Purple 인물 · Cyan 언어
  - Gray 로그아웃 · Red 계정 삭제
  - Gray 약관·개인정보
- 편집 흐름 모두 **Bottom Sheet 모달**로 (handle + 취소/저장)
- 계정 삭제 — **System Red CTA**, "삭제" 키워드 confirm 입력

### Wins History

- 흰 헤더 → **Large Title** + 백 chevron + subtitle
- 날짜별 그룹 — **iOS 일자별 컬러 로테이션** (그린→오렌지→핑크→퍼플→시안→인디고→옐로우)
- "오늘 · 5월 24일 화" / "어제 · 5월 23일 월" 같은 친근한 헤더
- Empty state — **그라데이션 체크 아이콘** + label2 안내

### Login

- 흰 카드 그림자 → **Apple iOS 평면 layout**
- 로고 hero — **Orange→Pink→Purple 그라데이션 사각 backdrop** + 흰 Aperture 마크
- 워드마크 — Apple system font + Orange "i" 점
- 이메일·비밀번호 — **Grouped Inset Card** (라벨 + input 한 행, 50px height)
- 주요 CTA — **System Blue 50px 풀폭 버튼**
- Google OAuth — **흰 버튼** + 정식 Google 4색 로고
- 다크 모드 차단 (color-scheme: light)

### Layout / Globals

- `Fraunces`, `JetBrains_Mono` 제거 (사용 안 함)
- `Inter` + `Noto_Sans_KR` 유지 (영문 SF Pro 폴백 / 한글 폴백)
- Pretendard CDN 유지 (한글 메인 폰트)
- `<meta name="color-scheme" content="only light">` — 다크 모드 강제 차단
- 모든 Tailwind 색상 클래스 (`bg-blue-500`, `text-rose-600` 등) → iOS 시스템 컬러 매핑
- 기존 Anima 클래스명 (`bg-cream`, `text-indigo`, `bg-soul`) → iOS 토큰 alias로 호환 유지

---

## 알려진 한계 / 후속 작업

### Phase 2 (별도 PR)
1. **`app/onboarding/page.tsx`** — 630줄짜리 6단계 플로우. 이번 패치는 globals.css의 토큰 매핑으로 자동으로 톤은 어느 정도 따라가지만, native iOS 패턴(progress dots, bottom action bar with blur, large title hero per step)을 적용하려면 별도 작업 필요.
2. **`app/(auth)/signup/page.tsx`** — login과 동일 패턴 적용 (10분 작업).
3. **`AffirmationsEditor`** — settings sheet 안에서 사용 중. globals.css 매핑으로 색은 따라가지만, iOS 입력 톤(border-bottom only)으로 다듬으면 더 깔끔.

### i18n 키 추가 권장 (선택)
다음 키들이 없으면 fallback 영문/한글이 표시됩니다:

```
settings.title           → "설정"
settings.profile.header  → "프로필"
settings.quote.header    → "카드"
settings.account.header  → "계정"
settings.streakLabel     → "STREAK {count}일"
auth.or                  → "또는"
auth.noAccount           → "처음이신가요?"
auth.signUp              → "가입하기"
auth.continueWithGoogle  → "Google로 계속하기"
common.set / common.empty / common.none / common.deleting
```

### TWA 안드로이드 캐시
배포 후 TWA 사용자는:
1. 설정 → 앱 → Anima → 저장공간 → 캐시 삭제
2. 안 되면 앱 삭제 후 재설치

---

*Anima · Apple iOS Redesign · v2.0 · 2026-05-24*
