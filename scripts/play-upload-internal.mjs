/**
 * Play Console 내부 테스트 트랙 AAB 업로드 (androidpublisher v3 edits 플로우).
 *
 * 사용:
 *   node scripts/play-upload-internal.mjs <aab-path> [--notes "릴리스 노트"]
 *
 * 인증(우선순위):
 *   1. GOOGLE_PLAY_SA_KEY 환경변수 (서비스 계정 JSON 전체 문자열 — lib/playBilling.ts 와 동일 규약)
 *   2. GOOGLE_PLAY_SA_KEY_FILE 환경변수 (JSON 파일 경로)
 *   3. 저장소 루트의 firebase-adminsdk JSON (로컬 폴백)
 *
 * 요구 권한: 해당 서비스 계정이 Play Console 에 초대되어 "테스트 트랙에 출시" 권한을
 * 가져야 한다. 403 이면 Play Console > 사용자 및 권한에서 권한을 부여할 것.
 */
import { readFileSync, existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const PACKAGE_NAME = "com.michaelkim.anima";
const TRACK = "internal";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FALLBACK_SA_FILE = join(ROOT, "my-successful-future-firebase-adminsdk-fbsvc-46b79f77e1.json");

function fail(msg) {
  console.error(`[play-upload] ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const aabPath = args.find((a) => !a.startsWith("--"));
if (!aabPath) fail("AAB 경로가 필요합니다: node scripts/play-upload-internal.mjs <aab>");
const aabAbs = resolve(aabPath);
if (!existsSync(aabAbs)) fail(`AAB 파일이 없습니다: ${aabAbs}`);
const notesIdx = args.indexOf("--notes");
const releaseNotes = notesIdx >= 0 && args[notesIdx + 1] ? args[notesIdx + 1] : null;

function loadCredentials() {
  if (process.env.GOOGLE_PLAY_SA_KEY) {
    try {
      return JSON.parse(process.env.GOOGLE_PLAY_SA_KEY);
    } catch {
      fail("GOOGLE_PLAY_SA_KEY 가 유효한 JSON 이 아닙니다.");
    }
  }
  const file = process.env.GOOGLE_PLAY_SA_KEY_FILE || FALLBACK_SA_FILE;
  if (!existsSync(file)) fail(`서비스 계정 키 파일이 없습니다: ${file}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(`서비스 계정 키 파일 파싱 실패: ${file}`);
  }
}

async function main() {
  const credentials = loadCredentials();
  console.log(`[play-upload] 서비스 계정: ${credentials.client_email}`);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const publisher = google.androidpublisher({ version: "v3", auth });

  console.log(`[play-upload] edit 세션 생성 (${PACKAGE_NAME})…`);
  const edit = await publisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = edit.data.id;
  if (!editId) fail("edit id 를 받지 못했습니다.");

  try {
    console.log(`[play-upload] AAB 업로드: ${aabAbs}`);
    const uploaded = await publisher.edits.bundles.upload({
      packageName: PACKAGE_NAME,
      editId,
      media: {
        mimeType: "application/octet-stream",
        body: createReadStream(aabAbs),
      },
    });
    const versionCode = uploaded.data.versionCode;
    console.log(`[play-upload] 업로드 완료 — versionCode ${versionCode}`);

    console.log(`[play-upload] "${TRACK}" 트랙에 배정…`);
    await publisher.edits.tracks.update({
      packageName: PACKAGE_NAME,
      editId,
      track: TRACK,
      requestBody: {
        track: TRACK,
        releases: [
          {
            versionCodes: [String(versionCode)],
            status: "completed",
            ...(releaseNotes
              ? { releaseNotes: [{ language: "ko-KR", text: releaseNotes }] }
              : {}),
          },
        ],
      },
    });

    console.log("[play-upload] commit…");
    await publisher.edits.commit({ packageName: PACKAGE_NAME, editId });
    console.log(`[play-upload] ✅ 내부 테스트 트랙에 versionCode ${versionCode} 출시 완료.`);
  } catch (err) {
    // 실패한 edit 세션은 정리(미정리 시 다음 edits.insert 가 막히진 않지만 위생상).
    try {
      await publisher.edits.delete({ packageName: PACKAGE_NAME, editId });
    } catch {
      /* 정리 실패는 무시 */
    }
    throw err;
  }
}

main().catch((err) => {
  const code = err?.code || err?.response?.status;
  const detail = err?.response?.data?.error?.message || err?.message || String(err);
  if (code === 401 || code === 403) {
    fail(
      `권한 오류(${code}): ${detail}\n` +
        "→ 이 서비스 계정이 Play Console 에 초대되어 '테스트 트랙에 출시' 권한이 있는지 확인하세요.\n" +
        "  (Play Console > 사용자 및 권한 > 사용자 초대 > 서비스 계정 이메일)",
    );
  }
  fail(`업로드 실패(${code ?? "?"}): ${detail}`);
});
