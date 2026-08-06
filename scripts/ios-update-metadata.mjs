/**
 * App Store Connect — 스토어 문구(메타데이터)를 "꿈을 이루게 해주는 앱" 컨셉으로 갱신한다.
 *
 * 문구 원본: docs/app-store-metadata.md (4개 언어). 설명·키워드는 출시된 버전에서 수정할 수
 * 없으므로(Apple 정책) 편집 가능한 새 앱 버전을 만들어 스테이징하고, 심사 없이 즉시 반영되는
 * 프로모션 텍스트만 라이브 버전에 바로 적용한다.
 *
 * 하는 일:
 *   1) 편집 가능한 앱 버전이 없으면 새 버전(기본: 라이브 +1, 예 1.0.2)을 만든다.
 *   2) 그 버전에 en-US·ko·es-ES·zh-Hans 4개 로케일의 설명/키워드/프로모션/릴리스 노트/URL을
 *      업서트한다. (스크린샷이 없는 로케일은 기본 언어 스크린샷으로 자동 폴백된다.)
 *   3) 라이브 버전의 프로모션 텍스트를 새 문구로 즉시 갱신한다 (심사 불필요).
 *
 * 사용:
 *   node scripts/ios-update-metadata.mjs                  # 상태 점검 + 변경 계획만 (아무것도 안 바꿈)
 *   node scripts/ios-update-metadata.mjs --apply          # 실제 적용
 *   node scripts/ios-update-metadata.mjs --apply --version 1.0.2   # 새 버전 번호 지정
 *   node scripts/ios-update-metadata.mjs --apply --no-live-promo   # 라이브 프로모션 텍스트는 건드리지 않음
 *
 * 이후 절차: 새 버전 번호와 같은 마케팅 버전의 빌드를 업로드한 뒤
 *   node scripts/ios-appstore-submit.mjs --submit   ← 빌드를 붙여 심사 제출 (설명 변경도 함께 심사됨)
 *
 * 인증(App Store Connect API 키):
 *   ASC_API_KEY_PATH   (필수) AuthKey_XXXXXXXXXX.p8 파일 경로
 *   ASC_API_KEY_ID     (선택) 기본값 아래 DEFAULT_KEY_ID
 *   ASC_API_ISSUER_ID  (선택) 기본값 아래 DEFAULT_ISSUER_ID
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

// ─────────────────────────────── 상수 ───────────────────────────────
// makeToken/api 는 ios-appstore-submit.mjs 와 의도적 중복 — 이 저장소의 배포 스크립트는
// play-*.mjs 와 마찬가지로 파일 하나로 자기완결이 컨벤션이다.
const API = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "com.michaelkim.anima";
const PLATFORM = "IOS";

const DEFAULT_KEY_ID = "8ZJ3Y6N6J7";
const DEFAULT_ISSUER_ID = "daa5537d-77cb-44e3-904f-6df67f61ffde";

const JWT_TTL_SEC = 15 * 60;
const HTTP_TIMEOUT_MS = 60_000;
const VERSION_PAGE_LIMIT = 10;
const LOCALIZATION_PAGE_LIMIT = 50;
const NO_CONTENT = 204;
const PREVIEW_CHARS = 40;

/** Apple 필드별 글자 수 상한 — 초과분이 하나라도 있으면 API 호출 전에 REJECT 한다. */
const FIELD_LIMITS = {
  promotionalText: 170,
  keywords: 100,
  description: 4000,
  whatsNew: 4000,
};

const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

const LIVE_VERSION_STATES = new Set(["READY_FOR_DISTRIBUTION", "ACCEPTED"]);

const SUPPORT_URL = "https://my-successful-future.vercel.app";
const MARKETING_URL = "https://my-successful-future.vercel.app";

// ───────────────────── 문구 (docs/app-store-metadata.md) ─────────────────────

const COPY = {
  "en-US": {
    promotionalText:
      "The app that gets you to your dream. Write the dream you are going after, and Anima turns it into today's step — delivered to your home screen widget.",
    keywords:
      "motivation,affirmations,daily quote,goals,habits,widget,self care,dream,mindset",
    whatsNew: "Minor improvements and a refreshed app description.",
    description: `The app that helps you reach your dream.

Anima asks one thing: what dream are you going after? Write it down, and every morning you get today’s step toward it — plus the one line that pushes you to take it. No elaborate planner. Just the one line you need to start today.

■ Today’s line, drawn from your dream
Write a paragraph about the dream you’re chasing, and Anima builds a new card from it each day. The words you need most show up every morning.

■ Home screen widgets
Get your daily line on your iOS home screen — and a large widget on iPad. You’ll meet it naturally throughout the day without even opening the app.

■ Build streaks by rewriting your affirmations
Write down “the you who’s living the dream,” then retype it each day to grow a streak. Small repetitions become identity.

■ A one-line daily mission
Answer “I am ___” one line at a time and build the identity you’re reaching for, step by step.

■ Quote curation from mentors you choose
Pin a philosopher, founder, or leader you admire and their words arrive first. Leave it open and around eight mentors rotate automatically each week.

■ Log today’s small wins
However small, write down what went well today. Revisit it by date and watch your growth quietly add up.

■ Four languages
한국어 · English · Español · 中文 — both the app and your daily message appear in the language you choose.

Write your dream today. Tomorrow morning, your first step toward it arrives.

— Privacy
We don’t collect location, contacts, photos, or call logs.`,
  },
  ko: {
    promotionalText:
      "이루고 싶은 꿈을 한 줄 적으면 오늘 할 한 걸음이 정해집니다. 그 걸음을 밀어줄 한 마디가 매일 홈 화면 위젯으로 도착해요. 작은 반복이 꿈을 현실로 만듭니다.",
    keywords:
      "동기부여,확언,다짐,명언,목표,습관,위젯,자기계발,꿈,성공,멘토,루틴,마인드셋,긍정,자존감",
    whatsNew: "앱 소개 문구를 새로 다듬고 소소한 개선을 했습니다.",
    description: `당신의 꿈을 이루게 해주는 앱.

Anima는 이루고 싶은 꿈을 적어두면, 그 꿈에 다가가는 오늘의 한 걸음과 그 걸음을 밀어줄 한 마디를 매일 보내주는 앱입니다. 거창한 계획표가 아니라, 오늘 하루를 시작할 단 한 줄이면 충분해요.

■ 내 꿈에서 나온 오늘의 한 마디
이루고 싶은 꿈을 한 단락 적어두면, 그 꿈을 기준으로 매일 다른 카드가 만들어집니다. 매일 아침, 가장 필요한 말이 도착해요.

■ 홈 화면 위젯
한 마디를 매일 홈 화면 위젯으로 받아보세요. 앱을 열지 않아도 하루에 여러 번 자연스럽게 마주치게 됩니다. (iOS 홈 화면, iPad 대형 위젯 지원)

■ 다짐 따라 적기로 연속일 쌓기
‘꿈을 이룬 나’를 한 줄씩 적어두면, 매일 똑같이 따라 적으며 연속일(streak)을 쌓을 수 있어요. 작은 반복이 정체성이 됩니다.

■ 오늘의 한 줄 미션
“나는 ___” 한 줄에 답하며 되고 싶은 정체성을 한 걸음씩 쌓아가세요.

■ 명언 큐레이션
좋아하는 철학자·기업가·리더를 한 명 정해두면 그 인물의 명언이 우선 도착합니다. 비워두면 매주 8명 안팎의 멘토가 자동으로 바뀌어요.

■ 오늘 잘한 일 기록
아주 작은 일이어도 좋아요. 하루에 잘한 일을 적어두면 날짜별로 다시 볼 수 있어, 나도 모르게 쌓인 성장을 확인하게 됩니다.

■ 4개 언어 지원
한국어 · English · Español · 中文 — 앱 화면과 매일 도착하는 한 마디 모두 선택한 언어로 표시됩니다.

지금 이루고 싶은 꿈을 적어보세요. 내일 아침, 그 꿈에 다가가는 첫 한 걸음이 도착합니다.

— 개인정보 보호
위치·연락처·사진·통화 기록을 수집하지 않습니다.`,
  },
  "es-ES": {
    promotionalText:
      "La app que te lleva a tu sueño. Escribe el sueño que persigues y Anima lo convierte en el paso de hoy, directo al widget de tu pantalla de inicio.",
    keywords:
      "motivación,afirmaciones,frase diaria,metas,hábitos,widget,sueño,mentalidad",
    whatsNew: "Pequeñas mejoras y descripción renovada.",
    description: `La app que te lleva a tu sueño.

Anima te hace una sola pregunta: ¿qué sueño persigues? Escríbelo y cada mañana tendrás el paso de hoy hacia él, junto a la frase que te empuja a darlo. Sin agendas complicadas. Solo la frase que necesitas para empezar hoy.

■ La frase de hoy, sacada de tu sueño
Escribe un párrafo sobre el sueño que persigues y Anima crea cada día una tarjeta nueva a partir de él. Las palabras que más necesitas llegan cada mañana.

■ Widgets en pantalla de inicio
Recibe tu frase diaria en la pantalla de inicio de iOS y en un widget grande en iPad. La encontrarás de forma natural durante el día sin abrir la app.

■ Crea rachas reescribiendo tus afirmaciones
Escribe “el tú que ya vive el sueño” y vuelve a copiarlo cada día para sumar una racha. Las pequeñas repeticiones se convierten en identidad.

■ Una misión diaria de una línea
Responde “Yo soy ___” línea a línea y construye paso a paso la identidad que buscas.

■ Curaduría de frases con los referentes que elijas
Fija a un filósofo, fundador o líder que admires y sus frases llegarán primero. Déjalo abierto y cada semana rotarán automáticamente unos ocho referentes.

■ Registra tus pequeños logros de hoy
Por pequeño que sea, anota lo que hiciste bien hoy. Revísalo por fecha y observa cómo tu crecimiento se acumula sin darte cuenta.

■ Cuatro idiomas
한국어 · English · Español · 中文: tanto la app como tu mensaje diario aparecen en el idioma que elijas.

Escribe hoy tu sueño. Mañana por la mañana llegará tu primer paso hacia él.

— Privacidad
No recopilamos ubicación, contactos, fotos ni registros de llamadas.`,
  },
  "zh-Hans": {
    promotionalText:
      "帮你实现梦想的 App。写下你想实现的梦想，Anima 会把它变成今天要走的一步，直接送到主屏小组件。微小的重复，终将让梦想成真。",
    keywords:
      "励志,正能量,每日金句,目标,习惯,小组件,自我提升,梦想,名言,成功,坚持,语录,心态,自律,打卡",
    whatsNew: "更新了应用介绍，并进行了小幅改进。",
    description: `帮你实现梦想的 App。

Anima 只问你一件事：你想实现什么梦想？写下来，每天清晨就会收到通往它的今日一步，以及推你迈出那一步的一句话。不需要复杂的计划表，只要开启今天所需要的那一句话。

■ 从你的梦想里长出的今日一句
写下你想实现的梦想，Anima 每天都会据此生成一张全新的卡片，把你最需要的话送到每个清晨。

■ 主屏小组件
在 iOS 主屏上接收每日一句，iPad 还支持大尺寸小组件。不打开 App，也能在一天中自然地与它相遇。

■ 抄写誓言，累积连续打卡
写下“实现梦想的你”，每天照着抄写一遍，累积连续天数。微小的重复，终将成为你的身份。

■ 每日一句使命
逐行回答“我是 ___”，一步步塑造你想成为的身份。

■ 名人语录精选
选定一位你欣赏的哲学家、企业家或领袖，他的语录会优先送达。留空则每周自动轮换约八位导师。

■ 记录今天做得好的小事
再微小也没关系。写下今天做得好的事，按日期回看，你会发现成长在不知不觉中累积。

■ 支持四种语言
한국어 · English · Español · 中文 —— 应用界面与每日一句都会以你选择的语言显示。

现在就写下你的梦想。明天清晨，通往它的第一步就会送达。

— 隐私保护
我们不收集位置信息、通讯录、照片或通话记录。`,
  },
};

const log = (msg) => console.log(`[ios-metadata] ${msg}`);

function fail(msg) {
  console.error(`[ios-metadata] REJECT: ${msg}`);
  process.exit(1);
}

const maskId = (id) => (id && id.length > 4 ? `${id.slice(0, 4)}${"*".repeat(id.length - 4)}` : "****");

/** 글자 수는 코드포인트 기준 — 서로게이트 쌍(이모지 등)을 2자로 세는 오차를 막는다. */
const charLen = (s) => [...s].length;

const preview = (s) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return charLen(flat) > PREVIEW_CHARS ? `${[...flat].slice(0, PREVIEW_CHARS).join("")}…` : flat;
};

/** "1.0.1" → "1.0.2". 제안용일 뿐 --version 으로 언제든 덮어쓸 수 있다. */
function suggestNextVersion(current) {
  if (!current) return "1.0.1";
  const parts = current.split(".").map(Number);
  if (parts.some(Number.isNaN)) return "1.0.1";
  while (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

/** 모든 로케일 문구가 Apple 상한 이내인지 API 호출 전에 검증한다. */
function validateCopy() {
  for (const [locale, fields] of Object.entries(COPY)) {
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      const value = fields[field];
      if (typeof value !== "string" || !value.trim()) {
        fail(`${locale}.${field} 문구가 비어 있습니다.`);
      }
      if (charLen(value) > limit) {
        fail(`${locale}.${field} 가 상한 ${limit}자를 초과합니다 (현재 ${charLen(value)}자).`);
      }
    }
  }
}

// ─────────────────────────────── 인자 ───────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
function argValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

const opts = {
  apply: hasFlag("--apply"),
  versionString: argValue("--version"),
  updateLivePromo: !hasFlag("--no-live-promo"),
};

// ───────────────────────────── ASC 클라이언트 ─────────────────────────────

function makeToken(keyId, issuerId, keyPath) {
  let privateKey;
  try {
    privateKey = readFileSync(keyPath, "utf8");
  } catch (e) {
    fail(`.p8 키를 읽지 못했습니다 (${keyPath}): ${e.message}`);
  }
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = b64url({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = b64url({ iss: issuerId, iat: now, exp: now + JWT_TTL_SEC, aud: "appstoreconnect-v1" });
  const signingInput = `${header}.${payload}`;
  try {
    const signer = createSign("SHA256");
    signer.update(signingInput);
    // ASC 는 JOSE 형식(r||s 고정 64바이트) 서명을 요구한다. DER 이 아니다.
    const sig = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
    return `${signingInput}.${sig.toString("base64url")}`;
  } catch (e) {
    fail(`.p8 키로 JWT 서명에 실패했습니다 (키 형식이 EC P-256 이 맞는지 확인): ${e.message}`);
  }
}

let TOKEN = null;

async function api(method, path, body, { soft = false } = {}) {
  const url = path.startsWith("http") ? path : API + path;
  const bail = (msg) => {
    if (soft) return null;
    fail(msg);
  };

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch (e) {
    return bail(`네트워크 오류 (${method} ${path}): ${e.message}`);
  }

  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail =
        (parsed.errors || [])
          .map((err) => `${err.title}${err.detail ? ` — ${err.detail}` : ""}`)
          .join(" / ") || raw;
    } catch {
      /* 본문이 JSON 이 아니면 원문 그대로 노출한다. */
    }
    return bail(`API ${method} ${path} → ${res.status}: ${detail}`);
  }
  if (res.status === NO_CONTENT || !raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return bail(`API 응답을 JSON 으로 파싱하지 못했습니다 (${method} ${path}): ${e.message}`);
  }
}

// ─────────────────────────── 조회/변경 헬퍼 ───────────────────────────

async function fetchApp() {
  const res = await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`);
  const app = res.data?.[0];
  if (!app) fail(`번들 ID ${BUNDLE_ID} 인 앱을 찾지 못했습니다. API 키 권한/팀을 확인하세요.`);
  return app;
}

async function fetchVersions(appId) {
  const res = await api(
    "GET",
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=${PLATFORM}&limit=${VERSION_PAGE_LIMIT}`,
  );
  return (res.data || []).map((v) => ({
    id: v.id,
    versionString: v.attributes?.versionString,
    state: v.attributes?.appVersionState ?? v.attributes?.appStoreState,
  }));
}

async function fetchLocalizations(versionId) {
  const res = await api(
    "GET",
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=${LOCALIZATION_PAGE_LIMIT}`,
  );
  return (res.data || []).map((l) => ({
    id: l.id,
    locale: l.attributes?.locale,
    promotionalText: l.attributes?.promotionalText,
  }));
}

async function createVersion(appId, versionString) {
  const res = await api("POST", "/v1/appStoreVersions", {
    data: {
      type: "appStoreVersions",
      attributes: { platform: PLATFORM, versionString },
      relationships: { app: { data: { type: "apps", id: appId } } },
    },
  });
  return { id: res.data.id, versionString, state: res.data.attributes?.appVersionState };
}

/** 편집 버전의 로케일 문구를 업서트한다 — 있으면 PATCH, 없으면 POST. */
async function upsertLocalization(versionId, locale, existing) {
  const attributes = {
    ...COPY[locale],
    supportUrl: SUPPORT_URL,
    marketingUrl: MARKETING_URL,
  };
  if (existing) {
    await api("PATCH", `/v1/appStoreVersionLocalizations/${existing.id}`, {
      data: { type: "appStoreVersionLocalizations", id: existing.id, attributes },
    });
    log(`  · ${locale} 갱신 완료 — "${preview(attributes.description)}"`);
    return;
  }
  await api("POST", "/v1/appStoreVersionLocalizations", {
    data: {
      type: "appStoreVersionLocalizations",
      attributes: { ...attributes, locale },
      relationships: {
        appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
      },
    },
  });
  log(`  · ${locale} 신규 추가 — "${preview(attributes.description)}"`);
}

// ─────────────────────────────── 메인 ───────────────────────────────

async function main() {
  validateCopy();

  const keyPath = process.env.ASC_API_KEY_PATH;
  if (!keyPath) fail("ASC_API_KEY_PATH 환경변수에 .p8 키 파일 경로를 지정하세요.");
  const keyId = process.env.ASC_API_KEY_ID || DEFAULT_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID || DEFAULT_ISSUER_ID;
  TOKEN = makeToken(keyId, issuerId, keyPath);
  log(`인증: key ${maskId(keyId)} / issuer ${maskId(issuerId)}`);

  const app = await fetchApp();
  log(`앱: ${app.attributes?.name} (${BUNDLE_ID}) — id ${app.id}`);

  const versions = await fetchVersions(app.id);
  const liveVersion = versions.find((v) => LIVE_VERSION_STATES.has(v.state));
  let editableVersion = versions.find((v) => EDITABLE_VERSION_STATES.has(v.state));

  for (const v of versions) log(`버전: ${v.versionString} — ${v.state}`);

  const targetVersionString =
    opts.versionString ?? editableVersion?.versionString ?? suggestNextVersion(liveVersion?.versionString);

  if (!opts.apply) {
    log("── 변경 계획 (--apply 없이는 아무것도 바꾸지 않습니다) ──");
    if (editableVersion) {
      log(`편집 버전 ${editableVersion.versionString} 에 ${Object.keys(COPY).length}개 로케일 문구 업서트`);
    } else {
      log(`새 버전 ${targetVersionString} 생성 후 ${Object.keys(COPY).length}개 로케일 문구 업서트`);
    }
    if (opts.updateLivePromo && liveVersion) {
      log(`라이브 ${liveVersion.versionString} 프로모션 텍스트 즉시 갱신 (심사 불필요)`);
    }
    log("실행하려면: node scripts/ios-update-metadata.mjs --apply");
    return;
  }

  // 1) 편집 가능한 버전 확보
  if (!editableVersion) {
    editableVersion = await createVersion(app.id, targetVersionString);
    log(`새 앱 버전 생성: ${editableVersion.versionString} (${editableVersion.state})`);
  } else {
    log(`기존 편집 버전 사용: ${editableVersion.versionString} (${editableVersion.state})`);
  }

  // 2) 4개 로케일 문구 업서트
  const staged = await fetchLocalizations(editableVersion.id);
  const stagedByLocale = new Map(staged.map((l) => [l.locale, l]));
  log(`편집 버전 ${editableVersion.versionString} 문구 업데이트:`);
  for (const locale of Object.keys(COPY)) {
    await upsertLocalization(editableVersion.id, locale, stagedByLocale.get(locale));
  }

  // 3) 라이브 프로모션 텍스트 즉시 갱신
  if (opts.updateLivePromo && liveVersion) {
    const liveLocales = await fetchLocalizations(liveVersion.id);
    for (const loc of liveLocales) {
      const copy = COPY[loc.locale];
      if (!copy) {
        log(`라이브 ${loc.locale}: 준비된 문구가 없어 건너뜀`);
        continue;
      }
      if (loc.promotionalText === copy.promotionalText) {
        log(`라이브 ${loc.locale}: 프로모션 텍스트가 이미 최신`);
        continue;
      }
      const res = await api(
        "PATCH",
        `/v1/appStoreVersionLocalizations/${loc.id}`,
        {
          data: {
            type: "appStoreVersionLocalizations",
            id: loc.id,
            attributes: { promotionalText: copy.promotionalText },
          },
        },
        { soft: true },
      );
      if (res === null) {
        log(`라이브 ${loc.locale}: 프로모션 텍스트 갱신 실패 — 편집 버전 쪽 문구는 이미 반영됨`);
      } else {
        log(`라이브 ${loc.locale}: 프로모션 텍스트 즉시 갱신 완료 (심사 불필요)`);
      }
    }
  }

  log("── 완료 ──");
  log(`남은 절차: 마케팅 버전 ${editableVersion.versionString} 빌드를 업로드한 뒤`);
  log("  node scripts/ios-appstore-submit.mjs --submit   ← 빌드 첨부 + 심사 제출");
}

main().catch((e) => fail(`예상치 못한 오류: ${e.stack || e.message}`));
