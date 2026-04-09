import type { NewsSource, NewsTopic } from "@/types";
import { formatDate } from "@/lib/locale";

// ── 시의성 키워드 ─────────────────────────────────────
const TIMELINESS_KEYWORDS = ["오늘", "방금", "최신", "속보", "지금", "현재", "긴급"];

// ── 소스 선택 우선순위 결정 ───────────────────────────
type SourceType = "google_search" | "newsapi" | "rss";

export function getSourcePriority(query: string, topic: NewsTopic): SourceType[] {
  const isTimely = TIMELINESS_KEYWORDS.some((kw) => query.includes(kw));

  if (isTimely) {
    return ["google_search", "newsapi", "rss"];
  }

  switch (topic) {
    case "글로벌":
    case "IT":
    case "헬스케어":
      return ["newsapi", "google_search", "rss"];
    case "국내":
      return ["rss", "google_search", "newsapi"];
    default:
      return ["google_search", "newsapi", "rss"];
  }
}

// ── NewsAPI 호출 ──────────────────────────────────────
const NEWSAPI_CATEGORIES: Partial<Record<NewsTopic, string>> = {
  IT: "technology",
  헬스케어: "health",
  글로벌: "general",
  국내: "general",
};

export async function fetchFromNewsAPI(
  query: string,
  topic: NewsTopic
): Promise<NewsSource[]> {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];

  try {
    const category = NEWSAPI_CATEGORIES[topic] || "general";
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;

    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];

    const data = await res.json();

    return (data.articles || []).map(
      (article: {
        title: string;
        source: { name: string };
        url: string;
        publishedAt: string;
        description: string;
        urlToImage?: string;
      }) => ({
        title: article.title,
        publisher: article.source?.name || "Unknown",
        url: article.url,
        publishedAt: formatDate(new Date(article.publishedAt)),
        summary: article.description || "",
        imageUrl: article.urlToImage || undefined,
      })
    );
  } catch {
    return [];
  }
}

// ── RSS 피드 크롤링 ───────────────────────────────────
const RSS_FEEDS: Record<string, string> = {
  연합뉴스: "https://www.yna.co.kr/RSS/news.xml",
  한겨레: "https://www.hani.co.kr/rss/",
};

export async function fetchFromRSS(query: string): Promise<NewsSource[]> {
  // rss-parser는 서버 사이드에서만 동작
  try {
    const RSSParser = (await import("rss-parser")).default;
    const parser = new RSSParser();
    const results: NewsSource[] = [];

    for (const [name, url] of Object.entries(RSS_FEEDS)) {
      try {
        const feed = await parser.parseURL(url);
        const matchingItems = (feed.items || [])
          .filter(
            (item) =>
              item.title?.includes(query) ||
              item.contentSnippet?.includes(query)
          )
          .slice(0, 3);

        for (const item of matchingItems) {
          results.push({
            title: item.title || "",
            publisher: name,
            url: item.link || "",
            publishedAt: item.pubDate
              ? formatDate(new Date(item.pubDate))
              : "",
            summary: item.contentSnippet?.slice(0, 150) || "",
          });
        }
      } catch {
        // 개별 피드 실패 시 무시하고 다음으로
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ── Gemini Google Search (API route를 통해 호출) ──────
export async function fetchFromGoogleSearch(
  query: string,
  topic: NewsTopic,
  baseUrl: string
): Promise<NewsSource[]> {
  try {
    const res = await fetch(`${baseUrl}/api/news`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topic }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.news || [];
  } catch {
    return [];
  }
}

// ── 통합 뉴스 페칭 (폴백 체인) ───────────────────────
export async function fetchNews(
  query: string,
  topic: NewsTopic,
  baseUrl: string
): Promise<NewsSource[]> {
  const priorities = getSourcePriority(query, topic);

  for (const source of priorities) {
    let results: NewsSource[] = [];

    switch (source) {
      case "google_search":
        results = await fetchFromGoogleSearch(query, topic, baseUrl);
        break;
      case "newsapi":
        results = await fetchFromNewsAPI(query, topic);
        break;
      case "rss":
        results = await fetchFromRSS(query);
        break;
    }

    if (results.length > 0) {
      return results;
    }
  }

  return [];
}
