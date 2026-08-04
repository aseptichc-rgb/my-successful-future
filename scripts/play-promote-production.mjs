/**
 * Play Console 내부 테스트 트랙 → 프로덕션(정식 출시) 승격 스크립트.
 *
 * 사용:
 *   node scripts/play-promote-production.mjs                       # dry-run (현황만 출력, 변경 없음)
 *   node scripts/play-promote-production.mjs --commit               # internal 최신 버전을 100% 프로덕션 출시
 *   node scripts/play-promote-production.mjs --commit --rollout 0.1 # 10% 단계적 출시
 *   node scripts/play-promote-production.mjs --commit --version-code 43 --notes "릴리스 노트"
 *
 * 옵션:
 *   --commit               실제로 edits.commit 수행 (없으면 dry-run — edit 세션을 삭제하고 종료)
 *   --from <track>         승격 원본 트랙 (기본 internal)
 *   --version-code <n>     승격할 versionCode 지정 (기본: 원본 트랙 릴리스 중 최대값)
 *   --rollout <0~1>        단계적 출시 비율. 1 또는 미지정이면 전체 출시(completed)
 *   --notes "<text>"       ko-KR 릴리스 노트. 미지정 시 원본 트랙의 노트를 그대로 승계
 *
 * 인증(우선순위):
 *   1. GOOGLE_PLAY_SA_KEY        서비스 계정 JSON 문자열
 *   2. GOOGLE_PLAY_SA_KEY_FILE   서비스 계정 JSON 파일 경로
 *   3. 저장소 루트 .env.local 의 FIREBASE_SERVICE_ACCOUNT_KEY
 *
 * 요구 권한: 서비스 계정이 Play Console 에서 "프로덕션 트랙에 출시" 권한을 가져야 한다.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const PACKAGE_NAME = "com.michaelkim.anima";
const TARGET_TRACK = "production";
const DEFAULT_SOURCE_TRACK = "internal";
const RELEASE_NOTE_LANGUAGE = "ko-KR";
const FULL_ROLLOUT = 1;
const STATUS_COMPLETED = "completed";
const STATUS_IN_PROGRESS = "inProgress";
const NOTE_PREVIEW_LENGTH = 160;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`[play-promote] ${msg}`);
  process.exit(1);
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const rolloutRaw = readFlag(args, "--rollout");
  let rollout = FULL_ROLLOUT;
  if (rolloutRaw !== null) {
    rollout = Number(rolloutRaw);
    if (!Number.isFinite(rollout) || rollout <= 0 || rollout > FULL_ROLLOUT) {
      fail(`--rollout 은 0 초과 1 이하의 값이어야 합니다: ${rolloutRaw}`);
    }
  }
  const versionCodeRaw = readFlag(args, "--version-code");
  let versionCode = null;
  if (versionCodeRaw !== null) {
    versionCode = Number(versionCodeRaw);
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      fail(`--version-code 는 양의 정수여야 합니다: ${versionCodeRaw}`);
    }
  }
  return {
    commit: args.includes("--commit"),
    sourceTrack: readFlag(args, "--from") ?? DEFAULT_SOURCE_TRACK,
    versionCode,
    rollout,
    notes: readFlag(args, "--notes"),
  };
}

function loadCredentials() {
  if (process.env.GOOGLE_PLAY_SA_KEY) {
    try {
      return JSON.parse(process.env.GOOGLE_PLAY_SA_KEY);
    } catch {
      fail("GOOGLE_PLAY_SA_KEY 가 유효한 JSON 이 아닙니다.");
    }
  }
  if (process.env.GOOGLE_PLAY_SA_KEY_FILE) {
    const file = process.env.GOOGLE_PLAY_SA_KEY_FILE;
    if (!existsSync(file)) fail(`서비스 계정 키 파일이 없습니다: ${file}`);
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      fail(`서비스 계정 키 파일 파싱 실패: ${file}`);
    }
  }
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) fail(`인증 정보를 찾을 수 없습니다 (.env.local 없음: ${envFile})`);
  try {
    const matched = readFileSync(envFile, "utf8").match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.*)$/m);
    if (!matched) fail(".env.local 에 FIREBASE_SERVICE_ACCOUNT_KEY 가 없습니다.");
    let raw = matched[1].trim();
    const quoted =
      (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'));
    if (quoted) raw = raw.slice(1, -1);
    return JSON.parse(raw);
  } catch (err) {
    fail(`.env.local 의 서비스 계정 키 파싱 실패: ${err.message}`);
  }
}

function describeRelease(release) {
  const codes = (release.versionCodes ?? []).join(",");
  const fraction = release.userFraction != null ? ` userFraction=${release.userFraction}` : "";
  return `status=${release.status} name=${release.name ?? "-"} versionCodes=[${codes}]${fraction}`;
}

async function readTrack(publisher, editId, track) {
  try {
    const res = await publisher.edits.tracks.get({ packageName: PACKAGE_NAME, editId, track });
    return res.data.releases ?? [];
  } catch (err) {
    const code = err?.code || err?.response?.status;
    if (code === 404) return [];
    throw err;
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const credentials = loadCredentials();
  console.log(`[play-promote] 서비스 계정: ${credentials.client_email}`);
  console.log(
    `[play-promote] ${opts.sourceTrack} → ${TARGET_TRACK} / ${opts.commit ? "COMMIT" : "DRY-RUN"}`,
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const publisher = google.androidpublisher({ version: "v3", auth });

  const edit = await publisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = edit.data.id;
  if (!editId) fail("edit id 를 받지 못했습니다.");

  let committed = false;
  try {
    const sourceReleases = await readTrack(publisher, editId, opts.sourceTrack);
    const targetReleases = await readTrack(publisher, editId, TARGET_TRACK);

    console.log(`\n[현황] ${opts.sourceTrack}`);
    sourceReleases.forEach((r) => console.log(`  - ${describeRelease(r)}`));
    if (!sourceReleases.length) console.log("  (릴리스 없음)");
    console.log(`[현황] ${TARGET_TRACK}`);
    targetReleases.forEach((r) => console.log(`  - ${describeRelease(r)}`));
    if (!targetReleases.length) console.log("  (릴리스 없음 — 첫 프로덕션 출시)");

    const sourceCodes = sourceReleases.flatMap((r) => (r.versionCodes ?? []).map(Number));
    if (!sourceCodes.length) fail(`${opts.sourceTrack} 트랙에 승격할 릴리스가 없습니다.`);

    const versionCode = opts.versionCode ?? Math.max(...sourceCodes);
    if (!sourceCodes.includes(versionCode)) {
      fail(`versionCode ${versionCode} 는 ${opts.sourceTrack} 트랙에 없습니다: [${sourceCodes.join(",")}]`);
    }

    const alreadyLive = targetReleases.some((r) => (r.versionCodes ?? []).map(Number).includes(versionCode));
    if (alreadyLive) {
      console.log(`\n[play-promote] versionCode ${versionCode} 는 이미 ${TARGET_TRACK} 에 있습니다. 중단.`);
      return;
    }

    const sourceRelease = sourceReleases.find((r) => (r.versionCodes ?? []).map(Number).includes(versionCode));
    const inheritedNotes = sourceRelease?.releaseNotes ?? [];
    const releaseNotes = opts.notes
      ? [{ language: RELEASE_NOTE_LANGUAGE, text: opts.notes }]
      : inheritedNotes;

    const isFullRollout = opts.rollout >= FULL_ROLLOUT;
    const release = {
      versionCodes: [String(versionCode)],
      status: isFullRollout ? STATUS_COMPLETED : STATUS_IN_PROGRESS,
      ...(isFullRollout ? {} : { userFraction: opts.rollout }),
      ...(releaseNotes.length ? { releaseNotes } : {}),
    };

    console.log(`\n[계획] ${TARGET_TRACK} 트랙 릴리스`);
    console.log(`  versionCode : ${versionCode}`);
    console.log(`  status      : ${release.status}${isFullRollout ? " (100% 출시)" : ` (${opts.rollout * 100}% 단계적 출시)`}`);
    for (const note of releaseNotes) {
      const preview = String(note.text).replace(/\s*\n\s*/g, " / ").slice(0, NOTE_PREVIEW_LENGTH);
      console.log(`  notes[${note.language}] : ${preview}`);
    }
    if (!releaseNotes.length) console.log("  notes       : (없음)");

    if (!opts.commit) {
      console.log("\n[play-promote] DRY-RUN — 아무것도 변경하지 않았습니다. 실제 출시하려면 --commit 을 붙이세요.");
      return;
    }

    console.log(`\n[play-promote] ${TARGET_TRACK} 트랙 업데이트…`);
    await publisher.edits.tracks.update({
      packageName: PACKAGE_NAME,
      editId,
      track: TARGET_TRACK,
      requestBody: { track: TARGET_TRACK, releases: [release] },
    });

    console.log("[play-promote] validate…");
    await publisher.edits.validate({ packageName: PACKAGE_NAME, editId });

    console.log("[play-promote] commit…");
    await publisher.edits.commit({ packageName: PACKAGE_NAME, editId });
    committed = true;
    console.log(
      `[play-promote] ✅ versionCode ${versionCode} 를 ${TARGET_TRACK} 트랙에 제출했습니다. ` +
        "Play Console 에서 심사 상태를 확인하세요.",
    );
  } finally {
    if (!committed) {
      try {
        await publisher.edits.delete({ packageName: PACKAGE_NAME, editId });
        console.log("[play-promote] edit 세션 정리 완료 (변경사항 없음).");
      } catch {
        /* 정리 실패는 무시 — 미커밋 edit 은 자동 만료된다 */
      }
    }
  }
}

main().catch((err) => {
  const code = err?.code || err?.response?.status;
  const detail = err?.response?.data?.error?.message || err?.message || String(err);
  if (code === 401 || code === 403) {
    fail(
      `권한 오류(${code}): ${detail}\n` +
        "→ 서비스 계정에 '프로덕션 트랙에 출시' 권한이 있는지 확인하세요.\n" +
        "  (Play Console > 사용자 및 권한 > 서비스 계정 > 앱 권한 > 릴리스)",
    );
  }
  fail(`승격 실패(${code ?? "?"}): ${detail}`);
});
