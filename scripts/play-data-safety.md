# Play Console — Data Safety 폼 답변 가이드

이 문서는 Google Play Console **App content → Data safety** 폼에 입력할 답변을
보관·재사용하기 위한 단일 출처입니다. `/privacy` 페이지 내용과 1:1 일치해야 하며,
수집 항목·목적이 바뀌면 두 곳을 같이 갱신하세요.

> 마지막 검토: 2026-05-13

---

## 0. 기본 설정

| 질문 | 답변 |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (Firebase/Vercel — TLS 1.2+) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — 앱 내 `설정 → 계정 → 계정 삭제` 및 `https://<deployed>/settings` |
| Does your app comply with Google Play's Families Policy? | **No** (만 14세 미만 비대상) |

---

## 1. 수집·공유 데이터 타입

각 항목은 *Collected / Shared / Optional / Purposes / Ephemeral* 로 답변합니다.
"Shared" 는 **운영 위탁(Firebase, Vercel, Gemini API)** 이 아니라 *분석·광고·재판매*
등 **제3자 데이터 사용**을 의미하므로 모두 **No** 로 응답합니다 (Google 정책 정의).

### Personal info

| Data type | Collected? | Shared? | Optional? | Purposes |
|---|---|---|---|---|
| Name | ✅ | ❌ | ❌ (Google 로그인 시 자동) | Account management |
| Email address | ✅ | ❌ | ❌ | Account management |
| User IDs (Firebase uid) | ✅ | ❌ | ❌ | Account management, App functionality |
| Address / Phone / Race / Political / Sexual / Other personal info | ❌ | — | — | — |

### Financial info

| Data type | Collected? | Shared? | Purposes |
|---|---|---|---|
| **Purchase history** | ✅ (purchaseToken, productId, purchaseTime) | ❌ | App functionality (entitlement 복원) |
| User payment info / Credit card / Credit score 등 | ❌ | — | — |

> ⚠️ 카드번호 등 결제수단 정보는 **Google Play 가 직접 처리**하므로 우리 앱은 수집하지 않음.

### Health and fitness
모두 **No**.

### Messages, Photos & videos, Audio, Files, Calendar, Contacts
모두 **No**.

### App activity

| Data type | Collected? | Shared? | Purposes |
|---|---|---|---|
| App interactions (위젯 갱신 시각·알림 탭) | ✅ | ❌ | App functionality |
| In-app search history / Installed apps / Other user-generated content | ❌ | — | — |
| **Other user-generated content** (사용자가 입력한 "10년 후의 나" 서술, 목표, 다짐, 잘한 일) | ✅ | ❌ | App functionality, Personalization |

### Web browsing
모두 **No**.

### App info & performance

| Data type | Collected? | Shared? | Purposes |
|---|---|---|---|
| Crash logs (Firebase Crashlytics 도입 시) | (미수집) | — | — |
| Diagnostics (Play Integrity 응답) | ✅ (일시적, 저장 안 함) | ❌ | Fraud prevention, security & compliance |
| Other app performance data | ❌ | — | — |

### Device or other IDs
모두 **No** — Advertising ID(AdID) 미사용, Android ID 미수집.

---

## 2. 보안 관행

| 질문 | 답변 |
|---|---|
| Is your data encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data be deleted? | **Yes**, 앱 내 영구 삭제 메뉴 제공 (`DELETE /api/account/delete`) |
| Have you committed to follow the Play Families Policy? | **N/A** (대상 아님) |
| Has your data collection and security practices been independently validated? | **No** (자체 선언) |

---

## 3. 개인정보 처리방침 URL

```
https://<deployed-domain>/privacy
```

배포 도메인이 결정되면 위 자리표시자를 실제 호스트로 갱신.

---

## 4. 변경 시 체크리스트

신규 데이터 수집/3rd-party SDK 도입 전에 아래를 모두 갱신해야 합니다.

- [ ] `app/privacy/page.tsx` — 항목 추가
- [ ] `scripts/play-data-safety.md` (이 파일) — 표 수정
- [ ] Play Console Data Safety 폼 — 신규 항목 체크
- [ ] (선택) 앱 내 권한 다이얼로그 문구

---

## 5. 자주 헷갈리는 답변

- **"Sharing" 의 정의**: 운영 위탁 처리자(Firebase, Vercel, Google Gemini)는
  "Sharing" 으로 잡지 **않습니다**. Sharing 은 광고·재판매·분석 제휴 등
  "제어권을 넘기는" 데이터 이동만 해당.
- **결제 정보**: Google Play 가 결제수단을 처리하므로 우리는 purchaseToken·
  productId·purchaseTime 만 보유. 이는 *Purchase history* 로만 답변하고 *User
  payment info* 는 No.
- **Play Integrity**: 일시적 검증 토큰이며 별도 보관하지 않으므로 "Diagnostics"
  내 "Ephemeral" 로 표시.
