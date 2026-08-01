/**
 * motivational_quotes_500_4languages.csv → lib/curatedQuotesSeed.{ko,en,es,zh}.ts 생성기.
 *
 * 실행: node scripts/gen-curated-quotes.mjs
 *
 * - CSV 는 한 행에 4개 언어가 함께 들어있고(id,주제,theme,한국어,English,Espanol,中文),
 *   앱은 언어별 풀로 분기하므로 언어마다 파일 하나씩 떨어뜨린다.
 * - 저자 없는 잠언이므로 author 는 넣지 않고 category 는 "wisdom" 으로 통일한다.
 * - 생성물은 커밋 대상. 문구를 고치려면 CSV 를 고치고 이 스크립트를 다시 돌린다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV_PATH = join(ROOT, "motivational_quotes_500_4languages.csv");

/** CSV 열 이름 → 생성 파일 정보. language 필드는 기존 시드 컨벤션(ko 외에는 "en")을 따른다. */
const TARGETS = [
  { column: "한국어", lang: "ko", seedLanguage: "ko", exportName: "CURATED_QUOTES_KO" },
  { column: "English", lang: "en", seedLanguage: "en", exportName: "CURATED_QUOTES_EN" },
  { column: "Espanol", lang: "es", seedLanguage: "en", exportName: "CURATED_QUOTES_ES" },
  { column: "中文", lang: "zh", seedLanguage: "en", exportName: "CURATED_QUOTES_ZH" },
];

const REQUIRED_COLUMNS = ["id", "주제", "theme", ...TARGETS.map((t) => t.column)];
/** 카드/위젯 레이아웃이 감당하는 한 줄 길이 상한 — 넘으면 생성 자체를 실패시킨다. */
const TEXT_MAX_LEN = 200;
const TEXT_MIN_LEN = 4;

/** RFC4180 최소 구현 — 따옴표 필드, 이스케이프된 따옴표(""), 필드 내 개행을 처리한다. */
function parseCsv(raw) {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** TS 문자열 리터럴로 안전하게 감싼다. */
function tsString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 중복 판정용 정규화 — 공백/문장부호 차이만 다른 문구를 같은 것으로 본다. */
function normalizeForDedupe(value) {
  return value.replace(/\s+/g, "").replace(/[.,!?;:'"“”‘’·…]/g, "").toLowerCase();
}

function buildFile(target, rows, headerIndex) {
  const textIdx = headerIndex[target.column];
  const themeKoIdx = headerIndex["주제"];
  const themeEnIdx = headerIndex["theme"];
  const idIdx = headerIndex["id"];

  const seen = new Map();
  const entries = [];
  const skipped = [];
  for (const row of rows) {
    const text = (row[textIdx] ?? "").trim();
    const rowId = (row[idIdx] ?? "").trim();
    if (text.length < TEXT_MIN_LEN) {
      skipped.push(`${rowId}: 빈 문구/너무 짧음`);
      continue;
    }
    if (text.length > TEXT_MAX_LEN) {
      throw new Error(`[${target.lang}] id=${rowId} 문구가 ${TEXT_MAX_LEN}자를 초과합니다 (${text.length}자).`);
    }
    const key = normalizeForDedupe(text);
    const dupOf = seen.get(key);
    if (dupOf) {
      skipped.push(`${rowId}: id=${dupOf} 와 중복`);
      continue;
    }
    seen.set(key, rowId);
    entries.push({
      id: `cu_${target.lang}_${String(rowId).padStart(3, "0")}`,
      text,
      themeKo: (row[themeKoIdx] ?? "").trim(),
      themeEn: (row[themeEnIdx] ?? "").trim(),
    });
  }

  const lines = [];
  lines.push("/**");
  lines.push(` * 자동 생성 파일 — 직접 수정하지 마세요.`);
  lines.push(` * 원본: motivational_quotes_500_4languages.csv ("${target.column}" 열)`);
  lines.push(` * 재생성: node scripts/gen-curated-quotes.mjs`);
  lines.push(" *");
  lines.push(" * 위인 어록이 아닌 무명(작자 미상) 잠언 풀. author 없이 category=\"wisdom\" 으로만 태깅된다.");
  lines.push(" */");
  lines.push(`import type { FamousQuoteSeed } from "@/lib/famousQuotesSeed";`);
  lines.push("");
  lines.push(`export const ${target.exportName}: ReadonlyArray<FamousQuoteSeed> = [`);
  let currentTheme = null;
  for (const e of entries) {
    if (e.themeEn !== currentTheme) {
      currentTheme = e.themeEn;
      lines.push(`  // ── ${e.themeKo} / ${e.themeEn} ─────────────────────────`);
    }
    lines.push(
      `  { id: ${tsString(e.id)}, text: ${tsString(e.text)}, category: "wisdom", language: ${tsString(
        target.seedLanguage,
      )} },`,
    );
  }
  lines.push("];");
  lines.push("");

  const outPath = join(ROOT, "lib", `curatedQuotesSeed.${target.lang}.ts`);
  writeFileSync(outPath, lines.join("\n"), "utf8");
  return { outPath, count: entries.length, skipped };
}

function main() {
  let raw;
  try {
    raw = readFileSync(CSV_PATH, "utf8");
  } catch (err) {
    console.error(`CSV 를 읽지 못했습니다: ${CSV_PATH}`);
    throw err;
  }

  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error("CSV 에 데이터 행이 없습니다.");
  const header = rows[0].map((h) => h.trim());
  const headerIndex = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const col of REQUIRED_COLUMNS) {
    if (!(col in headerIndex)) throw new Error(`CSV 헤더에 "${col}" 열이 없습니다. (실제: ${header.join(", ")})`);
  }

  const body = rows.slice(1);
  for (const target of TARGETS) {
    const { outPath, count, skipped } = buildFile(target, body, headerIndex);
    console.log(`✓ ${outPath.replace(ROOT, ".")} — ${count}건${skipped.length ? ` (제외 ${skipped.length}건)` : ""}`);
    for (const s of skipped) console.log(`   · ${s}`);
  }
}

try {
  main();
} catch (err) {
  console.error("생성 실패:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
