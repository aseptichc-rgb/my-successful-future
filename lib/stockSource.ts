// ── 국내 주식 실시간 시세 소스 (NAVER Finance 모바일 JSON API) ──
//
// Gemini의 Google Search만으로는 시세 조회가 무성 실패 후 학습 데이터 기반
// 환각(hallucination) 응답을 만들어내는 문제가 있었다. 이 모듈은 숫자 데이터를
// 보장된 경로에서 받아와 시스템 프롬프트에 주입하는 역할을 담당한다.
//
// 실패 시에는 절대 추측값을 반환하지 않고 null을 반환하여 상위에서 "조회 실패"
// 응답으로 자연스럽게 흐르도록 한다.

// ── 설정 상수 ─────────────────────────────────────────
const NAVER_API_TIMEOUT_MS = 3000;
const NAVER_CACHE_TTL_SEC = 10;
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── 타입 ──────────────────────────────────────────────
export type IndexCode = "KOSPI" | "KOSDAQ" | "KOSPI200";

export interface StockQuote {
  /** 사람이 읽는 이름 (예: "삼성전자", "KOSPI") */
  name: string;
  /** 종목코드(005930) 또는 지수코드(KOSPI) */
  symbol: string;
  /** 현재가 (숫자). 지수는 포인트, 종목은 원. */
  price: number;
  /** 전일 대비 변화량 (부호 포함) */
  change: number;
  /** 전일 대비 변화율(%) (부호 포함) */
  changeRate: number;
  /** API가 반환한 최종 체결/거래 시각 (있을 때) */
  tradedAt?: string;
}

// ── 상위 시총 종목 매핑 ────────────────────────────────
// 이름 → 6자리 종목코드. 매핑에 없는 종목은 감지하지 않고 기존
// Google Search 경로로 흐르게 한다.
const STOCK_TICKERS: Record<string, string> = {
  삼성전자: "005930",
  "SK하이닉스": "000660",
  LG에너지솔루션: "373220",
  삼성바이오로직스: "207940",
  현대차: "005380",
  기아: "000270",
  셀트리온: "068270",
  "POSCO홀딩스": "005490",
  포스코홀딩스: "005490",
  NAVER: "035420",
  네이버: "035420",
  카카오: "035720",
  "LG화학": "051910",
  삼성SDI: "006400",
  "KB금융": "105560",
  신한지주: "055550",
  하나금융지주: "086790",
  우리금융지주: "316140",
  삼성물산: "028260",
  "SK이노베이션": "096770",
  한화에어로스페이스: "012450",
  삼성생명: "032830",
  "HD현대중공업": "329180",
  현대모비스: "012330",
  "LG전자": "066570",
  삼성화재: "000810",
  KT: "030200",
  "SK텔레콤": "017670",
  "LG유플러스": "032640",
  크래프톤: "259960",
  엔씨소프트: "036570",
  넷마블: "251270",
  카카오페이: "377300",
  카카오뱅크: "323410",
  "두산에너빌리티": "034020",
  한화오션: "042660",
  한미약품: "128940",
  유한양행: "000100",
  아모레퍼시픽: "090430",
  "CJ제일제당": "097950",
  롯데케미칼: "011170",
  에코프로비엠: "247540",
  에코프로: "086520",
  포스코퓨처엠: "003670",
  "LG이노텍": "011070",
  한온시스템: "018880",
  코스모신소재: "005070",
  "HMM": "011200",
  고려아연: "010130",
  한국전력: "015760",
  "KT&G": "033780",
};

// ── 지수 키워드 ─────────────────────────────────────
const INDEX_KEYWORDS: Record<IndexCode, string[]> = {
  KOSPI: ["코스피200", "코스피 200", "kospi200", "kospi 200"], // 200 먼저 체크
  KOSPI200: [],
  KOSDAQ: ["코스닥", "kosdaq"],
};

// "코스피" 같은 일반 코스피 키워드는 200 매칭이 먼저 시도된 뒤에 체크한다.
const KOSPI_GENERAL_KEYWORDS = ["코스피", "kospi"];

const STOCK_INTENT_KEYWORDS = [
  "주가",
  "시세",
  "종가",
  "주식",
  "지수",
  "증시",
  "등락",
  "상승",
  "하락",
  "오늘",
  "현재",
  "지금",
  "얼마",
];

// ── 환율 통화 매핑 ────────────────────────────────────
// NAVER reutersCode 기준. 사용자 메시지의 통화 키워드 → 코드.
const FX_CODES: Record<string, string> = {
  "달러": "FX_USDKRW",
  "미국 달러": "FX_USDKRW",
  "원달러": "FX_USDKRW",
  "원/달러": "FX_USDKRW",
  USD: "FX_USDKRW",
  "엔": "FX_JPYKRW",
  "엔화": "FX_JPYKRW",
  "일본 엔": "FX_JPYKRW",
  JPY: "FX_JPYKRW",
  "유로": "FX_EURKRW",
  EUR: "FX_EURKRW",
  "위안": "FX_CNYKRW",
  CNY: "FX_CNYKRW",
  "파운드": "FX_GBPKRW",
  GBP: "FX_GBPKRW",
};

const FX_DISPLAY_NAME: Record<string, string> = {
  FX_USDKRW: "원/달러 (USD/KRW)",
  FX_JPYKRW: "원/엔 (JPY/KRW, 100엔 기준)",
  FX_EURKRW: "원/유로 (EUR/KRW)",
  FX_CNYKRW: "원/위안 (CNY/KRW)",
  FX_GBPKRW: "원/파운드 (GBP/KRW)",
};

const FX_INTENT_KEYWORDS = ["환율", "환전", "시세", "기준환율", "송금", "현찰"];

// ── 쿼리 감지 ─────────────────────────────────────────
export interface StockQueryDetection {
  indexes: IndexCode[];
  tickers: { name: string; code: string }[];
  fxCodes: string[]; // FX_USDKRW 같은 reutersCode 배열
}

/**
 * 사용자 메시지에서 지수/종목 타겟을 추출한다.
 * 지수 키워드 또는 매핑된 종목명이 하나라도 있으면 감지된 것으로 간주.
 * 감지 실패 시 null 반환.
 */
export function detectStockQuery(message: string): StockQueryDetection | null {
  if (!message) return null;
  const lower = message.toLowerCase();

  const indexes: IndexCode[] = [];

  // KOSPI200 우선 매칭 (더 구체적인 키워드)
  if (INDEX_KEYWORDS.KOSPI.some((kw) => lower.includes(kw.toLowerCase()))) {
    indexes.push("KOSPI200");
  } else if (KOSPI_GENERAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
    indexes.push("KOSPI");
  }

  if (INDEX_KEYWORDS.KOSDAQ.some((kw) => lower.includes(kw.toLowerCase()))) {
    indexes.push("KOSDAQ");
  }

  const tickers: { name: string; code: string }[] = [];
  const seenCodes = new Set<string>();
  for (const [name, code] of Object.entries(STOCK_TICKERS)) {
    if (message.includes(name) && !seenCodes.has(code)) {
      tickers.push({ name, code });
      seenCodes.add(code);
    }
  }

  // 환율 감지: 통화 키워드 + 환율 의도 키워드 모두 있어야 함
  // (예: "달러 뉴스" 는 감지 안 함, "달러 환율" 또는 "원달러 환율" 만 감지)
  const fxCodes: string[] = [];
  const hasFxIntent = FX_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasFxIntent) {
    const seenFx = new Set<string>();
    for (const [keyword, code] of Object.entries(FX_CODES)) {
      if (message.includes(keyword) && !seenFx.has(code)) {
        fxCodes.push(code);
        seenFx.add(code);
      }
    }
    // "환율" 키워드만 있고 통화가 명시 안 되면 기본값 USD/KRW
    if (fxCodes.length === 0 && lower.includes("환율")) {
      fxCodes.push("FX_USDKRW");
    }
  }

  if (indexes.length === 0 && tickers.length === 0 && fxCodes.length === 0) {
    return null;
  }

  // 주가 의도 키워드가 전혀 없고 단순히 회사 이름만 언급된 경우는 제외
  // (예: "삼성전자 뉴스" → 주가 질문 아님). 단, 지수·환율 키워드가 포함되면 항상 감지.
  if (indexes.length === 0 && fxCodes.length === 0 && tickers.length > 0) {
    const hasIntent = STOCK_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
    if (!hasIntent) return null;
  }

  return { indexes, tickers, fxCodes };
}

// ── NAVER API fetch 헬퍼 ─────────────────────────────
async function fetchNaverJson<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAVER_API_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": NAVER_UA,
        Referer: "https://m.stock.naver.com/",
        Accept: "application/json, text/plain, */*",
      },
      next: { revalidate: NAVER_CACHE_TTL_SEC },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── NAVER 응답 타입 ─────────────────────────────────
/**
 * NAVER API는 등락 방향(부호)을 별도 필드에서 전달한다:
 *   code "1" → 하락 (FALL), "2" → 상승 (RISE), "3" → 보합 (FLAT)
 * `compareToPreviousClosePrice`와 `fluctuationsRatio`는 절댓값만 오므로
 * 반드시 이 필드와 조합해서 부호를 복원해야 한다.
 */
interface NaverPrevCompare {
  code?: string;
  name?: string;
}

interface NaverIndexBasic {
  stockName?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  compareToPreviousPrice?: NaverPrevCompare;
  fluctuationsRatio?: string;
  localTradedAt?: string;
}

function parseNaverNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const cleaned = v.replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** 부호 결정: -1 (하락) / 0 (보합) / +1 (상승) */
function directionSign(cmp: NaverPrevCompare | undefined): number {
  const code = cmp?.code;
  const name = cmp?.name;
  if (code === "1" || name === "FALL" || name === "LOWER_LIMIT") return -1;
  if (code === "2" || name === "RISING" || name === "UPPER_LIMIT") return 1;
  return 0;
}

const INDEX_DISPLAY_NAME: Record<IndexCode, string> = {
  KOSPI: "코스피",
  KOSDAQ: "코스닥",
  KOSPI200: "코스피200",
};

export async function fetchIndexQuote(
  index: IndexCode
): Promise<StockQuote | null> {
  const url = `https://m.stock.naver.com/api/index/${index}/basic`;
  const data = await fetchNaverJson<NaverIndexBasic>(url);
  if (!data) return null;

  const price = parseNaverNumber(data.closePrice);
  const absChange = parseNaverNumber(data.compareToPreviousClosePrice);
  const absRate = parseNaverNumber(data.fluctuationsRatio);
  const sign = directionSign(data.compareToPreviousPrice);

  if (!Number.isFinite(price)) return null;

  return {
    name: INDEX_DISPLAY_NAME[index],
    symbol: index,
    price,
    change: Number.isFinite(absChange) ? sign * absChange : 0,
    changeRate: Number.isFinite(absRate) ? sign * absRate : 0,
    tradedAt: data.localTradedAt,
  };
}

// ── 종목 조회 ─────────────────────────────────────────
interface NaverStockBasic {
  stockName?: string;
  stockExchangeType?: { code?: string };
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  compareToPreviousPrice?: NaverPrevCompare;
  fluctuationsRatio?: string;
  localTradedAt?: string;
  tradeStopType?: { code?: string; text?: string };
}

export async function fetchStockQuote(
  name: string,
  code: string
): Promise<StockQuote | null> {
  const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
  const data = await fetchNaverJson<NaverStockBasic>(url);
  if (!data) return null;

  const price = parseNaverNumber(data.closePrice);
  const absChange = parseNaverNumber(data.compareToPreviousClosePrice);
  const absRate = parseNaverNumber(data.fluctuationsRatio);
  const sign = directionSign(data.compareToPreviousPrice);

  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    name: data.stockName || name,
    symbol: code,
    price,
    change: Number.isFinite(absChange) ? sign * absChange : 0,
    changeRate: Number.isFinite(absRate) ? sign * absRate : 0,
    tradedAt: data.localTradedAt,
  };
}

// ── 환율 조회 ─────────────────────────────────────────
interface NaverFxItem {
  localTradedAt?: string;
  closePrice?: string;
  fluctuations?: string;
  fluctuationsRatio?: string;
  fluctuationsType?: NaverPrevCompare;
  cashBuyValue?: string;
  cashSellValue?: string;
  sendValue?: string;
  receiveValue?: string;
}

interface NaverFxResponse {
  isSuccess?: boolean;
  result?: NaverFxItem[];
}

export interface FxQuote {
  name: string;
  symbol: string;
  /** 기준환율 (closePrice) */
  price: number;
  change: number;
  changeRate: number;
  tradedAt?: string;
  cashBuy?: number;
  cashSell?: number;
  send?: number;
  receive?: number;
}

export async function fetchFxQuote(reutersCode: string): Promise<FxQuote | null> {
  const url = `https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=${reutersCode}&page=1`;
  const data = await fetchNaverJson<NaverFxResponse>(url);
  if (!data || !data.isSuccess || !Array.isArray(data.result) || data.result.length === 0) {
    return null;
  }

  // result[0]이 최신. 과거 데이터는 절대 사용하지 않음.
  const latest = data.result[0];
  const price = parseNaverNumber(latest.closePrice);
  const absChange = parseNaverNumber(latest.fluctuations);
  const absRate = parseNaverNumber(latest.fluctuationsRatio);
  const sign = directionSign(latest.fluctuationsType);

  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    name: FX_DISPLAY_NAME[reutersCode] || reutersCode,
    symbol: reutersCode,
    price,
    change: Number.isFinite(absChange) ? sign * absChange : 0,
    changeRate: Number.isFinite(absRate) ? sign * absRate : 0,
    tradedAt: latest.localTradedAt,
    cashBuy: parseNaverNumber(latest.cashBuyValue),
    cashSell: parseNaverNumber(latest.cashSellValue),
    send: parseNaverNumber(latest.sendValue),
    receive: parseNaverNumber(latest.receiveValue),
  };
}

function formatFxLine(q: FxQuote): string {
  const price = formatNumber(q.price, true);
  const rateSign = q.changeRate > 0 ? "+" : q.changeRate < 0 ? "" : "±";
  const changeSign = q.change > 0 ? "+" : q.change < 0 ? "" : "±";
  const rate = Math.abs(q.changeRate).toFixed(2);
  const change = formatNumber(Math.abs(q.change), true);
  const tradedAt = q.tradedAt ? ` [기준일: ${q.tradedAt}]` : "";
  const parts = [
    `- ${q.name}: ${price}원 (${rateSign}${rate}%, ${changeSign}${change})${tradedAt}`,
  ];
  if (Number.isFinite(q.cashBuy) && Number.isFinite(q.cashSell)) {
    parts.push(
      `  · 현찰 살 때 ${formatNumber(q.cashBuy!, true)}원 · 팔 때 ${formatNumber(q.cashSell!, true)}원`
    );
  }
  if (Number.isFinite(q.send) && Number.isFinite(q.receive)) {
    parts.push(
      `  · 송금 보낼 때 ${formatNumber(q.send!, true)}원 · 받을 때 ${formatNumber(q.receive!, true)}원`
    );
  }
  return parts.join("\n");
}

// ── 프롬프트 주입용 컨텍스트 생성 ─────────────────────
function formatKstNow(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${mi} KST`;
}

function formatNumber(n: number, withDecimal: boolean): string {
  const opts: Intl.NumberFormatOptions = withDecimal
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return n.toLocaleString("ko-KR", opts);
}

function formatQuoteLine(q: StockQuote, isIndex: boolean): string {
  const price = formatNumber(q.price, isIndex);
  const sign = q.change > 0 ? "+" : q.change < 0 ? "" : "±";
  const rateSign = q.changeRate > 0 ? "+" : q.changeRate < 0 ? "" : "±";
  const change = formatNumber(Math.abs(q.change), isIndex);
  const rate = Math.abs(q.changeRate).toFixed(2);
  const unit = isIndex ? "" : "원";
  const symbolLabel = isIndex ? "" : ` (${q.symbol})`;
  return `- ${q.name}${symbolLabel}: ${price}${unit} (${rateSign}${rate}%, ${sign}${change})`;
}

/**
 * 메시지에서 주식 질문을 감지하고, 감지 성공 시 실시간 시세를 조회하여
 * 시스템 프롬프트에 주입할 수 있는 텍스트 블록을 반환한다.
 *
 * - 감지 실패: null (질문이 주식과 무관)
 * - 감지됐으나 조회 전부 실패: null (상위 프롬프트 규칙이 "조회 실패" 응답 유도)
 * - 일부 성공: 성공한 것만 포함해서 반환
 */
export async function buildStockContext(
  message: string
): Promise<string | null> {
  const detected = detectStockQuery(message);
  if (!detected) return null;

  // 지수 + 종목 + 환율 병렬 조회 (CLAUDE.md: 모든 비동기에 try-catch는 하위 레벨에서 처리됨)
  const indexPromises = detected.indexes.map((i) => fetchIndexQuote(i));
  const stockPromises = detected.tickers.map((t) =>
    fetchStockQuote(t.name, t.code)
  );
  const fxPromises = detected.fxCodes.map((c) => fetchFxQuote(c));

  const [indexResults, stockResults, fxResults] = await Promise.all([
    Promise.all(indexPromises),
    Promise.all(stockPromises),
    Promise.all(fxPromises),
  ]);

  const indexQuotes = indexResults.filter((q): q is StockQuote => q !== null);
  const stockQuotes = stockResults.filter((q): q is StockQuote => q !== null);
  const fxQuotes = fxResults.filter((q): q is FxQuote => q !== null);

  if (
    indexQuotes.length === 0 &&
    stockQuotes.length === 0 &&
    fxQuotes.length === 0
  ) {
    return null;
  }

  const lines: string[] = [];
  for (const q of indexQuotes) lines.push(formatQuoteLine(q, true));
  for (const q of stockQuotes) lines.push(formatQuoteLine(q, false));
  for (const q of fxQuotes) lines.push(formatFxLine(q));

  return `

## 실시간 국내 시세 데이터 (${formatKstNow()} 기준, 출처: NAVER 금융 — 최신 1건만 제공)
${lines.join("\n")}

[중요 — 반드시 준수]
- 위 숫자는 NAVER에서 방금 조회한 실제 데이터이며, 각 지표의 가장 최신 1건만 포함되어 있습니다.
- 이 숫자만 그대로 전달하세요. 어떤 경우에도 숫자를 변경·반올림하지 마세요.
- 다른 시점·다른 은행·다른 서비스의 과거 수치를 덧붙여 나열하지 마세요. 답변에 숫자는 지표당 최신 1건이어야 합니다.
- 위 데이터에 없는 종목·지수·통화의 가격은 절대 추측하지 마세요.
- 출처를 언급할 때는 "네이버 금융 기준"이라고만 명시하세요.`;
}

// ── 시장 개황 자동 조회 (금융 애널리스트 페르소나용) ──────
// 사용자가 구체적 종목을 묻지 않아도, fund-trader 페르소나가 활성화되면
// 주요 지수 + 환율을 자동으로 시스템 프롬프트에 주입한다.
const OVERVIEW_INDEXES: IndexCode[] = ["KOSPI", "KOSDAQ", "KOSPI200"];
const OVERVIEW_FX: string[] = ["FX_USDKRW", "FX_JPYKRW"];
const OVERVIEW_STOCKS: { name: string; code: string }[] = [
  { name: "삼성전자", code: "005930" },
  { name: "SK하이닉스", code: "000660" },
  { name: "현대차", code: "005380" },
  { name: "NAVER", code: "035420" },
  { name: "카카오", code: "035720" },
];

/**
 * 금융 애널리스트(fund-trader) 페르소나가 활성일 때 자동 호출.
 * 주요 지수 3종 + 핵심 대형주 5종 + 환율 2종을 병렬 조회하여
 * 시장 개황 텍스트 블록을 반환한다.
 *
 * 이미 buildStockContext 에서 사용자가 특정 종목을 질문한 경우,
 * 중복 데이터는 상위에서 병합/제거한다.
 *
 * 전체 실패 시 null 반환 (상위에서 무시).
 */
export async function fetchMarketOverview(): Promise<string | null> {
  try {
    const [indexResults, stockResults, fxResults] = await Promise.all([
      Promise.all(OVERVIEW_INDEXES.map((i) => fetchIndexQuote(i))),
      Promise.all(OVERVIEW_STOCKS.map((t) => fetchStockQuote(t.name, t.code))),
      Promise.all(OVERVIEW_FX.map((c) => fetchFxQuote(c))),
    ]);

    const indexQuotes = indexResults.filter((q): q is StockQuote => q !== null);
    const stockQuotes = stockResults.filter((q): q is StockQuote => q !== null);
    const fxQuotes = fxResults.filter((q): q is FxQuote => q !== null);

    if (indexQuotes.length === 0 && stockQuotes.length === 0 && fxQuotes.length === 0) {
      return null;
    }

    const lines: string[] = [];
    if (indexQuotes.length > 0) {
      lines.push("[주요 지수]");
      for (const q of indexQuotes) lines.push(formatQuoteLine(q, true));
    }
    if (stockQuotes.length > 0) {
      lines.push("[시가총액 상위 종목]");
      for (const q of stockQuotes) lines.push(formatQuoteLine(q, false));
    }
    if (fxQuotes.length > 0) {
      lines.push("[주요 환율]");
      for (const q of fxQuotes) lines.push(formatFxLine(q));
    }

    return `

## 📊 시장 개황 (${formatKstNow()} 기준, 출처: NAVER 금융)
${lines.join("\n")}

[중요 — 반드시 준수]
- 위 숫자는 NAVER에서 방금 조회한 실제 데이터입니다. 그대로 전달하세요.
- 숫자를 변경·반올림하지 마세요.
- 위 데이터에 없는 종목·지수·통화의 가격은 절대 추측하지 마세요.
- 사용자가 시장 동향을 물으면 위 데이터를 기반으로 분석하세요.
- 출처를 언급할 때는 "네이버 금융 기준"이라고만 명시하세요.`;
  } catch (err) {
    console.error("[fetchMarketOverview] 시장 개황 조회 실패:", err);
    return null;
  }
}
