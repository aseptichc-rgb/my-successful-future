/**
 * App Store Connect — 스토어 문안(이름·부제·설명·키워드·프로모션·릴리스 노트)을 이 파일의
 * COPY 기준으로 맞춘다.
 *
 * ★ 문안의 단일 원본은 이 파일이다. 문구를 고칠 땐 여기만 고치고 `--apply` 로 스테이징한다.
 *   [docs/app-store-metadata.md] 에는 스크립트가 만질 수 없는 설정(스크린샷·판매 지역·
 *   App Privacy·카테고리) 체크리스트만 둔다 — 문서에 문안을 복제하지 않는다.
 *   (2026-09-24 이전에는 문서 세 벌과 스크립트가 서로 달라 어느 것이 라이브인지 알 수 없었다.)
 *
 * 로케일 6종: en-US · ko · es-ES · es-MX · zh-Hans · zh-Hant
 *   - es-MX  멕시코·중남미 스토어프론트. 미국 스토어프론트에서도 es-MX 키워드가 함께 색인되므로
 *            키워드만 es-ES 와 다르게 두고 나머지 문안은 es-ES 를 공유한다.
 *   - zh-Hant 대만·홍콩·마카오 — 구글 로그인·Gemini 가 정상 동작하는 중화권. 앱 UI 는 아직
 *            간체뿐이라 설명에 그 사실을 명시한다.
 *
 * 하는 일:
 *   1) 편집 가능한 앱 버전이 없으면 새 버전(기본: 라이브 +1, 예 1.0.6)을 만든다.
 *   2) 편집 가능한 앱 정보(appInfo)의 로케일별 이름·부제·개인정보 URL 을 업서트한다.
 *      이름·부제는 검색 가중치가 가장 높은 필드이며, 다음 심사와 함께 반영된다.
 *   3) 편집 버전에 6개 로케일의 설명/키워드/프로모션/릴리스 노트/URL 을 업서트한다.
 *      (스크린샷이 없는 로케일은 기본 언어 스크린샷으로 폴백된다 — 점검 출력의 스크린샷 줄 참고.)
 *   4) 라이브 버전의 프로모션 텍스트를 새 문구로 즉시 갱신한다 (심사 불필요).
 *
 *   --apply 없이 실행하면 위 계획과 함께 읽기 전용 점검을 출력한다:
 *   기본 언어(primaryLocale) · 로케일별 스크린샷 수 · 중국 본토 판매 여부.
 *
 * 사용:
 *   node scripts/ios-update-metadata.mjs                  # 상태 점검 + 변경 계획만 (아무것도 안 바꿈)
 *   node scripts/ios-update-metadata.mjs --apply          # 실제 적용
 *   node scripts/ios-update-metadata.mjs --apply --version 1.0.6   # 새 버전 번호 지정
 *   node scripts/ios-update-metadata.mjs --apply --no-live-promo   # 라이브 프로모션 텍스트는 건드리지 않음
 *
 * 이후 절차: 새 버전 번호와 같은 마케팅 버전의 빌드를 업로드한 뒤
 *   node scripts/ios-appstore-submit.mjs --submit   ← 빌드를 붙여 심사 제출 (문안 변경도 함께 심사됨)
 *
 * 인증(App Store Connect API 키):
 *   ASC_API_KEY_PATH   (필수) AuthKey_XXXXXXXXXX.p8 파일 경로
 *   ASC_API_KEY_ID     (선택) 기본값 아래 DEFAULT_KEY_ID
 *   ASC_API_ISSUER_ID  (선택) 기본값 아래 DEFAULT_ISSUER_ID
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { pathToFileURL } from "node:url";

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
const SCREENSHOT_SET_PAGE_LIMIT = 20;
const TERRITORY_PAGE_LIMIT = 200;
const NO_CONTENT = 204;
const PREVIEW_CHARS = 40;

/** ASC 판매 지역 코드 — 중국 본토. 구글 로그인·Gemini·Vercel 이 모두 차단되는 지역이다. */
const CHINA_MAINLAND_TERRITORY = "CHN";

/** Apple 필드별 글자 수 상한 — 초과분이 하나라도 있으면 API 호출 전에 REJECT 한다. */
export const FIELD_LIMITS = Object.freeze({
  name: 30,
  subtitle: 30,
  promotionalText: 170,
  keywords: 100,
  description: 4000,
  whatsNew: 4000,
});

/** 앱 정보(appInfoLocalizations) 쪽 필드 — 이름·부제는 버전이 아니라 앱 정보에 붙는다. */
const APP_INFO_FIELDS = ["name", "subtitle"];
/** 버전(appStoreVersionLocalizations) 쪽 필드. */
const VERSION_FIELDS = ["promotionalText", "keywords", "whatsNew", "description"];

/** 버전·앱 정보 공통 — 이 상태일 때만 문안을 고칠 수 있다. */
const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

const LIVE_VERSION_STATES = new Set(["READY_FOR_DISTRIBUTION", "ACCEPTED"]);

const APP_URL = "https://my-successful-future.vercel.app";
const MARKETING_URL = APP_URL;
const PRIVACY_URL = `${APP_URL}/privacy`;
/** 4개 언어 고객지원 페이지([app/support/page.tsx]). 랜딩(/)은 한국어 전용이라 지원 URL 로 부적합. */
const SUPPORT_PATH = "/support";

/** ASC 로케일 → 앱 언어 코드(lib/i18n SUPPORTED_LOCALES). 지원 URL 의 ?lang= 에 쓴다. */
const APP_LANG_BY_LOCALE = Object.freeze({
  "en-US": "en",
  ko: "ko",
  "es-ES": "es",
  "es-MX": "es",
  "zh-Hans": "zh",
  "zh-Hant": "zh",
});

/** 로케일별 지원 URL — 해당 언어 섹션이 바로 열리게 ?lang= 을 붙인다. */
export function supportUrlFor(locale) {
  const lang = APP_LANG_BY_LOCALE[locale];
  if (!lang) throw new Error(`지원 URL 언어 매핑이 없는 로케일: ${locale}`);
  return `${APP_URL}${SUPPORT_PATH}?lang=${lang}`;
}

// ─────────────────────────────── 문안 ───────────────────────────────
// 규칙 (collectCopyProblems 가 강제):
//   · 이름·부제 30자, 프로모션 170자, 키워드 100자, 설명·릴리스 노트 4000자 이내
//   · 키워드는 공백 없이 쉼표로만 — 공백은 글자 낭비이고 구(句)는 어차피 단어별로 색인된다
//   · 이름·부제에 이미 들어간 단어는 키워드에 넣지 않는다 — 중복 색인이라 100자를 버리는 셈
//   · 릴리스 노트의 탭 이름은 앱 사전(lib/i18n/dictionaries)의 nav.* 와 같아야 한다 (테스트가 검사)

const COPY_EN = {
  name: "Anima: Daily Affirmations",
  subtitle: "Motivation quotes & widget",
  promotionalText:
    "Your future becomes what you believe. One line a day from your future self, on your home screen widget. Free to start, no subscriptions.",
  keywords:
    "manifestation,positive,mindset,goals,habits,gratitude,journal,selfcare,morning,routine,vision,calm",
  whatsNew:
    "A fresh new layout: everything now lives in four tabs — Today, My Dream, Journal, and Growth — so what you need is always one tap away. Your widget now switches to a fresh daily quote at midnight — even when you don't open the app. Morning notifications now carry each day's quote. Plus small improvements.",
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
· Home & lock screen widget — today's line without opening the app, refreshed every midnight
· Real mentors, real words — from Seneca to modern voices, never a fabricated quote
· Daily affirmation check-in — retype a short affirmation each morning and set your mindset for the day
· Wins journal — note what went well today and give yourself the credit
· Fully localized — English, 한국어, Español and 中文, in the app and in every daily line
· Calm by design — no ads, no tracking, no notification spam

■ Why Anima is different
· Zero ads, zero tracking — we never collect your advertising ID
· No fake quotes — only curated words from real people who actually said them
· Free to start — one purchase unlocks Anima Pro for life. No subscriptions, ever

Your dream doesn't need a perfect plan. It needs a first step, taken today.

Take it with Anima.`,
};

const COPY_KO = {
  // 이름·부제는 2026-09-23 기준 ASC 에 올라가 있는 값 그대로 (docs/play-store-aso.md 정합성 메모).
  name: "Anima — 꿈을 이루는 하루",
  subtitle: "매일 한 걸음, 꿈에 다가가기",
  promotionalText:
    "나의 미래는 내가 믿는 대로 됩니다. 미래의 내가 오늘의 나에게 건네는, 매일 한 줄의 확언으로 하루를 시작하세요.",
  // "꿈" 은 이름에 이미 있어 키워드에서 뺐다 (중복 색인). 그 자리에 검색량 있는 "긍정확언".
  keywords:
    "동기부여,확언,다짐,명언,목표,습관,위젯,자기계발,긍정확언,성공,멘토,루틴,마인드셋,긍정,자존감",
  whatsNew:
    "화면 구성이 새로워졌어요: 오늘 · 내 꿈 · 기록 · 성장 네 개의 탭으로 정리되어, 필요한 화면에 한 번에 닿습니다. 위젯은 자정마다 그날의 새 명언으로 자동 교체됩니다 — 앱을 열지 않아도요. 아침 알림에도 매일 그날의 명언이 실립니다. 소소한 개선도 함께 했습니다.",
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
· 홈·잠금화면 위젯 — 앱을 열지 않아도 오늘의 한 줄이 보이고, 매일 자정 자동으로 바뀝니다
· 진짜 멘토, 진짜 말 — 세네카부터 현대의 목소리까지, 지어낸 명언은 없습니다
· 매일의 다짐 쓰기 — 짧은 확언을 따라 적으며 하루의 마음가짐을 다잡아요
· 잘한 일 기록 — 오늘 잘한 일을 적고 스스로를 인정해 주세요
· 4개 언어 지원 — 한국어 · English · Español · 中文, 앱 화면과 매일의 한 줄 모두
· 조용한 설계 — 광고 없음, 추적 없음, 알림 폭탄 없음

■ Anima가 다른 이유
· 광고 0, 추적 0 — 광고 식별자를 절대 수집하지 않습니다
· 가짜 명언 없음 — 실제로 그 말을 한 사람들의 검증된 문장만
· 무료로 시작 — 한 번 구매로 Anima Pro 를 평생. 구독은 영원히 없습니다

당신의 꿈에 완벽한 계획은 필요 없습니다. 필요한 건 오늘 뗀 첫걸음 하나입니다.

Anima와 함께 떼어보세요.`,
};

const COPY_ES = {
  name: "Anima: Afirmaciones diarias",
  subtitle: "Frases motivadoras y widget",
  promotionalText:
    "Tu futuro se convierte en lo que crees. Una frase al día de tu yo del futuro, en el widget de tu pantalla de inicio. Empieza gratis, sin suscripciones.",
  // "sueño" 는 수면 앱 검색과 겹쳐 뺐다. 성별 중립 표현 유지.
  keywords:
    "motivación,positivas,metas,hábitos,mentalidad,éxito,autoestima,gratitud,diario,propósito,manifestar",
  whatsNew:
    "Un diseño renovado: todo vive ahora en cuatro pestañas — Hoy, Mi sueño, Diario y Crecimiento — para que lo que necesitas esté a un toque. El widget ahora cambia a una nueva frase cada día a medianoche, incluso sin abrir la app. Las notificaciones de la mañana ahora incluyen la frase de cada día. Además, pequeñas mejoras.",
  description: `¿Y si hubiera una app que hiciera realidad tus sueños?

No por arte de magia. Por la regla más antigua que existe: te conviertes en lo que crees.

Cada gran vida que admiras empezó igual: como una creencia que alguien se negó a soltar. Anima toma esa creencia y la convierte en algo que de verdad haces cada día, en cerca de un minuto.

■ Te conviertes en lo que crees
La mente se mueve hacia aquello que le repites. Así que dile algo digno de llegar a ser. Escribe en quién te estás convirtiendo y, cada mañana, tu yo del futuro te responde: una línea, escrita para el futuro que describiste.

■ Comprueba en primera persona el poder de las afirmaciones
No tienes que creer en la palabra de nadie. Escribe una afirmación al día durante dos semanas y nota lo distinto que empiezas el día. Ese es todo el experimento, y la única prueba que necesitas eres tú.

■ Tú también puedes ser grande
La grandeza no es algo con lo que se nace. La construyen quienes siguieron creyendo en los días corrientes: esos sin motivación y sin nadie mirando. Anima está hecha justo para esos días.

■ Empezar lo es todo
La mayoría de los sueños no mueren por falta de talento. Mueren porque el primer paso nunca ocurre. Haz de hoy ese primer paso, y hazlo lo bastante pequeño como para darlo de verdad.

■ Qué incluye
· Afirmaciones y motivación diarias — una línea a la medida del futuro que construyes
· Personalizada para ti — según el yo del futuro que describes y tus metas de hoy
· Widget en la pantalla de inicio y de bloqueo — la frase de hoy sin abrir la app, renovada cada medianoche
· Mentores reales, palabras reales — de Séneca a voces actuales, nunca una cita inventada
· Afirmación diaria — reescribe una frase breve cada mañana y fija tu mentalidad del día
· Diario de logros — anota lo que salió bien hoy y date el crédito
· Totalmente traducida — Español, English, 한국어 y 中文, tanto la app como la frase de cada día
· Calma por diseño — sin anuncios, sin rastreo, sin spam de notificaciones

■ Por qué Anima es diferente
· Cero anuncios, cero rastreo — nunca recopilamos tu identificador de publicidad
· Sin citas falsas — solo palabras curadas de personas reales que de verdad las dijeron
· Empieza gratis — una sola compra desbloquea Anima Pro de por vida. Sin suscripciones, nunca

Tu sueño no necesita un plan perfecto. Necesita un primer paso, dado hoy.

Dalo con Anima.`,
};

const COPY_ZH_HANS = {
  name: "Anima：每日肯定语",
  subtitle: "未来的你写给今天的一句话·主屏小组件",
  promotionalText:
    "你的未来，取决于你相信什么。来自未来自己的每日一句，直接送到主屏小组件。免费开始，无需订阅。",
  // "肯定语·小组件" 은 이름·부제에 있어 뺐다. 중화권 검색량이 큰 显化·吸引力法则·自我肯定·早安·日签 추가.
  keywords:
    "励志,正能量,每日金句,目标,习惯,自我提升,梦想,名言,成功,坚持,语录,心态,自律,打卡,显化,吸引力法则,自我肯定,自信,早安,日签,格言,成长,冥想,鸡汤",
  whatsNew:
    "全新界面布局：内容整理为「今天 · 我的梦想 · 记录 · 成长」四个标签页，想去的页面一键直达。小组件现在会在每天午夜自动换上当天的新名言——即使不打开应用。晨间通知也会带上每天的名言。另有若干小改进。",
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

■ 功能一览
· 每日肯定语与激励——为你正在建构的未来量身写就的一句话
· 为你量身定制——依据你描述的未来自己与今天的目标
· 主屏与锁屏小组件——不打开 App 也能看到今日一句，每天午夜自动更新
· 真实的导师，真实的话语——从塞内卡到当代的声音，绝无杜撰的名言
· 每日肯定语抄写——抄写一句简短的肯定语，定下一天的心态
· 好事记录——记下今天做得好的事，给自己应得的肯定
· 完整本地化——简体中文、English、한국어、Español，界面与每日一句都用你选择的语言
· 安静的设计——无广告、无追踪、无通知轰炸

■ Anima 为何与众不同
· 零广告、零追踪——我们从不收集你的广告标识符
· 没有假名言——只有真实人物确实说过、经过甄选的话语
· 免费开始——一次买断即可终身解锁 Anima Pro，永不订阅

你的梦想不需要完美的计划，只需要今天迈出的第一步。

与 Anima 一起，迈出这一步。`,
};

// 대만 Apple 용어: 小工具(widget) · 主畫面(home screen) · 鎖定畫面(lock screen).
const COPY_ZH_HANT = {
  name: "Anima：每日肯定語",
  subtitle: "未來的你寫給今天的一句話・主畫面小工具",
  promotionalText:
    "你的未來，取決於你相信什麼。來自未來自己的每日一句，直接送到主畫面小工具。免費開始，無需訂閱。",
  keywords:
    "勵志,正能量,每日金句,目標,習慣,自我成長,夢想,名言,成功,堅持,語錄,心態,自律,打卡,顯化,吸引力法則,自我肯定,自信,早安,格言,冥想,正向,療癒,座右銘",
  // 탭 이름은 앱 UI(간체)의 번체 표기 — 「今天・我的夢想・記錄・成長」.
  whatsNew:
    "全新介面配置：內容整理為「今天・我的夢想・記錄・成長」四個分頁，想去的頁面一鍵直達。小工具現在會在每天午夜自動換上當天的新名言——即使不打開 App。晨間通知也會附上每天的名言。另有若干小改進。",
  description: `如果有一款 App 能讓你的夢想成真，會怎麼樣？

不是靠魔法，而是靠最古老的一條法則：你相信什麼，就會成為什麼。

你所敬佩的每一段偉大人生，都始於同樣的起點——一個有人始終不肯放下的信念。Anima 把那份信念，變成你每天真正會做的事，只需大約一分鐘。

■ 你相信什麼，就會成為什麼
心，會朝著你不斷對它說的話前進。所以，告訴它值得成為的樣子。寫下你正在成為的那個人，每天清晨，未來的你都會回應你——一句為你描述的未來而寫的話。

■ 親自見證肯定語的力量
你不必聽信任何人。每天寫一句肯定語，堅持兩週，感受自己迎接每一天的狀態有多不同。這就是全部的實驗，而你自己就是唯一需要的證據。

■ 你也可以很了不起
了不起不是與生俱來的，而是由那些在平凡日子裡——沒有動力、也無人注視時——依然堅持相信的人一點一滴建成的。Anima 正是為那樣的日子而生。

■ 開始，就是一切
大多數夢想不是因為缺乏才華而消逝，而是因為第一步始終沒有踏出。所以，把今天當作第一步，並讓它小到你真的會去做。

■ 功能一覽
· 每日肯定語與激勵——為你正在打造的未來量身寫下的一句話
· 為你量身打造——依據你描述的未來自己與今天的目標
· 主畫面與鎖定畫面小工具——不打開 App 也能看到今日一句，每天午夜自動更新
· 真實的導師，真實的話語——從塞內卡到當代的聲音，絕無杜撰的名言
· 每日肯定語抄寫——抄寫一句簡短的肯定語，定下一天的心態
· 好事記錄——記下今天做得好的事，給自己應得的肯定
· 完整在地化——中文、English、한국어、Español；App 介面目前以簡體中文顯示
· 安靜的設計——無廣告、無追蹤、無通知轟炸

■ Anima 為何與眾不同
· 零廣告、零追蹤——我們從不收集你的廣告識別碼
· 沒有假名言——只有真實人物確實說過、經過甄選的話語
· 免費開始——一次買斷即可終身解鎖 Anima Pro，永不訂閱

你的夢想不需要完美的計畫，只需要今天踏出的第一步。

與 Anima 一起，踏出這一步。`,
};

export const COPY = Object.freeze({
  "en-US": COPY_EN,
  ko: COPY_KO,
  "es-ES": COPY_ES,
  // 문안은 es-ES 공유, 키워드만 다른 조합 — 미국·멕시코 스토어프론트 색인을 넓힌다.
  "es-MX": {
    ...COPY_ES,
    keywords:
      "superación,personal,citas,reflexiones,pensamiento,positivo,bienestar,crecimiento,rutina,meditación",
  },
  "zh-Hans": COPY_ZH_HANS,
  "zh-Hant": COPY_ZH_HANT,
});

// ─────────────────────────────── 검증 ───────────────────────────────

const log = (msg) => console.log(`[ios-metadata] ${msg}`);

function fail(msg) {
  console.error(`[ios-metadata] REJECT: ${msg}`);
  process.exit(1);
}

const maskId = (id) => (id && id.length > 4 ? `${id.slice(0, 4)}${"*".repeat(id.length - 4)}` : "****");

/** 글자 수는 코드포인트 기준 — 서로게이트 쌍(이모지 등)을 2자로 세는 오차를 막는다. */
export const charLen = (s) => [...s].length;

const preview = (s) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return charLen(flat) > PREVIEW_CHARS ? `${[...flat].slice(0, PREVIEW_CHARS).join("")}…` : flat;
};

/**
 * 문안 규칙 위반 목록을 돌려준다 — 비어 있으면 통과. (process.exit 대신 배열을 반환해 테스트 가능.)
 *  1) 모든 필드가 비어 있지 않고 Apple 상한 이내
 *  2) 키워드: 빈 항목 없음 · 공백 없음 · 이름/부제에 이미 있는 단어 없음
 *  3) 로케일마다 지원 URL 언어 매핑이 있음
 */
export function collectCopyProblems(copy = COPY) {
  const problems = [];
  for (const [locale, fields] of Object.entries(copy)) {
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
      const value = fields[field];
      if (typeof value !== "string" || !value.trim()) {
        problems.push(`${locale}.${field} 문구가 비어 있습니다.`);
        continue;
      }
      if (charLen(value) > limit) {
        problems.push(`${locale}.${field} 가 상한 ${limit}자를 초과합니다 (현재 ${charLen(value)}자).`);
      }
    }

    if (typeof fields.keywords === "string") {
      const title = `${fields.name ?? ""} ${fields.subtitle ?? ""}`.toLowerCase();
      for (const raw of fields.keywords.split(",")) {
        const keyword = raw.trim();
        if (!keyword) {
          problems.push(`${locale}.keywords 에 빈 항목이 있습니다.`);
          continue;
        }
        if (/\s/.test(raw)) {
          problems.push(`${locale}.keywords "${raw}" 에 공백이 있습니다 — 단어별로 나눠 쓰세요.`);
        }
        if (title.includes(keyword.toLowerCase())) {
          problems.push(`${locale}.keywords "${keyword}" 는 이름·부제에 이미 있어 낭비입니다.`);
        }
      }
    }

    if (!APP_LANG_BY_LOCALE[locale]) {
      problems.push(`${locale} 의 지원 URL 언어 매핑(APP_LANG_BY_LOCALE)이 없습니다.`);
    }
  }
  return problems;
}

function validateCopy() {
  const problems = collectCopyProblems();
  if (problems.length) fail(`문안 규칙 위반 ${problems.length}건:\n  - ${problems.join("\n  - ")}`);
}

/** "1.0.5" → "1.0.6". 제안용일 뿐 --version 으로 언제든 덮어쓸 수 있다. */
function suggestNextVersion(current) {
  if (!current) return "1.0.1";
  const parts = current.split(".").map(Number);
  if (parts.some(Number.isNaN)) return "1.0.1";
  while (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

// ─────────────────────────────── 인자 ───────────────────────────────
function parseArgs(argv) {
  const hasFlag = (name) => argv.includes(name);
  const argValue = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  return {
    apply: hasFlag("--apply"),
    versionString: argValue("--version"),
    updateLivePromo: !hasFlag("--no-live-promo"),
  };
}

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

// ─────────────────────────── 조회 헬퍼 ───────────────────────────

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

/** 앱 정보(이름·부제·개인정보 URL 이 붙는 객체). 라이브용 1개 + 편집용 1개가 있을 수 있다. */
async function fetchAppInfos(appId) {
  const res = await api("GET", `/v1/apps/${appId}/appInfos?limit=${VERSION_PAGE_LIMIT}`);
  return (res.data || []).map((i) => ({
    id: i.id,
    state: i.attributes?.state ?? i.attributes?.appStoreState,
  }));
}

async function fetchAppInfoLocalizations(appInfoId) {
  const res = await api(
    "GET",
    `/v1/appInfos/${appInfoId}/appInfoLocalizations?limit=${LOCALIZATION_PAGE_LIMIT}`,
  );
  return (res.data || []).map((l) => ({
    id: l.id,
    locale: l.attributes?.locale,
    name: l.attributes?.name,
    subtitle: l.attributes?.subtitle,
  }));
}

// ─────────────────────────── 읽기 전용 점검 ───────────────────────────

/**
 * 로케일별 스크린샷 수. 없는 로케일은 App Store 가 기본 언어 스크린샷으로 폴백하므로,
 * 기본 언어가 한국어면 영어권 사용자가 한국어 화면을 보게 된다 — 점검 출력으로 드러낸다.
 */
async function auditScreenshots(localizations, primaryLocale) {
  for (const loc of localizations) {
    const res = await api(
      "GET",
      `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots&limit=${SCREENSHOT_SET_PAGE_LIMIT}`,
      undefined,
      { soft: true },
    );
    if (res === null) {
      log(`  · ${loc.locale}: 스크린샷 조회 실패 — ASC 에서 직접 확인`);
      continue;
    }
    const sets = res.data || [];
    const total = sets.reduce((n, set) => n + (set.relationships?.appScreenshots?.data?.length ?? 0), 0);
    if (total === 0) {
      const fallback = loc.locale === primaryLocale ? "기본 언어인데도 없음!" : `기본 언어(${primaryLocale}) 것으로 폴백됨`;
      log(`  · ${loc.locale}: 스크린샷 없음 — ${fallback}`);
    } else {
      log(`  · ${loc.locale}: 스크린샷 ${total}장 (${sets.length}개 기기 세트)`);
    }
  }
}

/** 중국 본토 판매 여부 — 구글 로그인이 막히는 지역이라 켜져 있으면 1점 리뷰의 원천이다. */
async function auditChinaAvailability(appId) {
  const res = await api(
    "GET",
    `/v1/apps/${appId}/appAvailabilityV2?include=territoryAvailabilities&limit[territoryAvailabilities]=${TERRITORY_PAGE_LIMIT}`,
    undefined,
    { soft: true },
  );
  const china = (res?.included || []).find(
    (t) => t.type === "territoryAvailabilities" && t.relationships?.territory?.data?.id === CHINA_MAINLAND_TERRITORY,
  );
  if (!china) {
    log("중국 본토(CHN) 판매 여부: 확인 불가 — ASC '가격 및 사용 가능 여부' 에서 직접 확인");
    return;
  }
  log(
    china.attributes?.available
      ? "중국 본토(CHN) 판매: 켜져 있음 — 로그인·AI 가 동작하지 않는 지역이므로 제외를 권장 (docs/app-store-metadata.md §4)"
      : "중국 본토(CHN) 판매: 꺼져 있음 ✓",
  );
}

// ─────────────────────────── 변경 헬퍼 ───────────────────────────

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

/** 앱 정보의 로케일 이름·부제·개인정보 URL 을 업서트한다 — 있으면 PATCH, 없으면 POST. */
async function upsertAppInfoLocalization(appInfoId, locale, existing) {
  const attributes = { ...pick(COPY[locale], APP_INFO_FIELDS), privacyPolicyUrl: PRIVACY_URL };
  if (existing) {
    if (existing.name === attributes.name && existing.subtitle === attributes.subtitle) {
      log(`  · ${locale} 이름·부제 이미 최신 — "${attributes.name}" / "${attributes.subtitle}"`);
      return;
    }
    await api("PATCH", `/v1/appInfoLocalizations/${existing.id}`, {
      data: { type: "appInfoLocalizations", id: existing.id, attributes },
    });
    log(`  · ${locale} 이름·부제 갱신 — "${attributes.name}" / "${attributes.subtitle}"`);
    return;
  }
  await api("POST", "/v1/appInfoLocalizations", {
    data: {
      type: "appInfoLocalizations",
      attributes: { ...attributes, locale },
      relationships: { appInfo: { data: { type: "appInfos", id: appInfoId } } },
    },
  });
  log(`  · ${locale} 이름·부제 신규 추가 — "${attributes.name}" / "${attributes.subtitle}"`);
}

/** 편집 버전의 로케일 문안을 업서트한다 — 있으면 PATCH, 없으면 POST. */
async function upsertVersionLocalization(versionId, locale, existing) {
  const attributes = {
    ...pick(COPY[locale], VERSION_FIELDS),
    supportUrl: supportUrlFor(locale),
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

async function updateLivePromotionalText(liveVersion) {
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

// ─────────────────────────────── 메인 ───────────────────────────────

async function main() {
  validateCopy();
  const opts = parseArgs(process.argv.slice(2));
  const locales = Object.keys(COPY);

  const keyPath = process.env.ASC_API_KEY_PATH;
  if (!keyPath) fail("ASC_API_KEY_PATH 환경변수에 .p8 키 파일 경로를 지정하세요.");
  const keyId = process.env.ASC_API_KEY_ID || DEFAULT_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID || DEFAULT_ISSUER_ID;
  TOKEN = makeToken(keyId, issuerId, keyPath);
  log(`인증: key ${maskId(keyId)} / issuer ${maskId(issuerId)}`);

  const app = await fetchApp();
  const primaryLocale = app.attributes?.primaryLocale ?? "(미확인)";
  log(`앱: ${app.attributes?.name} (${BUNDLE_ID}) — id ${app.id} · 기본 언어 ${primaryLocale}`);

  const versions = await fetchVersions(app.id);
  const liveVersion = versions.find((v) => LIVE_VERSION_STATES.has(v.state));
  let editableVersion = versions.find((v) => EDITABLE_STATES.has(v.state));
  for (const v of versions) log(`버전: ${v.versionString} — ${v.state}`);

  let appInfos = await fetchAppInfos(app.id);
  let editableAppInfo = appInfos.find((i) => EDITABLE_STATES.has(i.state));
  log(`앱 정보: ${appInfos.map((i) => i.state).join(", ") || "(없음)"}`);

  const targetVersionString =
    opts.versionString ?? editableVersion?.versionString ?? suggestNextVersion(liveVersion?.versionString);

  if (!opts.apply) {
    log("── 읽기 전용 점검 ──");
    if (liveVersion) {
      log(`라이브 ${liveVersion.versionString} 로케일별 스크린샷 (없으면 기본 언어로 폴백):`);
      await auditScreenshots(await fetchLocalizations(liveVersion.id), primaryLocale);
    }
    if (editableAppInfo) {
      const current = await fetchAppInfoLocalizations(editableAppInfo.id);
      for (const l of current) log(`  · 이름·부제 ${l.locale}: "${l.name ?? ""}" / "${l.subtitle ?? ""}"`);
    }
    await auditChinaAvailability(app.id);

    log("── 변경 계획 (--apply 없이는 아무것도 바꾸지 않습니다) ──");
    if (editableVersion) {
      log(`편집 버전 ${editableVersion.versionString} 에 ${locales.length}개 로케일 문구 업서트: ${locales.join(", ")}`);
    } else {
      log(`새 버전 ${targetVersionString} 생성 후 ${locales.length}개 로케일 문구 업서트: ${locales.join(", ")}`);
    }
    log(
      editableAppInfo
        ? `편집 가능한 앱 정보에 ${locales.length}개 로케일 이름·부제 업서트`
        : "이름·부제: 편집 가능한 앱 정보가 없어 건너뜀 (버전이 심사 중이면 승인·출시 뒤 다시 실행)",
    );
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
    // 새 버전이 생기면 편집용 앱 정보도 함께 열린다 — 다시 읽는다.
    appInfos = await fetchAppInfos(app.id);
    editableAppInfo = appInfos.find((i) => EDITABLE_STATES.has(i.state));
  } else {
    log(`기존 편집 버전 사용: ${editableVersion.versionString} (${editableVersion.state})`);
  }

  // 2) 이름·부제 (앱 정보) — 새 로케일(es-MX·zh-Hant)은 여기서 먼저 만들어져야 버전 문안도 붙는다.
  if (editableAppInfo) {
    const current = await fetchAppInfoLocalizations(editableAppInfo.id);
    const byLocale = new Map(current.map((l) => [l.locale, l]));
    log("앱 정보 이름·부제 업데이트:");
    for (const locale of locales) {
      await upsertAppInfoLocalization(editableAppInfo.id, locale, byLocale.get(locale));
    }
  } else {
    log("이름·부제: 편집 가능한 앱 정보가 없어 건너뜀 — 심사 중인 버전이 출시된 뒤 다시 실행하세요.");
  }

  // 3) 버전 로케일 문안 업서트
  const staged = await fetchLocalizations(editableVersion.id);
  const stagedByLocale = new Map(staged.map((l) => [l.locale, l]));
  log(`편집 버전 ${editableVersion.versionString} 문구 업데이트:`);
  for (const locale of locales) {
    await upsertVersionLocalization(editableVersion.id, locale, stagedByLocale.get(locale));
  }

  // 4) 라이브 프로모션 텍스트 즉시 갱신
  if (opts.updateLivePromo && liveVersion) {
    await updateLivePromotionalText(liveVersion);
  }

  log("── 완료 ──");
  log(`남은 절차: 마케팅 버전 ${editableVersion.versionString} 빌드를 업로드한 뒤`);
  log("  node scripts/ios-appstore-submit.mjs --submit   ← 빌드 첨부 + 심사 제출");
  log("  새 로케일(es-MX·zh-Hant)의 스크린샷은 ASC 에서 es-ES·zh-Hans 것을 복사해 올릴 것 (docs/app-store-metadata.md §3)");
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => fail(`예상치 못한 오류: ${e.stack || e.message}`));
}
