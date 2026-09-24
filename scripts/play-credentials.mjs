/**
 * Play Developer API 서비스 계정 자격증명 — upload / promote 스크립트가 같은 규칙을 쓴다.
 *
 * 우선순위:
 *   1. GOOGLE_PLAY_SA_KEY        서비스 계정 JSON 문자열 (lib/playBilling.ts 와 동일 규약)
 *   2. GOOGLE_PLAY_SA_KEY_FILE   JSON 파일 경로
 *   3. 저장소 루트의 firebase-adminsdk JSON (로컬 폴백)
 *   4. 저장소 루트 .env.local 의 FIREBASE_SERVICE_ACCOUNT_KEY (같은 서비스 계정)
 *
 * 키 값은 어디에도 출력하지 않는다 — 호출부는 client_email 만 로그에 남긴다.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FALLBACK_SA_FILE = join(ROOT, "my-successful-future-firebase-adminsdk-fbsvc-46b79f77e1.json");
const ENV_FILE = join(ROOT, ".env.local");
const ENV_KEY = "FIREBASE_SERVICE_ACCOUNT_KEY";

function parseJson(raw, label, fail) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${label} 가 유효한 JSON 이 아닙니다.`);
  }
}

function stripQuotes(raw) {
  const trimmed = raw.trim();
  const quoted =
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/** @param {(msg: string) => never} fail 호출부의 종료 함수(메시지 출력 + process.exit) */
export function loadPlayCredentials(fail) {
  if (process.env.GOOGLE_PLAY_SA_KEY) {
    return parseJson(process.env.GOOGLE_PLAY_SA_KEY, "GOOGLE_PLAY_SA_KEY", fail);
  }
  const file = process.env.GOOGLE_PLAY_SA_KEY_FILE;
  if (file) {
    if (!existsSync(file)) fail(`서비스 계정 키 파일이 없습니다: ${file}`);
    return parseJson(readFileSync(file, "utf8"), file, fail);
  }
  if (existsSync(FALLBACK_SA_FILE)) {
    return parseJson(readFileSync(FALLBACK_SA_FILE, "utf8"), FALLBACK_SA_FILE, fail);
  }
  if (!existsSync(ENV_FILE)) {
    fail(
      "인증 정보를 찾을 수 없습니다 — GOOGLE_PLAY_SA_KEY / GOOGLE_PLAY_SA_KEY_FILE / " +
        `${FALLBACK_SA_FILE} / ${ENV_FILE} 중 하나가 필요합니다.`,
    );
  }
  const matched = readFileSync(ENV_FILE, "utf8").match(new RegExp(`^${ENV_KEY}=(.*)$`, "m"));
  if (!matched) fail(`.env.local 에 ${ENV_KEY} 가 없습니다.`);
  return parseJson(stripQuotes(matched[1]), `.env.local 의 ${ENV_KEY}`, fail);
}
