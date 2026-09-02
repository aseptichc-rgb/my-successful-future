/**
 * 안드로이드/iOS 위젯 파이프라인 진단 — "위젯이 왜 안 바뀌나" 를 서버 쪽 증거로 답한다.
 *
 * 무엇을 보나 (모두 읽기 전용, 단 --call 은 오늘 카드가 없으면 서버가 생성한다):
 *   1) Auth 사용자 — 마지막 로그인/토큰 갱신 시각, 토큰 무효화 시각, claim.
 *   2) users/{uid} — 언어·streak·목표·다짐 (위젯 화면과 대조).
 *   3) users/{uid}/usage/{ymd} — widgetRefresh 카운트. 이 값이 있는 날은 네이티브 클라이언트가
 *      /api/widget/today 로 그날 카드를 "만들었다"는 뜻이다(웹 /home 은 Android 에서 이 라우트를
 *      부르지 않는다). 카드는 만들어졌는데 위젯이 그대로면 클라이언트가 응답을 받기 전에 끊었거나
 *      받은 뒤 저장에 실패한 것이다.
 *   4) users/{uid}/dailyMotivations/{ymd} — 날짜별 카드(명언·작가·생성 시각).
 *   5) affirmationLogs / dailyEntries — 위젯의 "n / 3 완료" 가 어느 날 상태인지 대조.
 *   6) --call: 같은 uid 로 운영 /api/widget/today 를 안드로이드와 같은 방식(Bearer + _t + no-cache,
 *      okhttp UA)으로 N회 호출해 상태·지연·응답 형태(Kotlin 모델 호환)를 확인한다.
 *
 * 사용:
 *   node scripts/widget-diagnose.mjs <email>            # 이메일로 계정 지정
 *   node scripts/widget-diagnose.mjs uid:<uid>
 *   node scripts/widget-diagnose.mjs "vow:<다짐 문구>"   # 위젯 VOW 에 보이는 문구로 계정 역추적
 *   ... --call [--calls=3] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 *
 * 2026-09-02 사고 기록: 세션 이메일(kjykjj04@gmail.com)과 폰 계정(kjykjj04@asepticasia.com)이 달라
 * 첫 조회가 엉뚱한 계정을 봤다. VOW 문구로 역추적하는 vow: 모드는 그 교훈이다.
 *
 * 보안: 서비스 계정 키는 .env.local 에서만 읽고 출력하지 않는다. 사용자 본문(다짐·목표)은
 * 운영자 본인의 진단 용도로만 stdout 에 나간다 — 로그 파일로 남기지 말 것.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const PROD_BASE_URL = process.env.ANIMA_PROD_URL || "https://my-successful-future.vercel.app";
const IDENTITY_TOOLKIT = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
// 안드로이드 OkHttp 와 같은 UA 로 호출해 봇 차단/UA 분기 같은 환경 요인까지 같은 조건으로 본다.
const ANDROID_LIKE_UA = "okhttp/4.12.0";
const DEFAULT_DAYS_BACK = 15;
const DEFAULT_CALLS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function loadEnvLocal() {
  try {
    const env = readFileSync(".env.local", "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // .env.local 없음 — 환경변수만으로 진행.
  }
}

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const todayKst = new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
  const to = flag("to") ?? todayKst;
  const from =
    flag("from") ??
    new Date(new Date(`${to}T00:00:00Z`).getTime() - DEFAULT_DAYS_BACK * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
  return {
    target: positional[0],
    call: argv.includes("--call"),
    calls: Number(flag("calls") ?? DEFAULT_CALLS),
    from,
    to,
  };
}

function ymdRange(from, to) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function initAdmin() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY 가 없습니다 (.env.local 확인).");
  }
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

async function resolveUids({ auth, db }, target) {
  if (!target) throw new Error("대상을 지정하세요: <email> | uid:<uid> | vow:<다짐 문구>");
  if (target.startsWith("uid:")) return [target.slice(4)];
  if (target.startsWith("vow:")) {
    const text = target.slice(4);
    const snap = await db.collection("users").where("successAffirmations", "array-contains", text).get();
    console.log(`다짐 "${text}" 을 가진 계정: ${snap.docs.map((d) => d.id).join(", ") || "(없음)"}`);
    return snap.docs.map((d) => d.id);
  }
  return [(await auth.getUserByEmail(target)).uid];
}

/**
 * 응답이 Android `Models.kt` 의 kotlinx.serialization 모델로 디코딩 가능한지 검사.
 * 필수 String 누락·Int 자리에 소수 같은 불일치는 클라이언트에서 SerializationException 으로
 * 터져 "서버는 200 인데 캐시는 그대로" 가 된다 — 그 가능성을 서버 쪽에서 먼저 배제한다.
 */
function kotlinModelProblems(body) {
  const problems = [];
  const isInt = (v) => Number.isInteger(v);
  const reqStr = (v, path) => {
    if (typeof v !== "string") problems.push(`${path}: 문자열 필수 (${JSON.stringify(v)})`);
  };
  reqStr(body.generatedAt, "generatedAt");
  reqStr(body.ymd, "ymd");
  reqStr(body.nextRefreshAt, "nextRefreshAt");
  if (!Array.isArray(body.slots)) problems.push("slots: 배열 필수");
  for (const [i, s] of (body.slots ?? []).entries()) {
    reqStr(s.text, `slots[${i}].text`);
    reqStr(s.author, `slots[${i}].author`);
    if (!s.gradient) {
      problems.push(`slots[${i}].gradient: 필수`);
    } else {
      reqStr(s.gradient.from, `slots[${i}].gradient.from`);
      reqStr(s.gradient.to, `slots[${i}].gradient.to`);
      reqStr(s.gradient.tone, `slots[${i}].gradient.tone`);
      if (!isInt(s.gradient.angle)) problems.push(`slots[${i}].gradient.angle: Int 필수 (${s.gradient.angle})`);
    }
  }
  for (const k of ["currentSlotIndex", "streakCount", "goalsAchievedCount", "goalsTotalCount"]) {
    if (body[k] !== undefined && !isInt(body[k])) problems.push(`${k}: Int 필수 (${body[k]})`);
  }
  for (const k of ["morningHour", "eveningHour"]) {
    const v = body.notificationPrefs?.[k];
    if (v !== undefined && !isInt(v)) problems.push(`notificationPrefs.${k}: Int 필수 (${v})`);
  }
  const copies = Object.entries(body.notificationContent ?? {}).flatMap(([k, v]) =>
    k === "morningUpcoming" ? Object.entries(v ?? {}).map(([d, c]) => [`morningUpcoming.${d}`, c]) : [[k, v]],
  );
  for (const [k, c] of copies) {
    if (c == null) continue;
    reqStr(c.title, `notificationContent.${k}.title`);
    reqStr(c.body, `notificationContent.${k}.body`);
  }
  for (const [i, u] of (body.upcoming ?? []).entries()) {
    reqStr(u.ymd, `upcoming[${i}].ymd`);
    reqStr(u.text, `upcoming[${i}].text`);
    reqStr(u.author, `upcoming[${i}].author`);
  }
  if (body.futureVision) {
    reqStr(body.futureVision.title, "futureVision.title");
    reqStr(body.futureVision.teaser, "futureVision.teaser");
  }
  return problems;
}

async function mintIdToken(auth, uid) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY 가 없습니다.");
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(`${IDENTITY_TOOLKIT}?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`customToken 교환 실패: ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json.idToken;
}

async function callProduction(auth, uid, calls) {
  console.log(`== 운영 /api/widget/today (${PROD_BASE_URL}) — ${calls}회, 안드로이드와 같은 호출 방식`);
  const idToken = await mintIdToken(auth, uid);
  for (let i = 0; i < calls; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${PROD_BASE_URL}/api/widget/today?_t=${Date.now()}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Cache-Control": "no-cache",
          "User-Agent": ANDROID_LIKE_UA,
          Accept: "application/json",
        },
      });
      const text = await res.text();
      const ms = Date.now() - t0;
      let detail;
      try {
        const body = JSON.parse(text);
        const problems = kotlinModelProblems(body);
        detail =
          `ymd=${body.ymd} quote="${String(body.slots?.[0]?.text ?? "").slice(0, 24)}" ` +
          `progress=${JSON.stringify(body.todayProgress)} streak=${body.streakCount} upcoming=${body.upcoming?.length ?? 0} ` +
          `| Kotlin 모델 호환: ${problems.length ? problems.join("; ") : "OK"}`;
      } catch {
        detail = `JSON 아님: ${text.slice(0, 160)}`;
      }
      console.log(`  ${i + 1}) ${res.status} ${ms}ms ${text.length}B — ${detail}`);
    } catch (err) {
      console.log(`  ${i + 1}) 호출 실패 ${Date.now() - t0}ms — ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function diagnose({ auth, db }, uid, opts) {
  console.log(`\n################ uid=${uid}`);
  const user = await auth.getUser(uid);
  console.log("== Auth 사용자");
  console.log({
    email: user.email,
    created: user.metadata.creationTime,
    lastSignIn: user.metadata.lastSignInTime,
    lastRefresh: user.metadata.lastRefreshTime,
    tokensValidAfterTime: user.tokensValidAfterTime,
    customClaims: user.customClaims,
    providers: user.providerData.map((p) => p.providerId),
  });

  const userDoc = (await db.collection("users").doc(uid).get()).data() ?? {};
  console.log("== users/{uid} (위젯과 대조할 필드)");
  console.log({
    language: userDoc.language,
    notificationPrefs: userDoc.notificationPrefs,
    affirmationStreak: userDoc.affirmationStreak,
    goals: userDoc.goals,
    successAffirmations: userDoc.successAffirmations,
    seenQuoteTextsCount: Array.isArray(userDoc.seenQuoteTexts) ? userDoc.seenQuoteTexts.length : null,
  });

  const days = ymdRange(opts.from, opts.to);
  console.log(`== 날짜별 usage(쿼터) · dailyMotivations · 진척도  [${opts.from} ~ ${opts.to}]`);
  for (const ymd of days) {
    const [usage, motivation, affirmation, entry] = await Promise.all([
      db.doc(`users/${uid}/usage/${ymd}`).get(),
      db.doc(`users/${uid}/dailyMotivations/${ymd}`).get(),
      db.doc(`users/${uid}/affirmationLogs/${ymd}`).get(),
      db.doc(`users/${uid}/dailyEntries/${ymd}`).get(),
    ]);
    const usageStr = usage.exists
      ? JSON.stringify(Object.fromEntries(Object.entries(usage.data()).filter(([k]) => !["ymd", "createdAt", "updatedAt"].includes(k))))
      : "-";
    const m = motivation.data();
    const motivationStr = motivation.exists
      ? `"${String(m.quote ?? "").slice(0, 22)}" / ${m.author} @ ${m.createdAt?.toDate?.().toISOString?.() ?? "?"}`
      : "-";
    const e = entry.data() ?? {};
    const progressStr = `affirmation=${affirmation.exists ? 1 : 0} goals=${(e.achievedGoals ?? []).length} wins=${(e.wins ?? []).filter((w) => typeof w === "string" && w.trim()).length}`;
    console.log(`  ${ymd}  usage=${usageStr}  card=${motivationStr}  ${progressStr}`);
  }

  if (opts.call) await callProduction(auth, uid, opts.calls);
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const ctx = initAdmin();
  const uids = await resolveUids(ctx, opts.target);
  if (uids.length === 0) {
    console.log("해당 계정이 없습니다.");
    return;
  }
  for (const uid of uids) await diagnose(ctx, uid, opts);
}

main().catch((err) => {
  console.error("진단 실패:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
