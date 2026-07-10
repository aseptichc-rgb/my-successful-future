/**
 * Play Console / App Store 심사용 데모 계정 생성 스크립트.
 *
 * 심사관이 결제 없이 모든 유료 기능을 볼 수 있도록:
 *   1) Firebase Auth 에 이메일/비밀번호 사용자 생성 (이미 있으면 비밀번호만 재설정)
 *   2) custom claim 으로 lifetime entitlement 부여
 *      ({ ent: { kind: "lifetime", productId, grantedAt, platform: "android" } })
 *      → requirePaidUser() 게이트를 모두 통과
 *   3) entitlements/{uid} 문서에 감사용 레코드 기록
 *   4) users/{uid} 문서를 미리 채워 온보딩을 건너뛰게 함 (futurePersona·goals·onboardedAt)
 *
 * 사용:
 *   node scripts/create-review-account.mjs
 *
 * .env.local(또는 환경변수)의 FIREBASE_SERVICE_ACCOUNT_KEY / NEXT_PUBLIC_FIREBASE_PROJECT_ID,
 * 그리고 REVIEWER_EMAIL / REVIEWER_PASSWORD 를 사용한다(자격증명은 코드에 하드코딩하지 않는다).
 * 출력 결과를 그대로 Play Console > 앱 콘텐츠 > 앱 액세스에 붙여넣으면 된다.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const REVIEWER_DISPLAY_NAME = "Play Store Reviewer";

// 데모 사용자가 보게 될 미래 비전 — 심사관이 첫 화면에서 빈 상태가 아닌 실 데이터를 보게 한다.
const DEMO_FUTURE_PERSONA =
  "10년 후의 나는 매일 아침 운동과 독서로 하루를 열고, 가족과 시간을 보내며, " +
  "내가 사랑하는 일에서 안정적인 수입을 얻고 있다.";
const DEMO_GOALS = ["매일 30분 책 읽기", "주 4회 운동", "매일 1만 보 걷기"];
const DEMO_AFFIRMATIONS = [
  "나는 매일 조금씩 성장하는 사람이다.",
  "나는 내 시간을 가치 있게 쓰는 사람이다.",
  "나는 가족에게 따뜻한 사람이다.",
];

const LIFETIME_PRODUCT_ID = "anima_lifetime";

// ─── 환경변수 로딩 (.env.local → process.env) ─────────────────────────────
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local 부재해도 환경변수 직접 주입한 경우 동작하도록 무시.
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error("[create-review-account] FIREBASE_SERVICE_ACCOUNT_KEY 가 없습니다.");
  process.exit(1);
}

// 심사용 계정 자격증명은 코드가 아니라 환경변수(.env.local)에서 읽는다 — 저장소 유출 방지.
const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL;
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD;
if (!REVIEWER_EMAIL || !REVIEWER_PASSWORD) {
  console.error(
    "[create-review-account] REVIEWER_EMAIL / REVIEWER_PASSWORD 를 .env.local(또는 환경변수)에 설정하세요.",
  );
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const auth = getAuth();
const db = getFirestore();

/** 이미 같은 이메일의 사용자가 있으면 그 uid 를 그대로 쓰고 비밀번호만 재설정한다. */
async function ensureAuthUser() {
  try {
    const existing = await auth.getUserByEmail(REVIEWER_EMAIL);
    console.log(`[1/4] Auth 사용자 존재 — uid=${existing.uid}, 비밀번호 재설정`);
    await auth.updateUser(existing.uid, {
      password: REVIEWER_PASSWORD,
      displayName: REVIEWER_DISPLAY_NAME,
      emailVerified: true,
      disabled: false,
    });
    return existing.uid;
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({
      email: REVIEWER_EMAIL,
      password: REVIEWER_PASSWORD,
      displayName: REVIEWER_DISPLAY_NAME,
      emailVerified: true,
    });
    console.log(`[1/4] Auth 사용자 신규 생성 — uid=${created.uid}`);
    return created.uid;
  }
}

/**
 * lifetime entitlement custom claim 부여.
 * 기존 claim(트라이얼 등) 을 보존하기 위해 머지 후 setCustomUserClaims.
 * 객체 ent claim 을 사용 (lib/entitlement.ts readObjectClaim 가 우선 인식).
 */
async function grantLifetimeClaim(uid) {
  const rec = await auth.getUser(uid);
  const now = Date.now();
  const nextClaims = {
    ...(rec.customClaims ?? {}),
    ent: {
      kind: "lifetime",
      productId: LIFETIME_PRODUCT_ID,
      grantedAt: now,
      platform: "android",
    },
    // 평면 claim 도 같이 박아 두면 readEntitlement 가 어떤 경로로 와도 통과한다(이중 안전망).
    paid: true,
    productId: LIFETIME_PRODUCT_ID,
    purchaseTime: now,
  };
  await auth.setCustomUserClaims(uid, nextClaims);
  console.log(`[2/4] lifetime entitlement claim 부여 (productId=${LIFETIME_PRODUCT_ID})`);
}

/** entitlements/{uid} 감사 레코드 — 심사 후 추적·회수에 사용. */
async function writeEntitlementDoc(uid) {
  await db.doc(`entitlements/${uid}`).set(
    {
      uid,
      productId: LIFETIME_PRODUCT_ID,
      packageName: "com.michaelkim.anima",
      purchaseToken: `REVIEW_DEMO_${uid}`,
      purchaseTimeMs: Date.now(),
      purchaseState: 0,
      acknowledgementState: 1,
      source: "manual:review-account",
      verifiedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`[3/4] entitlements/${uid} 문서 기록`);
}

/**
 * users/{uid} 문서를 채워 온보딩을 건너뛰게 한다.
 * 심사관이 첫 진입부터 home 화면을 바로 볼 수 있도록 futurePersona·goals·affirmations 도 시드.
 */
async function seedUserDoc(uid) {
  const now = FieldValue.serverTimestamp();
  await db.doc(`users/${uid}`).set(
    {
      email: REVIEWER_EMAIL,
      displayName: REVIEWER_DISPLAY_NAME,
      locale: "ko",
      futurePersona: DEMO_FUTURE_PERSONA,
      goals: DEMO_GOALS,
      successAffirmations: DEMO_AFFIRMATIONS,
      onboardedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
  console.log(`[4/4] users/${uid} 문서 시드 (온보딩 스킵 + 데모 데이터)`);
}

(async () => {
  try {
    const uid = await ensureAuthUser();
    await grantLifetimeClaim(uid);
    await writeEntitlementDoc(uid);
    await seedUserDoc(uid);

    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("✅ Play Console / App Store 심사용 계정 준비 완료");
    console.log("══════════════════════════════════════════════════════════════");
    console.log(`  email   : ${REVIEWER_EMAIL}`);
    console.log(`  password: ${REVIEWER_PASSWORD}`);
    console.log(`  uid     : ${uid}`);
    console.log("  권한    : lifetime (모든 유료 기능 접근 가능)");
    console.log("──────────────────────────────────────────────────────────────");
    console.log("  Play Console > 앱 콘텐츠 > 앱 액세스 > 모든 기능에 액세스");
    console.log("  '로그인이 필요함' 체크 → 사용자 이름/비밀번호에 위 값 입력");
    console.log("══════════════════════════════════════════════════════════════\n");
  } catch (err) {
    console.error("[create-review-account] 실패:", err);
    process.exit(1);
  }
})();
