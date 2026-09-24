# Anima — App Store Connect 설정 체크리스트

> **문안(이름·부제·프로모션·키워드·설명·릴리스 노트)의 단일 원본은
> [scripts/ios-update-metadata.mjs](../scripts/ios-update-metadata.mjs) 의 `COPY` 다.**
> 문구를 고칠 땐 스크립트를 고치고 `--apply` 로 스테이징한다. 이 문서에는 스크립트가 만질 수 없는
> 설정과 그 근거만 남기고, 문안은 복제하지 않는다.
> (2026-09-24 이전에는 이 문서·`app-store-listing-*.md`·스크립트 세 벌이 서로 달라 어느 것이
> 라이브인지 알 수 없었다. 규칙 위반은 `scripts/ios-update-metadata.test.mjs` 가 잡는다.)

## 1. 로케일 구성 — 6종

| 로케일 | 주요 스토어프론트 | 이름 | 부제 | 지원 URL | 비고 |
| --- | --- | --- | --- | --- | --- |
| `en-US` | 미국·영어권 (기본 언어 권장, §3) | Anima: Daily Affirmations | Motivation quotes & widget | `/support?lang=en` | 동명의 AI 컴패니언 "Anima" 와 구분하려면 이름에 검색어가 있어야 한다 |
| `ko` | 한국 | Anima — 꿈을 이루는 하루 | 매일 한 걸음, 꿈에 다가가기 | `/support?lang=ko` | 2026-09-23 기준 라이브 값 그대로 |
| `es-ES` | 스페인 | Anima: Afirmaciones diarias | Frases motivadoras y widget | `/support?lang=es` | |
| `es-MX` | 멕시코·중남미 | (es-ES 와 동일) | (es-ES 와 동일) | `/support?lang=es` | 문안은 es-ES 공유, **키워드만 다른 조합**. 미국 스토어프론트에서도 es-MX 키워드가 함께 색인되어 사실상 미국 키워드 100자를 더 얻는다 |
| `zh-Hans` | 싱가포르·말레이시아·해외 중국어권 | Anima：每日肯定语 | 未来的你写给今天的一句话·主屏小组件 | `/support?lang=zh` | 중국 본토 판매는 §4 |
| `zh-Hant` | 대만·홍콩·마카오 | Anima：每日肯定語 | 未來的你寫給今天的一句話・主畫面小工具 | `/support?lang=zh` | 구글 로그인·Gemini 가 정상 동작하는 중화권. **앱 UI 는 간체뿐** — 설명에 명시했다 |

공통값 (스크립트가 로케일마다 함께 넣는다):

| 항목 | 값 |
| --- | --- |
| 번들 ID | `com.michaelkim.anima` |
| 마케팅 URL | `https://my-successful-future.vercel.app` (랜딩 — 한국어) |
| 지원 URL | `https://my-successful-future.vercel.app/support?lang=<en·ko·es·zh>` — 4개 언어 [app/support/page.tsx](../app/support/page.tsx) |
| 개인정보처리방침 URL | `https://my-successful-future.vercel.app/privacy` (영어) |
| 이용약관 URL | `https://my-successful-future.vercel.app/terms` |
| 고객지원 이메일 | `aseptichc@gmail.com` — `successfulfuture.app` 도메인은 **미등록**이라 그 주소는 쓰지 않는다 |

## 2. 스크립트 실행

```bash
node scripts/ios-update-metadata.mjs            # 읽기 전용 점검 + 변경 계획
node scripts/ios-update-metadata.mjs --apply    # 편집 버전에 6로케일 스테이징 + 이름·부제 + 라이브 프로모션
```

- 점검 출력에서 볼 것: **기본 언어(primaryLocale)**, 라이브 버전의 **로케일별 스크린샷 수**,
  현재 **이름·부제**, **중국 본토(CHN) 판매 여부**.
- 이름·부제는 **편집 가능한 앱 정보**가 있을 때만 바뀐다. 버전이 심사 중(`WAITING_FOR_REVIEW`·
  `IN_REVIEW`)이면 건너뛰고 로그로 알려 준다 — 출시 뒤 다시 실행.
- 설명·키워드·이름·부제는 다음 심사와 함께 반영된다. 프로모션 텍스트만 라이브에 즉시 적용.
- 새 버전을 만들었으면 같은 마케팅 버전의 빌드를 올린 뒤 `scripts/ios-appstore-submit.mjs --submit`
  ([RESUBMIT-IOS.md](../RESUBMIT-IOS.md) 의 두 규칙 준수).

## 3. 스크린샷 — 로케일별로 올릴 것

- 스크린샷이 없는 로케일은 **기본 언어 스크린샷으로 폴백**된다. 기본 언어가 한국어면 영어·스페인어·
  중국어 사용자가 한국어 화면을 보게 되어 전환이 크게 떨어진다.
- 앱 UI 가 4개 언어이므로 **설정 → 언어** 를 바꿔 언어별로 캡처할 수 있다. 우선순위:
  `en-US` 6.7" 3장 이상 → `es-ES` → `zh-Hans` → `ko`.
- `es-MX` 는 `es-ES` 것을, `zh-Hant` 는 `zh-Hans` 것을 ASC 에서 복사해 쓴다 (UI 가 같다).
- 필수 사이즈와 권장 컷은 [README-IOS.md §7-2](../README-IOS.md).
- 기본 언어를 영어로 두면 폴백이 영어가 되어 어느 로케일도 한국어 스크린샷을 보지 않는다.
  (ASC → 앱 정보 → 기본 언어. 한국 스토어는 `ko` 로케일이 있으므로 영향 없다.)

## 4. 판매 지역 — 중국 본토는 제외 권장

- 로그인(Firebase Auth·Google)·AI(Gemini)·호스팅(Vercel) 이 **모두 차단**되는 지역이다.
  설치는 되지만 첫 화면에서 로그인이 실패해 1점 리뷰의 원천이 된다.
- 2024년부터 본토 스토어 게시에는 **ICP 등록 번호**도 요구된다.
- `zh-Hans` 로케일은 본토가 아니라 싱가포르·말레이시아·미국 등 해외 중국어 사용자를 위한 것이다.
- 확인: 스크립트 점검 출력의 "중국 본토(CHN) 판매" 줄, 또는 ASC → 가격 및 사용 가능 여부.

## 5. App Privacy 답변 = `PrivacyInfo.xcprivacy`

[ios-templates/PrivacyInfo.xcprivacy](../ios-templates/PrivacyInfo.xcprivacy) 가 선언하는 것과 ASC 의
"앱 개인 정보 보호" 답변이 1:1 이어야 한다 (불일치는 Guideline 5.1.2 거절 사유).

| 데이터 | 수집 | 사용자와 연결 | 추적 | 목적 |
| --- | --- | --- | --- | --- |
| 이메일 주소 | 예 | 예 | 아니오 | 앱 기능 |
| 사용자 ID | 예 | 예 | 아니오 | 앱 기능 · 분석(자체) |
| 기타 사용자 콘텐츠 | 예 | 예 | 아니오 | 앱 기능 |
| 충돌·성능 데이터 | **아니오** | — | — | 매니페스트에 없다 (Crashlytics 미사용) |
| 광고 식별자·위치·연락처·사진 | 아니오 | — | — | |

## 6. 제품 페이지 "언어" 행 — `CFBundleLocalizations`

- 앱 UI 는 웹(lib/i18n)에서 그리므로 `.lproj` 폴더가 없다. Info.plist 에 `CFBundleLocalizations`
  가 없으면 제품 페이지에 **"언어: 영어"** 만 표시된다.
- [ios-templates/Info.plist](../ios-templates/Info.plist) 에 `en · ko · es · zh-Hans` 를 선언해 두었다.
  다음 빌드에서 `ios/App/App/Info.plist` 에 병합할 것 (RESUBMIT-IOS.md 상태 블록 참고).

## 7. 카테고리 · 연령

- 1차 Lifestyle, 2차 Health & Fitness. 연령 4+.

## 8. 심사 정보

- 데모 계정: [scripts/create-review-account.mjs](../scripts/create-review-account.mjs) 로 발급
  (평생 이용권 사전 부여).
- 연락처 이메일: `aseptichc@gmail.com`.
- 데모 영상: 위젯 추가 → 카드 확인 → 다짐 따라쓰기 → 결제 → 계정 삭제.

## 변경 이력

- **2026-09-24** 영문·중국어·스페인어 설정 검토 반영 — 이름·부제를 스크립트 관리로 편입,
  `es-MX`·`zh-Hant` 신설, 키워드 재편(공백 제거·이름 중복 제거·미사용 글자 채움), 설명에
  위젯·4개 언어·무료 시작 복구, 지원 URL 을 4개 언어 `/support` 로, 중국어 직역투 정리
  (功能一览·安静的设计·抄写), 스페인어 성별 중립화, 릴리스 노트 탭 이름 테스트 고정.
- **2026-08-09** 설명을 "믿는 대로 된다 · 2주 실험 · 평생 1회 결제" 톤으로 전면 교체.
- **2026-08-06** 잠금화면 위젯 문구 제거(당시 미출시) — 1.0.5 부터 위젯이 출시되어 09-24 에 복구.
