# 하단 탭 4개 내비게이션 설계 — 오늘 · 기록 · 성장 · 내 꿈

- 날짜: 2026-09-04
- 상태: 승인됨 (구현 진행)

## 문제

`/home` 하나에 17개 블록이 세로로 쌓여 있었다. 명언 히어로 위에 조건부 배너가 최대 5장
먼저 깔리고, 잘한 일·내일 첫 행동·주간 회고·내 꿈·if-then·추가 목표 등 8개 기능은
기본 접힘 "더 보기" 안에 숨어 발견성이 거의 없었다. 내 꿈·선언·목표·실행 설계 **편집**은
톱니바퀴 뒤 설정 페이지의 시트 안에 있었고("내 꿈을 고치려면 설정으로"는 잘못된 멘탈
모델), 성장 화면은 헤더의 작은 칩으로만 진입했다. 하단 내비게이션·히스토리 연동이 없어
Android 뒤로가기는 시트를 닫지 않고 앱을 종료했다.

## 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 구조 | 하단 탭 바 4개: 오늘 `/home` · 기록 `/record` · 성장 `/progress` · 내 꿈 `/dream` (`app/(tabs)/` 라우트 그룹) | URL 유지로 네이티브 딥링크 무손상 |
| 공유 데이터 | `app/(tabs)/layout.tsx` 의 `TodayDataProvider`(lib/today-context) | 레이아웃은 형제 라우트 이동에도 살아 있어 오늘 문서 구독 1개·날짜 1개가 탭 전환을 견딤 |
| 탭 이동 | `<Link replace>` | Android 뒤로가기가 탭 히스토리를 되감지 않고 앱을 나감. 설정·기록 히스토리 같은 하위 페이지만 push |
| 옛 `/settings?sheet=` | `next.config.ts` redirects → `/dream?sheet=` (쿼리 통과) | 네이티브 알림 딥링크가 새 빌드 없이도 동작 |
| `/wins-history` | `/record/history` (그룹 안, 탭 바 유지) + redirect | 기록 탭이 켜진 채 하위 페이지로 push |
| 설정 | 계정·알림·언어·좋아하는 인물·Pro·약관만. 프로필 그룹 제거 | 핵심 콘텐츠 편집은 내 꿈 탭으로 |
| 알림 슬롯 | 홈 상단 배너는 우선순위로 **1장만** (lib/homeNotice) | 나쁜 날 배너 5장이 오늘의 행동을 두 화면 아래로 밀던 문제 |
| 시트 뒤로가기 | `lib/useSheetHistory` 를 `components/ui/Sheet` 안에 적용 | 뒤로가기가 시트를 먼저 닫음 |
| 고정 헤더 | 생략 | Large Title 을 고정하면 작은 폰 화면 1/3을 먹음 |

지켜진 원칙: **섹션 순서 고정**(`lib/homeMode` — 무엇을 보여줄지만 정한다), **원탭 우선,
타이핑은 항상 선택**(오늘 탭에 자유 입력칸 0개), `anima://` 인텐트는 사용자 제스처 콜스택
안에서만 발화.

## 탭별 고정 순서

- **오늘**: 헤더(로고·스트릭 칩·톱니바퀴) → 알림 슬롯(최대 1장) → 명언 → 오늘 카드
  (체크인/보상 + 비전 + 첫 목표) → 추가 목표 행 → 오늘의 if-then → 7일 리듬 링
- **기록**: 잘한 일(잠금이면 익명 티저) → 내일 첫 행동(저녁만) → 주간 회고(일요일 저녁만)
- **성장**: 기존 `/progress` 그대로
- **내 꿈**: 미래의 나 → 다짐 → 목표 → 실행 설계(open/locked/hidden) + 편집 시트 3개

## 알림 슬롯 우선순위 (높은 순)

recommit → slotUnlock → stepUp → declarationNudge → trialExpired → trial.
스스로 해소되는 1회성이 영구 상태 배너보다 위 — `trialExpired` 를 위에 두면 만료 후
미구매 사용자가 슬롯 해금·스텝업을 영영 못 본다. 같은 이유로 dismiss 가 피커 입력이다.

## 네이티브 후속 (별도 PR)

`android/.../MainActivity.kt` `resolveOpenPath`: `wins → /record`,
`settings-future-self → /dream?sheet=futureSelf`, `settings-affirmations → /dream?sheet=affirmations`,
`settings-goals → /dream?sheet=goals`. 그 전까지는 웹 리다이렉트가 옛 경로를 살린다.
iOS `NotificationBridgePlugin.swift` 는 탭 목적지 라우팅이 없어 할 일 없음.

## 알려진 결점

CTA(push)로 `/dream?sheet=` 에 들어간 뒤 탭 바로 오늘을 누르면 `/home` 위에 `/home` 이
놓여 뒤로가기 1회가 no-op 이 된다 — 문서화만, 수정 안 함.
