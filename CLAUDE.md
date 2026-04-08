# CLAUDE.md — AI 뉴스 챗봇 프로젝트

## 프로젝트 개요

AI가 국내외 최신 소식을 실시간으로 전달하는 뉴스 챗봇 서비스.
사용자가 자연어로 질문하면, AI가 관련 뉴스를 검색·요약·큐레이션하여 대화형으로 응답한다.

**커버 도메인:**
- 국내 일반 뉴스 (정치, 경제, 사회)
- 글로벌/해외 뉴스
- 헬스케어/의료
- IT/스타트업

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| Frontend | Next.js 14+ (App Router) |
| Backend | Next.js API Routes (서버리스) |
| Database | Firebase Firestore |
| Auth | Firebase Authentication |
| AI 엔진 | Gemini API (`gemini-2.0-flash`) |
| 뉴스 소스 | NewsAPI / RSS 피드 / Gemini Google Search (혼합) |
| 배포 | Vercel |
| 스타일 | Tailwind CSS |

---

## 디렉터리 구조

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── chat/
│   │   ├── page.tsx              # 메인 챗봇 UI
│   │   └── [sessionId]/page.tsx  # 대화 세션 상세
│   ├── api/
│   │   ├── chat/route.ts         # Claude API 호출 엔드포인트
│   │   ├── news/route.ts         # 뉴스 수집 엔드포인트
│   │   └── summary/route.ts      # 뉴스 요약 엔드포인트
│   └── layout.tsx
├── components/
│   ├── chat/
│   │   ├── ChatWindow.tsx        # 대화창 컴포넌트
│   │   ├── MessageBubble.tsx     # 메시지 말풍선
│   │   ├── NewsCard.tsx          # 뉴스 카드 UI
│   │   └── TopicSelector.tsx     # 도메인 필터 선택
│   └── ui/                       # 공통 UI 컴포넌트
├── lib/
│   ├── gemini.ts                 # Gemini API 클라이언트
│   ├── firebase.ts               # Firebase 초기화
│   ├── newsSource.ts             # 뉴스 소스 통합 레이어
│   └── prompts.ts                # 시스템 프롬프트 관리
├── hooks/
│   ├── useChat.ts                # 채팅 상태 관리 훅
│   └── useNews.ts                # 뉴스 페칭 훅
├── types/
│   └── index.ts                  # 공통 타입 정의
└── CLAUDE.md
```

---

## 핵심 아키텍처

### 1. 뉴스 수집 파이프라인

뉴스 소스는 3가지를 혼합 사용한다. 우선순위는 아래 순서를 따른다.

```
1순위: Gemini Google Search → 실시간 최신 뉴스 (속보, 오늘 이슈)
2순위: NewsAPI            → 구조화된 영문 뉴스 (글로벌, IT/헬스케어)
3순위: RSS 피드 크롤링    → 국내 언론사 뉴스 (네이버, 연합뉴스 등)
```

**소스 선택 로직 (`lib/newsSource.ts`):**
- 사용자 질문이 "오늘", "방금", "최신" 등 시의성 키워드 포함 → `Google Search` 우선
- 도메인이 글로벌/IT/헬스케어 → NewsAPI 우선
- 국내 정치/사회 → RSS 우선
- 소스가 비어있거나 실패 시 → 다음 순위로 자동 폴백(fallback)

### 2. Gemini API 호출 구조

`/app/api/chat/route.ts` 에서 스트리밍 방식으로 응답을 전달한다.

```typescript
// 항상 아래 모델을 사용할 것
model: "gemini-2.0-flash"

// 시스템 프롬프트는 lib/prompts.ts 에서 중앙 관리
// 웹 검색이 필요한 경우 tools에 Google Search 포함
tools: [{ googleSearch: {} }]

// 스트리밍 응답 활성화
sendMessageStream()
```

### 3. Firebase 데이터 구조

```
Firestore
├── users/{uid}
│   ├── displayName: string
│   ├── preferredTopics: string[]   # 관심 도메인 설정
│   └── createdAt: timestamp
│
├── sessions/{sessionId}
│   ├── uid: string
│   ├── title: string               # 첫 번째 질문 기반 자동 생성
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp
│
└── messages/{messageId}
    ├── sessionId: string
    ├── role: "user" | "assistant"
    ├── content: string
    ├── sources: NewsSource[]        # 인용된 뉴스 출처 배열
    └── createdAt: timestamp
```

---

## 시스템 프롬프트 지침 (`lib/prompts.ts`)

Claude에게 전달하는 시스템 프롬프트는 반드시 아래 원칙을 포함해야 한다.

```
1. 역할: 당신은 국내외 뉴스를 전달하는 AI 뉴스 어시스턴트입니다.
2. 응답 언어: 항상 한국어로 응답합니다.
3. 출처 명시: 뉴스를 인용할 때는 반드시 출처(언론사명, 날짜)를 밝힙니다.
4. 중립성: 정치·사회 이슈에서 특정 입장을 취하지 않고 사실 중심으로 전달합니다.
5. 요약 형식: 헤드라인 → 핵심 내용 3줄 → 배경 설명 순으로 구성합니다.
6. 의료 정보: 헬스케어 뉴스에서 진단·처방에 해당하는 조언은 절대 제공하지 않습니다.
   반드시 "전문 의료진 상담을 권장합니다" 문구를 포함합니다.
7. 불확실성: 검색 결과가 없거나 불분명할 때는 추측하지 않고 솔직하게 알립니다.
```

---

## 주요 컴포넌트 스펙

### NewsCard (`components/chat/NewsCard.tsx`)
- 뉴스 응답 내에 카드 UI로 삽입
- 필드: `title`, `source`, `publishedAt`, `url`, `summary`
- 클릭 시 원문 링크 새 탭 열기

### TopicSelector (`components/chat/TopicSelector.tsx`)
- 도메인 필터 칩(chip) UI: 전체 / 국내 / 글로벌 / 헬스케어 / IT
- 선택 상태는 `useChat` 훅에서 전역 관리
- 선택된 도메인은 시스템 프롬프트에 동적으로 주입

### ChatWindow (`components/chat/ChatWindow.tsx`)
- 메시지 스트리밍 지원 (SSE 방식)
- 자동 스크롤 to bottom
- 로딩 중에는 타이핑 애니메이션 표시

---

## 환경 변수 (`.env.local`)

```bash
# Gemini API
GEMINI_API_KEY=

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# 뉴스 소스 (선택)
NEWSAPI_KEY=
```

---

## 개발 규칙

### 코딩 컨벤션
- 모든 컴포넌트는 **TypeScript** 사용, `any` 타입 금지
- 서버 컴포넌트와 클라이언트 컴포넌트를 명확히 분리 (`"use client"` 표시)
- API Route는 반드시 `try/catch`로 에러 처리하고, 에러 시 적절한 HTTP 상태 코드 반환
- Firebase 직접 호출은 `lib/firebase.ts`에서만 허용 (다른 파일에서 직접 import 금지)

### Gemini API 호출 규칙
- 항상 `gemini-2.0-flash` 모델 사용
- 프롬프트 변경 시 반드시 `lib/prompts.ts`만 수정 (API Route 내 하드코딩 금지)
- 스트리밍 응답은 `sendMessageStream()`으로 처리

### 뉴스 소스 규칙
- 뉴스 원문 콘텐츠를 그대로 UI에 재현하지 않는다 (저작권 준수)
- 요약은 항상 AI가 재작성한 형태로 제공
- 출처 URL은 반드시 포함하여 원문 확인 가능하게 한다

### 의료 뉴스 특별 규칙
- 헬스케어 도메인 응답에는 `MedicalDisclaimer` 컴포넌트를 항상 렌더링
- 특정 약물, 치료법에 대한 개인화된 추천은 프롬프트 수준에서 차단

---

## 구현 우선순위 (Phase)

### Phase 1 — MVP
- [ ] Firebase Auth (이메일/구글 로그인)
- [ ] 기본 챗봇 UI (ChatWindow, MessageBubble)
- [ ] Gemini API 연동 + Google Search 도구
- [ ] 대화 세션 Firestore 저장

### Phase 2 — 뉴스 고도화
- [ ] TopicSelector 도메인 필터
- [ ] NewsCard 컴포넌트
- [ ] NewsAPI 연동
- [ ] RSS 피드 크롤링 파이프라인

### Phase 3 — UX 개선
- [ ] 사용자 관심 도메인 설정 저장
- [ ] 대화 히스토리 목록 사이드바
- [ ] 뉴스 북마크 기능
- [ ] 일일 브리핑 자동 생성 (Firebase Cloud Functions + 스케줄러)

---

## 참고 문서

- [Gemini API 공식 문서](https://ai.google.dev/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [NewsAPI 문서](https://newsapi.org/docs)
