// 진단 스크립트: 아침 뉴스가 안 오는 원인 추적
// 1) Firestore에 사용자 스케줄 문서가 실제로 저장되어 있는지
// 2) 토글이 enabled=true 인지, lastFiredYmd 가 어떻게 갱신됐는지
// 3) /api/collect-news 가 처리할 만한 데이터가 있는지
// 실행: node scripts/diagnose-morning-news.mjs <email>
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!keyJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT_KEY 없음");
  process.exit(1);
}
if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(keyJson)),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
const db = getFirestore();
const auth = getAuth();

const email = process.argv[2] || "kjykjj04@gmail.com";

const kstNow = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
};

async function main() {
  console.log(`=== 진단 대상: ${email} ===`);
  console.log(`KST 오늘: ${kstNow()}`);

  let uid;
  try {
    const u = await auth.getUserByEmail(email);
    uid = u.uid;
    console.log(`UID: ${uid}`);
  } catch (e) {
    console.error(`사용자 조회 실패: ${e.message}`);
    return;
  }

  // ── personaSchedules ────────────────────────────────────────
  console.log(`\n[1] users/${uid}/personaSchedules`);
  const ps = await db.collection("users").doc(uid).collection("personaSchedules").get();
  if (ps.empty) {
    console.log("  → 문서 없음 (페르소나별 정시 스케줄이 저장된 적 없음)");
  } else {
    ps.forEach((d) => {
      const x = d.data();
      console.log(`  - ${d.id}: enabled=${x.enabled}, slots=${JSON.stringify(x.scheduledTimes ?? [])}, keywords=${JSON.stringify(x.keywords ?? [])}`);
    });
  }

  // ── dailyRitualConfigs ─────────────────────────────────────
  console.log(`\n[2] dailyRitualConfigs/${uid}`);
  const dr = await db.collection("dailyRitualConfigs").doc(uid).get();
  if (!dr.exists) {
    console.log("  → 문서 없음 (아침 브리프/저녁 회고 설정이 저장된 적 없음)");
  } else {
    const x = dr.data();
    console.log(`  enabled=${x.enabled}`);
    console.log(`  morning: enabled=${x.morningEnabled}, time=${x.morningTime}, lastFired=${x.lastMorningDate}`);
    console.log(`  evening: enabled=${x.eveningEnabled}, time=${x.eveningTime}, lastFired=${x.lastEveningDate}`);
    console.log(`  sessionId=${x.sessionId}`);
  }

  // ── keywordAlerts (사용자 세션의 것만) ──────────────────────
  console.log(`\n[3] keywordAlerts (참여 세션 중 scheduledEnabled=true)`);
  const ka = await db.collection("keywordAlerts").where("scheduledEnabled", "==", true).get();
  let mine = 0;
  for (const d of ka.docs) {
    const sess = await db.collection("sessions").doc(d.id).get();
    if (!sess.exists) continue;
    const participants = sess.get("participants") || [];
    if (!participants.includes(uid)) continue;
    mine++;
    const x = d.data();
    console.log(`  - session ${d.id}: slots=${JSON.stringify(x.scheduledTimes ?? [])}, kws=${JSON.stringify(x.keywords ?? [])}`);
  }
  if (mine === 0) console.log("  → 본인 세션의 정시 키워드 알림 없음");

  // ── 사용자 futurePersona 여부 (아침 브리프 필수) ────────────
  console.log(`\n[4] users/${uid}.futurePersona`);
  const u = await db.collection("users").doc(uid).get();
  if (!u.exists) {
    console.log("  → users 문서 없음");
  } else {
    const fp = (u.get("futurePersona") || "").trim();
    console.log(`  futurePersona ${fp ? `설정됨 (${fp.length}자)` : "비어 있음 → 아침 브리프 발사 안 됨"}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
