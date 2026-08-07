# CLAUDE.md — AI 뉴스 챗봇 프로젝트


모든 코드를 짤 때, 스스로 퀄리티스코어를 도입해서 최소 점수가 100점 만점에 80점 이상은 돼야 돼

- Role: Senior Software Engineer (Focus: Security & Reliability)
- Target: Minimum Quality Score 80/100
- Evaluation Criteria:
  1. Exception Handling: 모든 비동기 로직에 try-catch가 포함되었는가?
  2. Medical Data Privacy: 민감 정보 마스킹 처리가 되었는가?
  3. Code Cleanliness: 중복 로직(DRY) 및 매직 넘버 제거 여부
  4. Consistency: 기존 Vibe Coding 컨벤션 준수 여부

*결과가 80점 미만일 경우: "REJECT: [사유]"와 함께 수정 그 사유에 맞게 작업을 수정할 것.*


* 깃허브 푸쉬할 때 반드시 아래 내용 지켜줘
 "작업 끝나면 실행 중인 모든 Node.js 프로세스를 강제 종료(kill)하고, 변경사항 전부 커밋해서 푸쉬해줘. git status가 clean 상태인지 확인하고 끝내."



## ⛔ iOS 빌드·앱스토어 제출 — 작업 시작 전 필독

**iOS 빌드/아카이브/업로드/심사 제출과 관련된 작업이면, 코드를 건드리기 전에 반드시
[RESUBMIT-IOS.md](RESUBMIT-IOS.md) 를 먼저 읽을 것.** 특히 "1.0.2 INVALID_BINARY 복구" 절.

2026-08-06 에 마케팅 버전이 맞지 않는 구 빌드를 앱 버전에 붙여 제출했다가 Apple 사후 검증에서
`INVALID_BINARY`("잘못된 바이너리")로 반려된 실사고가 있다. **ASC API 는 이 제출을 200 으로
통과시키므로 제출 시점에는 성공한 것처럼 보인다.** 반드시 지킬 두 가지:

1. `MARKETING_VERSION` == App Store Connect 의 앱 버전 (다르면 반려)
2. `CURRENT_PROJECT_VERSION` > 이미 출시된 최대 빌드번호 (같거나 낮으면 반려)

`npm run ios:sync` / `ios:open` / `ios:submit` 은 프리플라이트([scripts/ios-preflight.mjs](scripts/ios-preflight.mjs))가
자동으로 이 체크리스트를 띄운다. 제출 스크립트([scripts/ios-appstore-submit.mjs](scripts/ios-appstore-submit.mjs))는
두 규칙을 다시 검사해 위반 시 `REJECT` 로 중단한다 — 이 가드를 우회하지 말 것.

## 참고 문서

- [Gemini API 공식 문서](https://ai.google.dev/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [NewsAPI 문서](https://newsapi.org/docs)
