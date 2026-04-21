/**
 * 페르소나별 뉴스 자동 수집기 (서버 전용).
 *
 * 흐름:
 *   1) 오늘자 스케줄을 Firestore에서 읽거나 결정론적으로 생성.
 *   2) 지금 시각 기준으로 도래한 슬롯이 있는지 확인.
 *   3) 도래했으면 Gemini googleSearch + 페르소나 키워드로 기사 1~3건 수집.
 *   4) 페르소나 관점 한 줄 브리핑 생성 → personaNews/{personaId}/items 에 저장.
 *   5) 스케줄의 fetched[i] = true 로 갱신.
 *
 * 동일 시각에 여러 인스턴스가 호출돼도 트랜잭션으로 멱등성 확보.
 *
 * 모든 비동기 경로는 try/catch로 감싸서 한 페르소나 실패가 다른 페르소나를 막지 않게 한다.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "./gemini";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { PERSONA_SPECIALTIES } from "@/lib/personas";
import {
  buildDailySchedule,
  findDueSlot,
  getKstDateString,
  scheduleDocId,
} from "@/lib/newsSchedule";
import { fetchMarketOverview } from "@/lib/stockSource";
import { buildFinanceNewsContext } from "@/lib/naverFinanceNews";
import type {
  BuiltinPersonaId,
  CollectedArticle,
  NewsSource,
  PersonaNewsSchedule,
} from "@/types";

const MODEL = "gemini-2.0-flash";
const MAX_ARTICLES_PER_SLOT = 3;
const ARTICLE_RETENTION_DAYS = 3;     // 3일 지난 기사 정리 대상

interface GroundingMeta {
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: {
    segment?: { startIndex?: number; endIndex?: number; text?: string };
    groundingChunkIndices?: number[];
  }[];
}

const KNOWN_PUBLISHERS: Record<string, string> = {
  "ytn.co.kr": "YTN", "yna.co.kr": "연합뉴스", "joongang.co.kr": "중앙일보",
  "joins.com": "중앙일보", "donga.com": "동아일보", "chosun.com": "조선일보",
  "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "mk.co.kr": "매일경제",
  "hankyung.com": "한국경제", "reuters.com": "Reuters", "bbc.com": "BBC",
  "cnn.com": "CNN", "bloomberg.com": "Bloomberg", "nytimes.com": "NYT",
};

function extractPublisher(domainOrUrl: string): string {
  const cleaned = domainOrUrl.replace(/^www\./, "").toLowerCase();
  for (const [d, n] of Object.entries(KNOWN_PUBLISHERS)) {
    if (cleaned.includes(d)) return n;
  }
  try {
    return new URL(domainOrUrl).hostname.replace("www.", "");
  } catch {
    return cleaned || "기사 출처";
  }
}

/** Gemini groundingMetadata → NewsSource[] */
function extractSources(metadata: GroundingMeta | undefined): NewsSource[] {
  if (!metadata?.groundingChunks) return [];
  const titles = new Map<number, string>();
  for (const sup of metadata.groundingSupports || []) {
    const t = sup.segment?.text;
    if (!t || !sup.groundingChunkIndices) continue;
    for (const idx of sup.groundingChunkIndices) {
      if (!titles.has(idx)) titles.set(idx, t.slice(0, 120));
    }
  }
  const out: NewsSource[] = [];
  const seen = new Set<string>();
  metadata.groundingChunks.forEach((chunk, i) => {
    const uri = chunk.web?.uri;
    if (!uri) return;
    const key = chunk.web?.title || uri;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      title: (titles.get(i) || `${extractPublisher(key)} 관련 기사`)
        .replace(/[*#`]/g, "").trim(),
      publisher: extractPublisher(key),
      url: uri,
      publishedAt: getKstDateString(),
    });
  });
  return out.slice(0, MAX_ARTICLES_PER_SLOT);
}

/**
 * 한 슬롯 분량의 뉴스를 Gemini로 검색해 가져온다.
 * 응답 본문 첫 줄을 페르소나 관점 한 줄 브리핑으로 사용.
 */
async function fetchArticlesForPersona(
  personaId: BuiltinPersonaId
): Promise<{ articles: NewsSource[]; briefing: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 미설정");

  const specialty = PERSONA_SPECIALTIES[personaId];
  if (!specialty) throw new Error(`알 수 없는 페르소나: ${personaId}`);

  // 키워드 3개 랜덤 선택 (다양성 확보)
  const keywords = [...specialty.searchKeywords]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const today = getKstDateString();
  let systemPrompt = `당신은 "${personaId}" 도메인 전문 큐레이터입니다.
오늘(${today}) 자정 이후 보도된 한국·글로벌 뉴스 중에서, 다음 키워드와 직접 관련된 핵심 기사를 ${MAX_ARTICLES_PER_SLOT}건 이내로 골라주세요.
키워드: ${keywords.join(", ")}

응답은 정확히 다음 형식을 따르세요 (마크다운/이모지/불필요한 인사 금지):
[브리핑] 한 문장으로 오늘 이 도메인에서 가장 중요한 흐름을 ${specialty.briefingStyle} 어투로 요약.
[기사 목록]
- 짧은 제목 1
- 짧은 제목 2

만약 오늘 의미 있는 신규 기사가 없다면 "[브리핑] [NO_NEWS]" 한 줄만 출력하세요.`;

  // fund-trader: 실시간 시장 시세 + 금융 뉴스를 큐레이션 컨텍스트에 주입
  if (personaId === "fund-trader") {
    try {
      const [marketCtx, newsCtx] = await Promise.all([
        fetchMarketOverview().catch(() => null),
        buildFinanceNewsContext().catch(() => null),
      ]);
      if (marketCtx) systemPrompt += `\n${marketCtx}`;
      if (newsCtx) systemPrompt += `\n${newsCtx}`;
      if (marketCtx || newsCtx) {
        systemPrompt += `\n위 실시간 데이터를 브리핑에 반영하세요. 시장 시세 변동과 금융 뉴스를 결합하여 요약하세요.`;
      }
    } catch {
      // 시장 데이터 조회 실패 시 기존 Google Search만으로 진행
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
    tools: [{ googleSearch: {} } as never],
  });

  const result = await withRetry(() => model.generateContent(
    `[오늘 ${today}] 위 키워드 중심으로 가장 신선한 기사를 검색해줘.`
  ));
  const response = result.response;
  const text = response.text();

  if (text.includes("[NO_NEWS]")) {
    return { articles: [], briefing: "" };
  }

  // 브리핑 한 줄 추출
  const briefingMatch = text.match(/\[브리핑\]\s*(.+)/);
  const briefing = briefingMatch
    ? briefingMatch[1].trim().slice(0, 240)
    : text.split("\n").find((l) => l.trim().length > 0)?.slice(0, 240) || "";

  const sources = extractSources(
    response.candidates?.[0]?.groundingMetadata as GroundingMeta | undefined
  );

  return { articles: sources, briefing };
}

/**
 * 한 페르소나의 오늘 일정을 처리한다.
 * 도래한 슬롯이 있으면 수집을 시도하고, 트랜잭션으로 fetched 플래그를 갱신한다.
 *
 * @returns "collected": 신규 수집 / "no-due": 도래 슬롯 없음 / "no-news": 슬롯은 있었지만 신규 기사 0건 / "skipped": 다른 인스턴스가 먼저 처리
 */
export async function collectForPersona(
  personaId: BuiltinPersonaId,
  now: Date = new Date()
): Promise<"collected" | "no-due" | "no-news" | "skipped" | "error"> {
  try {
    const db = getAdminDb();
    const date = getKstDateString(now);
    const docId = scheduleDocId(date, personaId);
    const scheduleRef = db.collection("personaNewsSchedule").doc(docId);

    // 1) 스케줄 로드 또는 생성
    const snap = await scheduleRef.get();
    let schedule: PersonaNewsSchedule;
    if (snap.exists) {
      schedule = snap.data() as PersonaNewsSchedule;
    } else {
      schedule = buildDailySchedule(date, personaId);
      // 최초 생성 (이미 있으면 ignore)
      await scheduleRef.set(schedule, { merge: false }).catch(() => {});
    }

    // 2) 도래 슬롯 확인
    const due = findDueSlot(schedule);
    if (due === null) return "no-due";

    // 3) 트랜잭션으로 슬롯 점유 (다른 인스턴스가 먼저 가져갔으면 skip)
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(scheduleRef);
      const cur = fresh.exists
        ? (fresh.data() as PersonaNewsSchedule)
        : buildDailySchedule(date, personaId);
      if (cur.fetched[due]) return false;
      const newFetched: [boolean, boolean] = [...cur.fetched] as [boolean, boolean];
      newFetched[due] = true;
      tx.set(
        scheduleRef,
        { ...cur, fetched: newFetched },
        { merge: true }
      );
      return true;
    });
    if (!claimed) return "skipped";

    // 4) 실제 수집
    let result: { articles: NewsSource[]; briefing: string };
    try {
      result = await fetchArticlesForPersona(personaId);
    } catch (err) {
      // 수집 실패 → fetched 롤백 (다음 호출이 재시도하도록)
      await scheduleRef
        .set(
          {
            ...schedule,
            fetched: schedule.fetched.map((v, i) => (i === due ? false : v)),
          },
          { merge: true }
        )
        .catch(() => {});
      throw err;
    }

    if (result.articles.length === 0) {
      // 슬롯은 소비. 신규 기사 없음.
      return "no-news";
    }

    // 5) 기사들을 personaNews/{personaId}/items 컬렉션에 저장
    const itemsCol = db
      .collection("personaNews")
      .doc(personaId)
      .collection("items");
    const writes = result.articles.map((article) => {
      const id = `${date}_s${due}_${Math.random().toString(36).slice(2, 8)}`;
      const doc: CollectedArticle = {
        id,
        personaId,
        source: article,
        briefing: result.briefing,
        slotIndex: due,
        collectedDate: date,
        collectedAt: Timestamp.fromDate(now),
      };
      return itemsCol.doc(id).set(doc);
    });
    await Promise.all(writes);

    // 6) 오래된 기사 정리 (3일 초과)
    cleanupOldArticles(personaId).catch(() => {});

    return "collected";
  } catch (err) {
    console.error(`[collectForPersona] ${personaId} 실패:`, err);
    return "error";
  }
}

/** N일 지난 수집 기사 정리 (best-effort). */
async function cleanupOldArticles(personaId: BuiltinPersonaId): Promise<void> {
  const db = getAdminDb();
  const cutoff = new Date(Date.now() - ARTICLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const snap = await db
    .collection("personaNews")
    .doc(personaId)
    .collection("items")
    .where("collectedAt", "<", Timestamp.fromDate(cutoff))
    .limit(50)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  // FieldValue 사용 안 했지만 import 유지(향후 카운터 등 확장 대비)
  void FieldValue;
}

/**
 * 특정 페르소나의 최근 수집 기사들을 조회 (토론 시스템 프롬프트 주입용).
 */
export async function getRecentArticlesForPersona(
  personaId: BuiltinPersonaId,
  limit = 5
): Promise<CollectedArticle[]> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("personaNews")
      .doc(personaId)
      .collection("items")
      .orderBy("collectedAt", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data() as CollectedArticle);
  } catch (err) {
    console.error(`[getRecentArticlesForPersona] ${personaId} 조회 실패:`, err);
    return [];
  }
}
