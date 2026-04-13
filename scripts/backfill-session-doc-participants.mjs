// 일회성 마이그레이션: 기존 sessionDocuments 에 participants 필드를 채워 넣는다.
// 새 보안 규칙이 resource.data.participants 를 직접 보기 때문에 필수.
// 실행: node scripts/backfill-session-doc-participants.mjs
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

// .env.local 수동 로드 (dotenv 의존성 추가 회피)
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!getApps().length) {
  if (keyJson) {
    initializeApp({ credential: cert(JSON.parse(keyJson)) });
  } else if (keyPath) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
  } else {
    initializeApp(); // ADC
  }
}

const db = getFirestore();

const docs = await db.collection("sessionDocuments").get();
console.log(`총 ${docs.size}개 문서 검사 중...`);

const sessionCache = new Map();
let updated = 0;
let skipped = 0;
let orphaned = 0;

for (const d of docs.docs) {
  const data = d.data();
  if (Array.isArray(data.participants) && data.participants.length > 0) {
    skipped += 1;
    continue;
  }
  const sessionId = data.sessionId;
  if (!sessionId) {
    orphaned += 1;
    continue;
  }
  let participants = sessionCache.get(sessionId);
  if (!participants) {
    const s = await db.doc(`sessions/${sessionId}`).get();
    participants = Array.isArray(s.data()?.participants) ? s.data().participants : null;
    sessionCache.set(sessionId, participants);
  }
  if (!participants) {
    // 세션이 없으면 ownerUid 로라도 fallback
    participants = data.ownerUid ? [data.ownerUid] : [];
  }
  await d.ref.update({ participants });
  updated += 1;
}

console.log(`완료: 업데이트 ${updated}, 스킵(이미 있음) ${skipped}, sessionId 없음 ${orphaned}`);
process.exit(0);
