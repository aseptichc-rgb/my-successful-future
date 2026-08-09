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
      "Your future becomes what you believe. Daily affirmations from your future self.",
    keywords:
      "motivation,affirmations,daily quote,goals,habits,widget,self care,dream,mindset",
    whatsNew: "Minor improvements and a refreshed app description.",
    description: `What if there was an app that made your dreams come true?

Not by magic. By the oldest rule there is: you become what you believe.

Every great life you admire started the same way — as a belief someone refused to put down. Anima takes that belief and turns it into something you actually do every day, in about a minute.

■ You become what you believe
Your mind moves toward whatever you keep telling it. So tell it something worth becoming. Write down the person you're growing into, and every morning your future self speaks back to you — one line, written for the future you described.

■ See the power of affirmations for yourself
You don't have to take anyone's word for it. Write one affirmation a day for two weeks and notice how differently you walk into the day. That's the whole experiment, and you're the only proof you need.

■ You can be great too
Greatness isn't something you're born holding. It's built by people who kept believing on the ordinary days — the ones with no motivation and nobody watching. Anima is made for exactly those days.

■ Starting is the whole thing
Most dreams don't die from a lack of talent. They die because the first step never happens. So make today the first step, and make it small enough that you'll actually take it.

■ What's inside
· Daily affirmations & motivation — a line matched to the future you're building
· Personalized to you — shaped by the future self you describe and today's goals
· Real mentors, real words — from Seneca to modern voices, never a fabricated quote
· Daily intention writing — trace a short affirmation and set your mindset for the day
· Wins journal — note what went well today and give yourself the credit
· Calm by design — no ads, no tracking, no notification spam

■ Why Anima is different
· Zero ads, zero tracking — we never collect your advertising ID
· No fake quotes — only curated words from real people who actually said them
· One-time purchase, yours for life — no subscriptions, ever

Your dream doesn't need a perfect plan. It needs a first step, taken today.

Take it with Anima.`,
  },
  ko: {
    promotionalText:
      "나의 미래는 내가 믿는 대로 됩니다. 미래의 내가 오늘의 나에게 건네는, 매일 한 줄의 확언으로 하루를 시작하세요.",
    keywords:
      "동기부여,확언,다짐,명언,목표,습관,위젯,자기계발,꿈,성공,멘토,루틴,마인드셋,긍정,자존감",
    whatsNew: "앱 소개 문구를 새로 다듬고 소소한 개선을 했습니다.",
    description: `꿈을 이루어주는 앱이 있다면 어떨까요?

마법이 아닙니다. 가장 오래된 진리 하나 때문입니다 — 사람은 자신이 믿는 대로 됩니다.

당신이 우러러보는 모든 위대한 삶도 똑같이 시작됐습니다. 누군가 끝내 놓지 않은 하나의 믿음으로요. Anima는 그 믿음을 매일 1분, 당신이 실제로 하는 행동으로 바꿔 줍니다.

■ 믿는 대로 된다
마음은 당신이 되뇌는 쪽으로 움직입니다. 그러니 될 만한 가치가 있는 것을 들려주세요. 되어가고 싶은 사람을 적어두면, 매일 아침 미래의 당신이 답합니다 — 당신이 그려둔 미래를 위해 쓰인 단 한 줄로요.

■ 확언의 힘을 직접 확인하세요
누구의 말도 믿을 필요 없어요. 하루 한 줄씩 2주만 확언을 적어보고, 하루를 맞이하는 태도가 얼마나 달라지는지 느껴보세요. 그게 실험의 전부이고, 증거는 당신 자신이면 충분합니다.

■ 당신도 위대해질 수 있어요
위대함은 타고나는 것이 아닙니다. 의욕도 없고 아무도 보지 않는 평범한 날에도 계속 믿은 사람들이 쌓아 올린 것이죠. Anima는 바로 그런 날을 위해 만들어졌습니다.

■ 시작이 전부입니다
대부분의 꿈은 재능이 없어서 죽지 않습니다. 첫걸음을 떼지 않아서 죽습니다. 그러니 오늘을 첫걸음으로 삼되, 실제로 뗄 수 있을 만큼 작게 만드세요.

■ 이런 것들이 담겨 있어요
· 매일의 확언과 동기부여 — 당신이 만들어가는 미래에 맞춘 한 줄
· 나에게 맞춤 — 당신이 그린 미래의 나와 오늘의 목표를 반영
· 진짜 멘토, 진짜 말 — 세네카부터 현대의 목소리까지, 지어낸 명언은 없습니다
· 매일의 다짐 쓰기 — 짧은 확언을 따라 적으며 하루의 마음가짐을 다잡아요
· 잘한 일 기록 — 오늘 잘한 일을 적고 스스로를 인정해 주세요
· 조용한 설계 — 광고 없음, 추적 없음, 알림 폭탄 없음

■ Anima가 다른 이유
· 광고 0, 추적 0 — 광고 식별자를 절대 수집하지 않습니다
· 가짜 명언 없음 — 실제로 그 말을 한 사람들의 검증된 문장만
· 한 번 구매로 평생 — 구독은 영원히 없습니다

당신의 꿈에 완벽한 계획은 필요 없습니다. 필요한 건 오늘 뗀 첫걸음 하나입니다.

Anima와 함께 떼어보세요.`,
  },
  "es-ES": {
    promotionalText:
      "Tu futuro se convierte en lo que crees. Afirmaciones diarias de tu yo del futuro.",
    keywords:
      "motivación,afirmaciones,frase diaria,metas,hábitos,widget,sueño,mentalidad",
    whatsNew: "Pequeñas mejoras y descripción renovada.",
    description: `¿Y si hubiera una app que hiciera realidad tus sueños?

No por arte de magia. Por la regla más antigua que existe: te conviertes en lo que crees.

Cada gran vida que admiras empezó igual: como una creencia que alguien se negó a soltar. Anima toma esa creencia y la convierte en algo que de verdad haces cada día, en cerca de un minuto.

■ Te conviertes en lo que crees
La mente se mueve hacia aquello que le repites. Así que dile algo digno de llegar a ser. Escribe en quién te estás convirtiendo y, cada mañana, tu yo del futuro te responde: una línea, escrita para el futuro que describiste.

■ Comprueba tú mismo el poder de las afirmaciones
No tienes que creer en la palabra de nadie. Escribe una afirmación al día durante dos semanas y nota lo distinto que empiezas el día. Ese es todo el experimento, y tú eres la única prueba que necesitas.

■ Tú también puedes ser grande
La grandeza no es algo con lo que se nace. La construyen quienes siguieron creyendo en los días corrientes: esos sin motivación y sin nadie mirando. Anima está hecha justo para esos días.

■ Empezar lo es todo
La mayoría de los sueños no mueren por falta de talento. Mueren porque el primer paso nunca ocurre. Haz de hoy ese primer paso, y hazlo lo bastante pequeño como para darlo de verdad.

■ Qué incluye
· Afirmaciones y motivación diarias — una línea a la medida del futuro que construyes
· Personalizada para ti — según el yo del futuro que describes y tus metas de hoy
· Mentores reales, palabras reales — de Séneca a voces actuales, nunca una cita inventada
· Escritura de intención diaria — traza una afirmación breve y fija tu mentalidad del día
· Diario de logros — anota lo que salió bien hoy y date el crédito
· Calma por diseño — sin anuncios, sin rastreo, sin spam de notificaciones

■ Por qué Anima es diferente
· Cero anuncios, cero rastreo — nunca recopilamos tu identificador de publicidad
· Sin citas falsas — solo palabras curadas de personas reales que de verdad las dijeron
· Pago único, tuya de por vida — sin suscripciones, nunca

Tu sueño no necesita un plan perfecto. Necesita un primer paso, dado hoy.

Dalo con Anima.`,
  },
  "zh-Hans": {
    promotionalText:
      "你的未来，取决于你相信什么。来自未来自己的每日肯定语，让微小的重复终将成真。",
    keywords:
      "励志,正能量,每日金句,目标,习惯,小组件,自我提升,梦想,名言,成功,坚持,语录,心态,自律,打卡",
    whatsNew: "更新了应用介绍，并进行了小幅改进。",
    description: `如果有一款 App 能让你的梦想成真，会怎样？

不是靠魔法，而是靠最古老的一条法则：你相信什么，就会成为什么。

你所敬佩的每一段伟大人生，都始于同样的起点——一个有人始终不肯放下的信念。Anima 把那份信念，变成你每天真正会做的事，只需约一分钟。

■ 你相信什么，就会成为什么
心，会朝着你不断对它说的话前进。所以，告诉它值得成为的样子。写下你正在成为的那个人，每天清晨，未来的你都会回应你——一句为你描述的未来而写的话。

■ 亲自见证肯定语的力量
你不必听信任何人。每天写一句肯定语，坚持两周，感受自己迎接每一天的状态有多不同。这就是全部的实验，而你自己就是唯一需要的证据。

■ 你也可以了不起
了不起不是与生俱来的，而是由那些在平凡日子里——没有动力、也无人注视时——依然坚持相信的人一点点建成的。Anima 正是为那样的日子而生。

■ 开始，就是一切
大多数梦想不是因为缺乏才华而消亡，而是因为第一步始终没有迈出。所以，把今天当作第一步，并让它小到你真的会去做。

■ 内含什么
· 每日肯定语与激励——为你正在建构的未来量身写就的一句话
· 为你量身定制——依据你描述的未来自己与今天的目标
· 真实的导师，真实的话语——从塞内卡到当代的声音，绝无杜撰的名言
· 每日意图书写——描摹一句简短的肯定语，定下一天的心态
· 成就日记——记下今天做得好的事，给自己应得的肯定
· 以宁静为设计——无广告、无追踪、无通知轰炸

■ Anima 为何与众不同
· 零广告、零追踪——我们从不收集你的广告标识符
· 没有假名言——只有真实人物确实说过、经过甄选的话语
· 一次购买，终身拥有——永不订阅

你的梦想不需要完美的计划，只需要今天迈出的第一步。

与 Anima 一起，迈出这一步。`,
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
