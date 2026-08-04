/**
 * Play Console 서비스 계정 권한 진단 (읽기 전용).
 *
 * 사용: node scripts/play-diagnose-auth.mjs
 *
 * 403 이 어디서 나는지(토큰 발급 / API 활성화 / 앱 권한) 구분해서 알려준다.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const PACKAGE_NAME = "com.michaelkim.anima";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPES = ["https://www.googleapis.com/auth/androidpublisher"];

function loadCredentials() {
  if (process.env.GOOGLE_PLAY_SA_KEY) return JSON.parse(process.env.GOOGLE_PLAY_SA_KEY);
  if (process.env.GOOGLE_PLAY_SA_KEY_FILE) {
    return JSON.parse(readFileSync(process.env.GOOGLE_PLAY_SA_KEY_FILE, "utf8"));
  }
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) throw new Error(`.env.local 이 없습니다: ${envFile}`);
  const matched = readFileSync(envFile, "utf8").match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.*)$/m);
  if (!matched) throw new Error(".env.local 에 FIREBASE_SERVICE_ACCOUNT_KEY 가 없습니다.");
  let raw = matched[1].trim();
  const quoted = (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'));
  if (quoted) raw = raw.slice(1, -1);
  return JSON.parse(raw);
}

function explain(err) {
  const status = err?.code || err?.response?.status;
  const body = err?.response?.data?.error;
  return {
    status,
    message: body?.message || err?.message || String(err),
    reason: body?.errors?.[0]?.reason ?? body?.status ?? "-",
  };
}

async function main() {
  const credentials = loadCredentials();
  console.log(`서비스 계정 : ${credentials.client_email}`);
  console.log(`GCP 프로젝트: ${credentials.project_id}`);
  console.log(`패키지      : ${PACKAGE_NAME}\n`);

  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });

  console.log("1) 액세스 토큰 발급…");
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    console.log(`   OK — 토큰 길이 ${String(token?.token ?? "").length}\n`);
  } catch (err) {
    const e = explain(err);
    console.log(`   실패(${e.status}) ${e.reason}: ${e.message}\n`);
    return;
  }

  const publisher = google.androidpublisher({ version: "v3", auth });

  console.log("2) edits.insert (앱 편집 권한)…");
  try {
    const edit = await publisher.edits.insert({ packageName: PACKAGE_NAME });
    console.log(`   OK — editId ${edit.data.id}`);
    try {
      await publisher.edits.delete({ packageName: PACKAGE_NAME, editId: edit.data.id });
      console.log("   edit 세션 정리 완료.");
    } catch {
      /* 무시 */
    }
  } catch (err) {
    const e = explain(err);
    console.log(`   실패(${e.status}) ${e.reason}: ${e.message}`);
    if (e.status === 403 && /not have permission/i.test(e.message)) {
      console.log(
        "\n   → 토큰은 정상 = 키/API 활성화는 문제 없음. 이 앱에 대한 '앱 권한'이 없다는 뜻.\n" +
          "     Play Console > 사용자 및 권한 > 해당 서비스 계정 > 앱 권한에\n" +
          `     '${PACKAGE_NAME}' 추가 + '앱 버전 생성/출시' 권한 부여 필요.`,
      );
    }
    if (e.status === 403 && /has not been used|is disabled/i.test(e.message)) {
      console.log(
        "\n   → Google Play Android Developer API 가 GCP 프로젝트에서 비활성 상태입니다.\n" +
          `     https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com?project=${credentials.project_id}`,
      );
    }
  }
}

main().catch((err) => {
  const e = explain(err);
  console.error(`진단 실패(${e.status ?? "?"}): ${e.message}`);
  process.exit(1);
});
