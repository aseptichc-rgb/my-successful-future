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

## 다음 업데이트 · 아니마 Pro

최초 14일은 기존 체험 원장으로 AI 기능을 무료 제공한다. 체험은 자동으로 유료 전환되지 않는다. 이후 사용자가 직접 신청하면 월 990원(30일마다 자동 갱신)에 AI 맞춤 기능을 이용할 수 있다. 기본 명언, 직접 작성하는 목표와 실천 기록, 기록 열람과 성장 현황은 무료다.

설정 → 아니마 Pro와 AI 코칭에서 두 기능을 연다. AI 코치는 한국시간 하루 3개 질문을 받고 최근 두 문답까지 현재 화면에서 이어받는다. 서버에는 대화 원문을 저장하지 않는다. AI 주간 코칭은 오늘을 포함한 최근 7일의 완료한 일과 장애물 기록을 근거로 잘한 실천, 반복된 장애물, 다음 주 행동을 하나씩 보여 준다. 반복 근거가 없으면 부족하다고 표시한다. 하루 중 처음 생성한 주간 코칭을 다시 보여 주고, 계정 삭제 시 저장된 코칭도 지운다.

두 기능의 질문·기록·생성 결과에 안전 검사를 적용한다. 출시 전 토스 AI 채팅·상담 기준에 따라 정상 질문, 우회 요청, 위기 응답을 실기기에서 확인한다. 운영 중 중단이 필요하면 서버의 `TOSS_AI_COACH_DISABLED=true`로 두 코칭 API를 중단할 수 있다. 코치 모델·프롬프트 변경은 토스 검토를 먼저 요청한다.

1. `20261105-2` 심사가 끝난 뒤 콘솔의 **인앱 결제**에서 사업자·정산 요건을 확인한다. `아니마 Pro 월간`을 월간 자동 갱신 상품으로 만들고 공급가 900원, 최종 판매가 990원을 확인한다. 기존 14일 체험과 중복되므로 상품의 무료 체험 오퍼는 사용하지 않는다.
2. 다음 버전 서버에 콘솔의 실제 상품 ID를 `TOSS_IAP_MONTHLY_SKU`로 설정한다. `TOSS_IAP_WEBHOOK_TOKEN`은 콘솔에 입력하는 충분히 긴 Basic Auth 헤더 값(`Basic ` 제외)이다. 기존 미니앱용 mTLS 인증서와 키를 사용한다. 콘솔 결제 알림 URL은 `https://my-successful-future.vercel.app/api/billing/toss-webhook`이다.
3. `TOSS_IAP_ENABLED` 기본값은 비활성이다. 테스트 준비가 되면 `true`로 켜고 별도 테스트 번들을 올린다. 토스 카탈로그의 상품 ID, 월간 유형, 원화 표시 가격 990원이 일치할 때 결제 버튼이 활성화된다. 결제 비활성화 뒤에도 기존 주문 복구와 웹훅 처리를 위해 SKU와 인증 설정을 유지한다.
4. SDK 3.x QR 결제는 실제 과금된다. iOS와 Android에서 체험 중 구매 제한, 최초 결제, 미지급 복원, 재접속·기기 변경, 자동 갱신 중단, 만료와 환불을 검증한다. 갱신 콜백의 주문번호가 최초 주문과 같은지, 타임존 없는 시각이 한국시간과 일치하는지도 확인한다. 토스가 만료 시각을 보내기 전에는 서버에서 검증한 주문의 상태 확정 시각부터 30일을 최초 이용 기간으로 사용한다.
5. 주문 확인 API는 구매자 식별자를 반환하지 않는다. 토스 SDK가 반환한 주문의 상품·결제 상태를 mTLS로 확인하고, 첫 지급에서 검증된 토스 Firebase UID와 주문을 트랜잭션으로 연결한다. 다른 UID로 같은 주문을 다시 지급할 수 없다. 공급가·판매가와 구독 안내 문구를 검토한 뒤 새 버전 심사를 요청한다.

- [앱인토스 인앱 결제 설정](https://developers-apps-in-toss.toss.im/guide/monetization/in-app-payment)
- [정기결제 개발 가이드](https://developers-apps-in-toss.toss.im/documentation/common/monetization/iap/in-app-subscription)
- [토스 개발팀의 주문 연결 안내](https://techchat-apps-in-toss.toss.im/t/anonkey-iap/5097/2)
- [앱인토스 AI 채팅·상담 정책](https://developers-apps-in-toss.toss.im/intro/guide)

## 근거 문서

- [SDK 설치와 번들 구성](https://developers-apps-in-toss.toss.im/ai-vibe-coding/tutorials/webview)
- [비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame)
- [사용자 식별키 인증 코드](https://developers-apps-in-toss.toss.im/guide/authentication/anonymous-key-auth-code)
- [서버 교환 API](https://developers-apps-in-toss.toss.im/api/user-key)

주의: Vercel CLI의 `link --yes`는 기존 `.env.local`을 개발 환경변수로 동기화할 수 있다. 이 작업에서 연결이 완료되었으므로 같은 폴더에서 다시 연결할 필요가 없다. 한글 Windows 호스트 이름으로 구형 CLI의 OAuth User-Agent 오류가 발생하면 해당 CLI 프로세스의 `os.hostname()`만 ASCII 문자열로 지정해서 실행한다. 전역 컴퓨터 이름이나 Git 설정을 변경할 필요는 없다.
