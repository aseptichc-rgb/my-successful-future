<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# iOS 빌드·앱스토어 제출은 RESUBMIT-IOS.md 를 먼저 읽을 것

iOS 빌드/아카이브/업로드/심사 제출 작업이면 **코드를 건드리기 전에**
[RESUBMIT-IOS.md](RESUBMIT-IOS.md) 의 "1.0.2 INVALID_BINARY 복구" 절을 읽어라.

App Store Connect API 는 규칙 위반 제출도 200 으로 통과시키고, Apple 사후 검증이 몇 분 뒤
`INVALID_BINARY`("잘못된 바이너리")로 반려한다 — 2026-08-06 실사고. 반드시 지킬 두 가지:

1. `MARKETING_VERSION` == App Store Connect 의 앱 버전
2. `CURRENT_PROJECT_VERSION` > 이미 출시된 최대 빌드번호

`npm run ios:*` 은 [scripts/ios-preflight.mjs](scripts/ios-preflight.mjs) 가 자동으로 체크리스트를
띄우고, [scripts/ios-appstore-submit.mjs](scripts/ios-appstore-submit.mjs) 가 제출 전 두 규칙을
검사해 위반 시 중단한다. 이 가드를 우회하지 마라.
