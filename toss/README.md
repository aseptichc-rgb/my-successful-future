# 아니마 · Apps in Toss

기존 Next.js 화면과 Firebase 데이터를 재사용하는 CSR 미니앱이다. 서버 페이지를 리다이렉트하거나 iframe으로 띄우지 않는다. 웹/iOS용 React 19 의존성과 토스 TDS용 React 18 의존성은 분리한다.

## 빌드

저장소 루트에서 `npm ci`를 실행한 다음 이 폴더에서 실행한다.

```powershell
npm ci
npm run check
npm run build
```

업로드 파일은 `toss/anima.ait`다. `apps-in-toss.config.ts`의 `appName`은 콘솔 등록값 `anima`와 일치해야 한다. SDK는 3.9.0이며 실제 설치 버전은 package-lock.json에 고정했다.

## 콘솔과 서버

- 워크스페이스: 이뻐지는퀴즈 (22009)
- 앱: 아니마 / Anima (`anima`)
- [앱 출시](https://apps-in-toss.toss.im/workspace/22009/mini-app/anima/app-build)
- [앱 정보](https://apps-in-toss.toss.im/workspace/22009/mini-app/anima/meta/edit)
- [mTLS 인증서](https://apps-in-toss.toss.im/workspace/22009/mini-app/anima/certificate)
- 서버: 기존 Vercel `aseptichcs-projects/my-successful-future`
- 상태: `GET https://my-successful-future.vercel.app/api/auth/toss-session`

서버에만 `TOSS_MTLS_CERT`와 `TOSS_MTLS_KEY`를 설정한다. NEXT_PUBLIC_ 또는 VITE_ 접두사를 붙이거나 번들에 넣지 않는다. 인증서는 이 미니앱 전용 인증서여야 한다. 환경변수를 설정한 뒤 서버를 재배포해야 적용된다.

토스 SDK의 `User.createAnonymousKeyAuthCode()`가 발급한 일회용 코드를 서버에서 mTLS로 교환하고, 서버가 확인한 anonKey를 단방향 Firebase UID로 변환한다. 클라이언트에서 보낸 원시 사용자 키는 로그인 근거로 받지 않는다. 기존 Anima 계정과 자동 병합하지 않는다. 인증 코드·anonKey·토큰을 로그나 Firestore에 저장하지 않는다.

Firebase Firestore의 기존 사용자 규칙을 유지한다. 인증 토큰은 Authorization 헤더로 보내며 웹 세션 쿠키를 토스 도메인으로 공유하지 않는다. SDK 3.9의 CORS는 `https://anima.apps.tossmini.com`과 `https://anima.private-apps.tossmini.com`에만 허용한다. Origin 목록은 `lib/tossOrigins.ts`를 서버 요청 검증과 Next.js 응답 헤더가 공유한다. `web.tossmini.com`·`private-web.tossmini.com`은 SDK 3.0.x에서만 쓰던 Origin이므로 혼동하지 않는다.

## 2026-11-05 업로드 준비

- `.ait` 번들 생성, 타입 검사, 전체 서버 테스트 271개 통과.
- 기존 화면의 목표·기록·성장·내 꿈 탭 연결.
- 주황색 브랜드 강조를 인디고 `#1E1B4B`와 옅은 라벤더로 통일했다. 공통 토큰과 개별 화면·공유 카드·토스 브랜드 색에 적용한다.
- TDS의 전역 CSS 리셋을 끄고 Tailwind 리셋을 사용해 글자 크기·패딩·모서리 충돌을 해소했다. 온보딩 예시는 같은 너비의 왼쪽 정렬 카드로 표시하고 선택 상태를 제공한다.
- 토스용 인트로·설정·개인정보 처리방침·이용약관 추가.
- Google/Apple/이메일 가입 화면, 외부 스토어 결제·설치·리뷰 유도는 토스 라우트에서 제외.
- 토스 공유 SDK 및 시스템 뒤로가기 연결. 열린 시트를 먼저 닫도록 처리.
- AI 사용 사전 안내와 AI 생성 결과 안내 적용.
- 유료 상품은 아직 판매하지 않는다. 기존 서버 권한 검증과 무료 체험을 유지한다.
- 번들 업로드, 한국어/영어 이름·소개·로고·검색어·주요 기능 입력.
- 운영자 승인 후 `anima-production-20261105` mTLS 인증서를 발급했다. 인증서와 개인 키는 Vercel Production의 민감 환경변수로 저장했으며 소스나 클라이언트 번들에 넣지 않았다. 인증서 만료일은 2027-11-30이다.
- 토스 mTLS 서버가 인증서를 받아들이고, 의도적으로 잘못된 인증 코드를 비즈니스 오류 `4011`로 거부하는 것을 확인했다. 실제 사용자 인증 코드는 테스트에 사용하지 않았다.
- 서버 재배포 후 상태 API `ready: true`, 잘못된 코드 401, 유사 도메인 403, 토스 도메인의 Firebase 인증 API 접근을 확인했다. 실제 토스 앱에서 사용자가 ‘시작하기’를 누른 뒤 꿈·목표 입력 화면에 진입한 것을 확인했다.
- SDK 3.9의 실제 `apps`·`private-apps` Origin에 맞춰 요청 검증과 CORS를 수정했고, 관련 회귀 테스트 14개 및 운영 서버의 실제 Origin별 preflight·인증 요청 검사를 통과했다. 앱 번들은 그대로 사용하며 서버만 수정했다.
- 사용자 인증과 온보딩 진입은 실기기에서 확인했다. 재접속·기록 저장·AI 요청·뒤로가기·공유·삭제를 추가 검증한 후 심사를 요청한다. 콘솔의 인허가 확인 및 파트너 책임·손해배상 동의는 운영자 확인이 필요하다.

## 디자인 업데이트 · 2026-11-05

2026-11-05 디자인 업데이트는 테스트 버전 `20261105-2`로 업로드하고 임시저장했다. deploymentId는 `01a1a9e7-35b6-7b13-a8eb-9ae59b309e60`이다. [새 버전 테스트 QR](https://apps-in-toss.toss.im/workspace/22009/mini-app/anima/meta/edit?step=0&testDeploymentId=01a1a9e7-35b6-7b13-a8eb-9ae59b309e60&testVersionName=20261105-2)에서 확인한다. 기존 QR은 이전 디자인을 연다.

전체 테스트 275개, 변경한 TypeScript 파일의 ESLint, Next.js 운영 빌드, 토스 타입 검사와 번들 빌드를 통과했다. 인증을 대체한 로컬 화면 검사에서 390px·480px 너비와 예시 선택·입력 반영을 확인했다. 새 디자인의 실기기 확인은 아직 필요하며 심사는 제출하지 않았다.

## 근거 문서

- [SDK 설치와 번들 구성](https://developers-apps-in-toss.toss.im/ai-vibe-coding/tutorials/webview)
- [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame)
- [사용자 식별키 인증 코드](https://developers-apps-in-toss.toss.im/guide/authentication/anonymous-key-auth-code)
- [서버 교환 API](https://developers-apps-in-toss.toss.im/api/user-key)

주의: Vercel CLI의 `link --yes`는 기존 `.env.local`을 개발 환경변수로 동기화할 수 있다. 이 작업에서 연결이 완료되었으므로 같은 폴더에서 다시 연결할 필요가 없다. 한글 Windows 호스트 이름으로 구형 CLI의 OAuth User-Agent 오류가 발생하면 해당 CLI 프로세스의 `os.hostname()`만 ASCII 문자열로 지정해서 실행한다. 전역 컴퓨터 이름이나 Git 설정을 변경할 필요는 없다.
