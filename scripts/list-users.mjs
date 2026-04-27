import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
const auth = getAuth();
const db = getFirestore();

const list = await auth.listUsers(50);
console.log(`Auth 사용자 ${list.users.length}명:`);
for (const u of list.users) {
  console.log(`  ${u.uid} | ${u.email || "(no email)"} | ${u.displayName || ""} | created=${u.metadata.creationTime}`);
}

console.log(`\nusers 컬렉션:`);
const usersSnap = await db.collection("users").limit(50).get();
console.log(`  총 ${usersSnap.size}건`);
usersSnap.forEach((d) => {
  const x = d.data();
  console.log(`  ${d.id} | email=${x.email || "?"} | displayName=${x.displayName || "?"} | futurePersona=${(x.futurePersona || "").length}자`);
});
