/**
 * 네이버 증권 뉴스 수집 모듈 (서버 전용).
 *
 * 네이버 금융 모바일 JSON API를 사용하여 시장·종목 관련 최신 뉴스 헤드라인을
 * 가져온다. 금융 애널리스트(fund-trader) 페르소나가 대화 또는 자동 브리핑에서
 * 실시간 금융 뉴스를 참조할 수 있도록 한다.
 *
 * 실패 시에는 빈 배열 또는 null 을 반환하여 상위 흐름이 자연스럽게 폴백하도록 한다.
 */

const NAVER_API_TIMEOUT_MS = 5000;
const NAVER_NEWS_CACHE_TTL_SEC = 60; // 뉴스는 시세보다 긴 캐시 (60초)
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── 타입 ──────────────────────────────────────────────
export interface NaverFinanceNewsItem {
  /** 기사 제목 */
  title: string;
  /** 기사 원문 URL */
  url: string;
  /** 출처(언론사명) */
  publisher: string;
  /** 발행 시각 (네이버 API 반환 형식 그대로) */
  publishedAt: string;
  /** 요약문 (있을 때) */
  summary?: string;
}

// ── NAVER API 응답 타입 ───────────────────────────────
// 시장 뉴스: /api/index/{KOSPI|KOSDAQ}/news
interface NaverNewsArticle {
  articleId?: string;
  title?: string;
  summary?: string;
  source?: string;
  sourceCode?: string;
  datetime?: string;        // "2026-04-21 14:23"
  link?: string;
  officeName?: string;
  officeUrl?: string;
  imageUrl?: string;
  body?: string;
}

interface NaverNewsListResponse {
  news?: NaverNewsArticle[];
  items?: NaverNewsArticle[];
  // 일부 엔드포인트는 다른 구조로 감싸서 올 수 있음
  [key: string]: unknown;
}

// ── fetch 헬퍼 ────────────────────────────────────────
async function fetchNaverNewsJson<T>(url: string): Promise<T | null> {
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
      next: { revalidate: NAVER_NEWS_CACHE_TTL_SEC },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function parseArticle(a: NaverNewsArticle): NaverFinanceNewsItem | null {
  const title = a.title?.replace(/<[^>]*>/g, "").trim();
  if (!title) return null;

  const url = a.link || (a.articleId
    ? `https://n.news.naver.com/mnews/article/${a.sourceCode || ""}/${a.articleId}`
    : "");
  if (!url) return null;

  return {
    title,
    url,
    publisher: a.officeName || a.source || "네이버 증권",
    publishedAt: a.datetime || "",
    summary: a.summary?.replace(/<[^>]*>/g, "").trim().slice(0, 200) || undefined,
  };
}

// ── 시장 주요 뉴스 (KOSPI/KOSDAQ 시장 뉴스) ───────────
/**
 * KOSPI 또는 KOSDAQ 시장 관련 최신 뉴스를 조회한다.
 * @param count 가져올 기사 수 (기본 5)
 */
export async function fetchMarketNews(
  count: number = 5
): Promise<NaverFinanceNewsItem[]> {
  try {
    // KOSPI 시장 뉴스 + KOSDAQ 뉴스를 병렬 조회 후 합산
    const [kospiData, kosdaqData] = await Promise.all([
      fetchNaverNewsJson<NaverNewsListResponse>(
        `https://m.stock.naver.com/api/index/KOSPI/news?page=1&pageSize=${count}`
      ),
      fetchNaverNewsJson<NaverNewsListResponse>(
        `https://m.stock.naver.com/api/index/KOSDAQ/news?page=1&pageSize=3`
      ),
    ]);

    const articles: NaverFinanceNewsItem[] = [];
    const seen = new Set<string>();

    // 두 데이터를 합산하여 중복 제거
    for (const data of [kospiData, kosdaqData]) {
      if (!data) continue;
      const items = data.news || data.items || [];
      if (!Array.isArray(items)) continue;
      for (const raw of items) {
        const parsed = parseArticle(raw);
        if (!parsed) continue;
        // 제목 기준 중복 제거
        if (seen.has(parsed.title)) continue;
        seen.add(parsed.title);
        articles.push(parsed);
      }
    }

    return articles.slice(0, count);
  } catch (err) {
    console.error("[fetchMarketNews] 시장 뉴스 조회 실패:", err);
    return [];
  }
}

// ── 특정 종목 뉴스 ────────────────────────────────────
/**
 * 특정 종목 코드에 대한 최신 뉴스를 조회한다.
 * @param stockCode 6자리 종목 코드 (예: "005930")
 * @param count 가져올 기사 수 (기본 3)
 */
export async function fetchStockNews(
  stockCode: string,
  count: number = 3
): Promise<NaverFinanceNewsItem[]> {
  try {
    const data = await fetchNaverNewsJson<NaverNewsListResponse>(
      `https://m.stock.naver.com/api/stock/${stockCode}/news?page=1&pageSize=${count}`
    );
    if (!data) return [];

    const items = data.news || data.items || [];
    if (!Array.isArray(items)) return [];

    const articles: NaverFinanceNewsItem[] = [];
    for (const raw of items) {
      const parsed = parseArticle(raw);
      if (parsed) articles.push(parsed);
    }
    return articles.slice(0, count);
  } catch (err) {
    console.error(`[fetchStockNews] ${stockCode} 뉴스 조회 실패:`, err);
    return [];
  }
}

// ── 금융 시장 핵심 뉴스 조합 (시장 + 주요 종목) ─────────
/**
 * 시장 뉴스 + 주요 종목 뉴스를 종합하여 금융 애널리스트 페르소나에
 * 시스템 프롬프트로 주입할 텍스트 블록을 반환한다.
 *
 * 뉴스가 전혀 없으면 null 반환.
 */
export async function buildFinanceNewsContext(): Promise<string | null> {
  try {
    const [marketNews, samsungNews, hynixNews] = await Promise.all([
      fetchMarketNews(5),
      fetchStockNews("005930", 2), // 삼성전자
      fetchStockNews("000660", 2), // SK하이닉스
    ]);

    const allNews: NaverFinanceNewsItem[] = [];
    const seen = new Set<string>();

    // 시장 뉴스 우선
    for (const n of marketNews) {
      if (seen.has(n.title)) continue;
      seen.add(n.title);
      allNews.push(n);
    }
    // 주요 종목 뉴스 보충
    for (const n of [...samsungNews, ...hynixNews]) {
      if (seen.has(n.title)) continue;
      seen.add(n.title);
      allNews.push(n);
    }

    if (allNews.length === 0) return null;

    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const timeStr = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")} ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")} KST`;

    const newsLines = allNews
      .slice(0, 8)
      .map((n, i) => {
        const pub = n.publisher ? ` (${n.publisher})` : "";
        const time = n.publishedAt ? ` [${n.publishedAt}]` : "";
        return `${i + 1}. ${n.title}${pub}${time}`;
      })
      .join("\n");

    return `

## 📰 네이버 증권 최신 금융 뉴스 (${timeStr} 기준)
${newsLines}

[활용 지침]
- 위 뉴스 헤드라인은 네이버 증권에서 방금 수집한 실제 기사입니다.
- 사용자가 시장 동향이나 금융 관련 질문을 하면 위 뉴스를 참고하여 분석하세요.
- 기사 내용을 추측해서 지어내지 마세요. 헤드라인에 있는 팩트만 언급하세요.
- 더 자세한 내용이 필요하면 Google Search로 해당 기사를 검색하세요.
- 출처는 "네이버 증권 기준"이라고 명시하세요.`;
  } catch (err) {
    console.error("[buildFinanceNewsContext] 금융 뉴스 컨텍스트 빌드 실패:", err);
    return null;
  }
}
