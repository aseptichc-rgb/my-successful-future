/**
 * Google Docs 공개 문서를 참조 자료로 가져오는 모듈.
 *
 * - 공개 공유 링크(export?format=txt) 기반. OAuth/Service Account 불필요.
 * - 5분 TTL 인메모리 캐시로 매 요청마다 외부 호출하지 않도록 함.
 * - 실패 시 캐시된 마지막 값이 있으면 그대로 반환(stale-while-error).
 * - 반환 구조는 lib/prompts.ts 의 attachedDocuments 포맷과 동일하게 맞춤.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8 * 1000;
const MAX_TEXT_LENGTH = 40_000; // 프롬프트 과대 주입 방지
const EXPORT_URL_TEMPLATE = "https://docs.google.com/document/d/{id}/export?format=txt";
const MAX_USER_DOCS = 10; // 사용자당 참조 문서 상한 (프롬프트 폭주 방지)

/**
 * Google Docs URL 에서 문서 ID 만 추출.
 * 허용 형식:
 *  - https://docs.google.com/document/d/{ID}/edit...
 *  - https://docs.google.com/document/d/{ID}
 *  - {ID} (순수 ID 문자열)
 * 실패 시 null.
 */
export function parseGoogleDocId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export interface ReferenceDocument {
  fileName: string;
  text: string;
  truncated: boolean;
}

interface CacheEntry {
  value: ReferenceDocument;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 환경변수 `GOOGLE_DOCS_REFERENCE_IDS` (쉼표 구분) 에 지정된 문서들을 가져온다.
 * 미설정 시 CLAUDE.md 에서 사용자가 지정한 기본 문서를 사용.
 */
const DEFAULT_DOC_IDS = ["1tooG5lWA4GRz-CpPjxvmusxtflrw6ImJKv33Yv7OGeQ"];

function resolveDocIds(): string[] {
  const raw = process.env.GOOGLE_DOCS_REFERENCE_IDS?.trim();
  if (!raw) return DEFAULT_DOC_IDS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchDocText(docId: string): Promise<string> {
  const url = EXPORT_URL_TEMPLATE.replace("{id}", encodeURIComponent(docId));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "AI-News-Chatbot/1.0" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    // 로그인 페이지(HTML)로 리다이렉트되면 공개가 아니라는 신호
    if (contentType.includes("text/html")) {
      throw new Error("문서가 공개 공유되어 있지 않습니다. 링크 공유를 '링크가 있는 모든 사용자'로 설정하세요.");
    }
    const text = await res.text();
    return text.replace(/^\uFEFF/, "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSingleReference(docId: string): Promise<ReferenceDocument | null> {
  const cached = cache.get(docId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const raw = await fetchDocText(docId);
    if (!raw) return null;
    const truncated = raw.length > MAX_TEXT_LENGTH;
    const text = truncated ? raw.slice(0, MAX_TEXT_LENGTH) : raw;
    const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? "Google Docs 참고 문서";
    const fileName = `Google Docs: ${firstLine.trim().slice(0, 60)}`;
    const value: ReferenceDocument = { fileName, text, truncated };
    cache.set(docId, { value, fetchedAt: now });
    return value;
  } catch (err) {
    console.error(`[googleDocs] fetch 실패 docId=${docId}:`, err);
    // stale-while-error: 만료된 캐시라도 있으면 사용
    if (cached) return cached.value;
    return null;
  }
}

/**
 * 설정된 모든 참고 문서를 병렬로 가져온다.
 * 하나라도 실패해도 나머지는 정상 반환.
 */
export async function loadReferenceDocuments(): Promise<ReferenceDocument[]> {
  const ids = resolveDocIds();
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => fetchSingleReference(id)));
  return results.filter((r): r is ReferenceDocument => r !== null);
}

/**
 * 전역 기본 문서 + 해당 사용자가 등록한 활성 Google Docs 링크를 함께 로드.
 * `personaId` 가 주어지면 해당 페르소나에 스코핑된 문서만 포함한다.
 *   - 문서의 personaIds 가 비어 있거나 누락된 경우: 모든 페르소나에 적용 (기존 동작과 호환)
 *   - 문서의 personaIds 에 현재 personaId 가 포함된 경우: 적용
 *   - 그 외: 제외
 * Firestore 조회 실패 시에도 전역 문서만이라도 반환한다.
 */
export async function loadReferenceDocumentsForUser(
  uid: string | null | undefined,
  personaId?: string | null
): Promise<ReferenceDocument[]> {
  const globalIds = resolveDocIds();
  let userIds: string[] = [];
  if (uid) {
    try {
      // 동적 import — 클라이언트 번들에 admin SDK 가 섞이지 않도록.
      const { getAdminDb } = await import("./firebase-admin");
      const snap = await getAdminDb()
        .collection("userReferenceDocs")
        .where("uid", "==", uid)
        .where("active", "==", true)
        .limit(MAX_USER_DOCS)
        .get();
      userIds = snap.docs
        .filter((d) => {
          if (!personaId) return true;
          const raw = d.data().personaIds;
          if (!Array.isArray(raw) || raw.length === 0) return true;
          return raw.map(String).includes(personaId);
        })
        .map((d) => String(d.data().googleDocId || ""))
        .filter(Boolean);
    } catch (err) {
      console.error("[googleDocs] 사용자 참조 문서 조회 실패:", err);
    }
  }
  const allIds = Array.from(new Set([...globalIds, ...userIds]));
  if (allIds.length === 0) return [];
  const results = await Promise.all(allIds.map((id) => fetchSingleReference(id)));
  return results.filter((r): r is ReferenceDocument => r !== null);
}

/**
 * 특정 Google Docs ID 가 실제로 공개 공유되어 있고 fetch 가능한지 검증.
 * 등록 API 에서 사용자에게 즉시 피드백을 주기 위함.
 */
export async function validateGoogleDoc(docId: string): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  try {
    const raw = await fetchDocText(docId);
    if (!raw) return { ok: false, error: "문서가 비어 있습니다." };
    const firstLine = raw.split("\n").find((l) => l.trim().length > 0) ?? docId;
    return { ok: true, title: firstLine.trim().slice(0, 100) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
