/**
 * OG 이미지 생성기 — `public/anima_og.png` (1200×630) 를 만든다. `npm run og:gen`
 *
 * 왜 있나: 이 사이트는 og:image 가 없어서 링크를 어디에 붙이든(Meta 광고 링크 미리보기,
 * 카카오, 슬랙, iMessage) 썸네일이 빈 회색 상자로 나왔다. 스크래퍼는 이미지가 없으면
 * 대체물을 만들어주지 않는다 — 파일이 실제로 있어야 한다.
 *
 * 왜 next/og(ImageResponse) 가 아니라 정적 PNG 인가:
 *  1) 한글 본문이라 ImageResponse 는 Noto Serif KR woff 를 런타임에 임베드해야 하는데,
 *     서브셋되지 않은 한글 폰트는 수 MB 라 엣지 번들에 얹기 부담스럽다.
 *  2) 스크래퍼(특히 Meta)는 og:image 를 공격적으로 캐싱하므로 매 요청 렌더가 무의미하다.
 *  3) 카피가 바뀔 때만 다시 뽑으면 되는 자산이다 — 빌드 경로에 둘 이유가 없다.
 *
 * 디자인은 "Instagram Ads KO v4 (standalone).html" 의 보드와 같은 골격이다(같은 팔레트·
 * 서체·마크). 광고 크리에이티브와 링크 썸네일이 한 화면에 같이 뜨므로 따로 놀면 안 된다.
 *
 * ⚠ 조용한 실패 금지 — 2026-08-15 에 보드 PNG 내보내기가 실패했는데도 성공처럼 끝난
 * 사고가 있었다(3600acb). 그래서 이 스크립트는 웹폰트 적용·안전폭·출력 크기를 실측하고
 * 하나라도 어긋나면 REJECT 로 죽는다. 깨진 이미지를 배포하느니 빌드가 실패하는 게 낫다.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "public", "anima_og.png");

/* ── 캔버스 ─────────────────────────────────────────────────────
   1200×630 은 OG 권장 규격(1.91:1). Meta·X·카카오·슬랙이 공통으로 받는 최대공약수라
   이 하나로 전부 커버한다. 더 키워도 스크래퍼가 어차피 이 폭으로 리샘플한다. */
const CANVAS_W = 1200;
const CANVAS_H = 630;
const PAD_X = 80;
const PAD_Y = 72;

/** 헤드라인이 넘으면 안 되는 폭. 보드 파이프라인의 '안전폭' 검사와 같은 규율이다. */
const SAFE_W = CANVAS_W - PAD_X * 2;

/** 웹폰트 로딩 대기 상한(ms). CDN 이 죽었을 때 무한 대기 대신 REJECT 로 떨어뜨린다. */
const FONT_TIMEOUT_MS = 20_000;

/** 정상 렌더의 최소 파일 크기(bytes). 이보다 작으면 빈 캔버스를 뽑은 것이다. */
const MIN_PNG_BYTES = 10_000;

/* ── 팔레트 — 보드와 동일 상수 ───────────────────────────────── */
const CREAM = "#F7F3EC";
const GOLD = "#D9A441";
const SOUL = "#D85A30";
const MARK_STROKE = "#E7C77A";

/* ── 카피 ───────────────────────────────────────────────────────
   app/layout.tsx 의 description 과 같은 약속을 말한다 — 썸네일과 <meta> 가 다른 말을
   하면 스크래퍼 미리보기 안에서 두 문장이 서로 어긋나 보인다. 카피를 고칠 땐 둘 다.

   헤드라인 한 줄 + deck 한 줄 구성이다. 헤드라인은 독자가 얻는 것(그 꿈에 다가섬)을,
   deck 은 그것이 왜 되는지(반복)를 말한다 — 약속과 근거가 한 몸이라 한쪽만 고치지 말 것. */
export const HEADLINE_LINES = [{ text: "그 꿈에 한 걸음 다가섭니다.", accent: "한 걸음" }];
export const DECK = "위대함은 매일의 작은 행동의 반복입니다.";

/* 헤드라인이 한 줄이라 두 줄일 때(68px)보다 키울 수 있다. 썸네일은 피드에서 500px 안팎으로
   줄어들므로 큰 글자가 이긴다. 상한은 안전폭 — 넘기면 렌더 때 REJECT 로 잡힌다. */
const HEADLINE_FS = 78;
const DECK_FS = 28;

/**
 * 브랜드 마크(조리개) SVG. 보드의 apertureSVG() 와 같은 기하 — 값이 갈리면 두 자산의
 * 로고가 미묘하게 달라지므로 형태를 바꿀 일이 생기면 양쪽을 같이 고칠 것.
 */
export function apertureSVG(size, stroke = MARK_STROKE, dot = SOUL, sw = 7) {
  const CX = 50;
  const CY = 50;
  const R = 42;
  const GAP_DEG = 16;
  const polar = (rr, deg) => {
    const rad = (deg * Math.PI) / 180;
    return [CX + rr * Math.cos(rad), CY + rr * Math.sin(rad)];
  };
  const s = polar(R, -90 + GAP_DEG / 2);
  const e = polar(R, -90 - GAP_DEG / 2 + 360);
  const dotR = Math.max(6, sw * 1.25);
  return (
    `<svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" ` +
    `xmlns="http://www.w3.org/2000/svg" style="display:block">` +
    `<path d="M ${s[0].toFixed(2)} ${s[1].toFixed(2)} A ${R} ${R} 0 1 1 ` +
    `${e[0].toFixed(2)} ${e[1].toFixed(2)}" stroke="${stroke}" stroke-width="${sw}" ` +
    `stroke-linecap="round"/>` +
    `<circle cx="${CX}" cy="${CY}" r="${dotR}" fill="${dot}"/></svg>`
  );
}

/** 강조어를 <em> 으로 감싼다. 강조어가 없거나 줄에 없으면 원문 그대로 — 조용히 흘린다. */
export function markAccent(text, accent) {
  if (!accent || !text.includes(accent)) return text;
  return text.replace(accent, `<em>${accent}</em>`);
}

export function buildHTML() {
  const lines = HEADLINE_LINES.map(
    (l) => `<div class="hl-line">${markAccent(l.text, l.accent)}</div>`,
  ).join("");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" crossorigin="anonymous"
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300&family=Noto+Serif+KR:wght@200;300;600&display=swap">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:${CANVAS_W}px;height:${CANVAS_H}px;overflow:hidden;background:#0E0D12;}
  /* 보드(.ad)와 같은 배경 그라데이션 — 위에서 아래로 열리는 어둠이 이 브랜드의 바닥이다. */
  .og{
    position:relative;width:${CANVAS_W}px;height:${CANVAS_H}px;
    padding:${PAD_Y}px ${PAD_X}px;
    display:flex;flex-direction:column;
    color:${CREAM};
    background:radial-gradient(120% 90% at 50% 0%,#26232E 0%,#16141A 46%,#0E0D12 100%);
  }
  .og>*{flex:none;}
  .lockup{display:flex;align-items:center;gap:12px;}
  .wm{font-family:'Fraunces','Times New Roman',serif;font-weight:300;font-size:34px;
      letter-spacing:-.02em;line-height:1;color:${CREAM};}
  .band{margin:auto 0;}
  .hl-line{font-family:'Noto Serif KR','Apple SD Gothic Neo',serif;font-weight:200;
           font-size:${HEADLINE_FS}px;letter-spacing:-.02em;line-height:1.28;color:${CREAM};
           word-break:keep-all;white-space:nowrap;}
  /* 금색 강조는 판 전체에 정확히 한 곳 — 여러 곳이면 시선이 갈라져 아무 데도 안 간다. */
  .hl-line em{font-style:normal;font-weight:600;color:${GOLD};}
  .deck{font-family:'Noto Serif KR','Apple SD Gothic Neo',serif;font-weight:300;
        font-size:${DECK_FS}px;line-height:1.4;color:rgba(247,243,236,.58);
        word-break:keep-all;white-space:nowrap;margin-top:32px;}
</style>
</head>
<body>
  <div class="og">
    <div class="lockup"><span class="mk">${apertureSVG(34)}</span><span class="wm">anima</span></div>
    <div class="band">
      <div class="hl">${lines}</div>
      <div class="deck">${DECK}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 페이지 안에서 실측한다. 브라우저 컨텍스트로 넘어가는 함수라 바깥 상수를 못 쓴다 —
 * 필요한 값은 인자로 넘긴다.
 * @returns {{fontsOK:boolean, widest:number, overflowY:number, missing:string[]}}
 */
export function measurePage(safeW) {
  const FAMILIES = ["Fraunces", "Noto Serif KR"];
  const missing = FAMILIES.filter((f) => !document.fonts.check(`16px "${f}"`));
  // 블록 요소의 getBoundingClientRect() 는 컨테이너 폭을 돌려준다(글자 폭이 아니다).
  // Range 로 자식 텍스트만 감싸야 실제 글자 폭이 나온다 — 이걸 틀리면 안전폭 검사가
  // 항상 통과하는 무의미한 검사가 되고, nowrap + overflow:hidden 이라 넘친 글자는
  // 경고 없이 잘려 나간다.
  const textWidth = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return Math.ceil(range.getBoundingClientRect().width);
  };
  const nodes = [...document.querySelectorAll(".hl-line, .deck, .wm")];
  const widest = Math.max(0, ...nodes.map(textWidth));
  const root = document.querySelector(".og");
  return {
    fontsOK: missing.length === 0,
    missing,
    widest,
    overflowY: Math.max(0, root.scrollHeight - root.clientHeight),
    safeW,
  };
}

async function render() {
  // playwright 는 devDependency 다 — 없는 환경(운영 빌드)에서 import 만으로 죽지 않게 지연 로딩.
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "playwright 를 불러오지 못했습니다. `npm i` 후 `npx playwright install chromium` 을 실행하세요.",
    );
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS_W, height: CANVAS_H },
      deviceScaleFactor: 1,
    });
    await page.setContent(buildHTML(), { waitUntil: "networkidle" });

    // 웹폰트가 붙기 전에 찍으면 폴백 세리프로 렌더된 '비슷하지만 다른' 이미지가 나온다.
    await page.waitForFunction(() => document.fonts.status === "loaded", null, {
      timeout: FONT_TIMEOUT_MS,
    });

    const m = await page.evaluate(measurePage, SAFE_W);
    if (!m.fontsOK) {
      throw new Error(`REJECT: 웹폰트 미적용 — ${m.missing.join(", ")} (CDN 차단/오프라인?)`);
    }
    if (m.widest > SAFE_W) {
      throw new Error(
        `REJECT: 안전폭 초과 — 최장 줄 ${m.widest}px > ${SAFE_W}px. 카피를 줄이거나 font-size 를 낮추세요.`,
      );
    }
    if (m.overflowY > 0) {
      throw new Error(`REJECT: 세로 넘침 ${m.overflowY}px. 줄 수나 여백을 줄이세요.`);
    }

    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: CANVAS_W, height: CANVAS_H },
    });
    return { buf, measured: m };
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    const { buf, measured } = await render();
    if (buf.length < MIN_PNG_BYTES) {
      throw new Error(`REJECT: PNG 가 ${buf.length}B 로 너무 작습니다 — 빈 캔버스를 찍었습니다.`);
    }
    await mkdir(dirname(OUT_PATH), { recursive: true });
    await writeFile(OUT_PATH, buf);

    const written = await stat(OUT_PATH);
    // 경로는 OUT_PATH 에서 뽑는다 — 하드코딩하면 파일명을 바꿨을 때 로그만 옛 이름을 말한다.
    const rel = OUT_PATH.slice(ROOT.length + 1).replace(/\\/g, "/");
    console.log(`✓ ${rel} — ${CANVAS_W}×${CANVAS_H}, ${(written.size / 1024).toFixed(1)}KB`);
    console.log(`  안전폭 최장 줄 ${measured.widest}px / ${SAFE_W}px · 세로 넘침 0`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

// 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
