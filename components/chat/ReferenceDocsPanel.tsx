"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth_ } from "@/lib/firebase";

interface ReferenceDocItem {
  id: string;
  googleDocId: string;
  title: string;
  active: boolean;
  createdAt: number | null;
}

/**
 * 사용자별 Google Docs 참조 링크 관리 패널.
 * 등록된 링크는 서버가 5분 캐시로 fetch 하여 대화 시 시스템 프롬프트에 주입한다.
 */
export default function ReferenceDocsPanel() {
  const [items, setItems] = useState<ReferenceDocItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authedFetch = useCallback(async (input: string, init: RequestInit = {}): Promise<Response> => {
    const user = getAuth_().currentUser;
    if (!user) throw new Error("로그인이 필요합니다.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(input, { ...init, headers });
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/reference-docs");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `조회 실패 (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { items: ReferenceDocItem[] };
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (open) loadItems();
  }, [open, loadItems]);

  async function addDoc(e: React.FormEvent) {
    e.preventDefault();
    const input = url.trim();
    if (!input) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/reference-docs", {
        method: "POST",
        body: JSON.stringify({ url: input }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `등록 실패 (HTTP ${res.status})`);
      }
      setUrl("");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(item: ReferenceDocItem) {
    try {
      const res = await authedFetch(`/api/reference-docs/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "변경 실패");
      }
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, active: !x.active } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경 실패");
    }
  }

  async function removeDoc(item: ReferenceDocItem) {
    if (!confirm(`"${item.title}" 참조 문서를 삭제할까요?`)) return;
    try {
      const res = await authedFetch(`/api/reference-docs/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "삭제 실패");
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  const activeCount = items.filter((i) => i.active).length;

  return (
    <div className="border-b border-gray-200 bg-blue-50/40 px-3 py-1.5 text-[11px] sm:px-4 sm:py-2 sm:text-xs">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-gray-700 hover:bg-blue-100"
        >
          🔗 <span className="hidden sm:inline">Google Docs 참조</span>
          <span className="sm:hidden">Docs</span>
          {activeCount > 0 ? ` (${activeCount})` : ""}
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </button>
        <span className="hidden sm:inline text-[10px] text-gray-500">
          등록한 문서 내용을 AI 가 자동으로 참고합니다 (5분 캐시)
        </span>
      </div>

      {open && (
        <div className="mx-auto mt-2 max-w-3xl space-y-2">
          <form onSubmit={addDoc} className="flex gap-1.5">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Google Docs 공유 링크 붙여넣기"
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-900"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || url.trim().length === 0}
              className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "등록 중..." : "+ 추가"}
            </button>
          </form>

          {error && (
            <div className="rounded-md bg-red-50 px-2 py-1 text-red-700">{error}</div>
          )}

          {loading ? (
            <p className="text-gray-500">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500">
              등록된 참조 문서가 없습니다. 문서는 &quot;링크가 있는 모든 사용자&quot; 공유로
              설정되어야 합니다.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                  item.active ? "border-blue-200 bg-white" : "border-gray-200 bg-gray-100 opacity-60"
                }`}
              >
                <a
                  href={`https://docs.google.com/document/d/${item.googleDocId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium text-gray-900 hover:underline"
                  title={item.title}
                >
                  📘 {item.title}
                </a>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleActive(item)}
                    className={`rounded px-2 py-0.5 text-[10px] ${
                      item.active
                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    {item.active ? "AI 참고 ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDoc(item)}
                    className="rounded px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-100"
                  >
                    삭제
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
