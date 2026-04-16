"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth_ } from "@/lib/firebase";
import type { PersonaId } from "@/types";

interface RefDocItem {
  id: string;
  googleDocId: string;
  title: string;
  active: boolean;
  personaIds: string[];
}

interface Props {
  personaId: PersonaId;
  personaName: string;
  personaIcon: string;
  onClose: () => void;
}

/**
 * 특정 페르소나(챗봇) 가 참고할 Google Docs 문서를 관리하는 모달.
 *
 * "이 자문단이 어떤 문서를 배경지식으로 가지고 있는가?" 관점의 UI.
 * - 이 페르소나에 할당된 문서 + 전체 적용 문서를 함께 보여줌
 * - 새 문서를 추가하면 자동으로 이 페르소나에 할당
 * - 기존 전체 적용 문서도 이 페르소나에서 해제 가능
 */
export default function PersonaRefDocsModal({ personaId, personaName, personaIcon, onClose }: Props) {
  const [allDocs, setAllDocs] = useState<RefDocItem[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/reference-docs");
      if (!res.ok) throw new Error("조회 실패");
      const data = (await res.json()) as { items: RefDocItem[] };
      setAllDocs(data.items.map((i) => ({ ...i, personaIds: i.personaIds ?? [] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const pid = personaId as string;

  // 이 페르소나에 적용되는 문서: personaIds 가 비었거나(전체 적용) pid 를 포함
  const assignedDocs = allDocs.filter(
    (d) => d.active && (d.personaIds.length === 0 || d.personaIds.includes(pid))
  );

  // 이 페르소나에 적용되지 않는 문서 (다른 페르소나 전용)
  const unassignedDocs = allDocs.filter(
    (d) => d.active && d.personaIds.length > 0 && !d.personaIds.includes(pid)
  );

  async function addDocForPersona(e: React.FormEvent) {
    e.preventDefault();
    const input = url.trim();
    if (!input) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/reference-docs", {
        method: "POST",
        body: JSON.stringify({ url: input, personaIds: [pid] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "등록 실패");
      }
      setUrl("");
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function assignToPersona(doc: RefDocItem) {
    try {
      const nextIds = doc.personaIds.length === 0
        ? [pid] // 전체 적용 문서를 이 페르소나 전용으로 변환 → 데이터 유실 가능 → 대신 추가만
        : [...doc.personaIds, pid];
      // 전체 적용 문서(personaIds=[])에 페르소나를 추가하면 범위가 좁혀지므로,
      // 이 경우는 그냥 pid 를 append 하되 빈 배열은 그대로 유지 (전체+이 페르소나 이미 포함)
      if (doc.personaIds.length === 0) return; // 이미 적용 중
      const res = await authedFetch(`/api/reference-docs/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ personaIds: nextIds }),
      });
      if (!res.ok) throw new Error("할당 실패");
      setAllDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, personaIds: nextIds } : d))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "할당 실패");
    }
  }

  async function unassignFromPersona(doc: RefDocItem) {
    try {
      const nextIds = doc.personaIds.filter((id) => id !== pid);
      const res = await authedFetch(`/api/reference-docs/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ personaIds: nextIds }),
      });
      if (!res.ok) throw new Error("해제 실패");
      setAllDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, personaIds: nextIds } : d))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "해제 실패");
    }
  }

  async function removeDoc(doc: RefDocItem) {
    if (!confirm(`"${doc.title}" 문서를 완전히 삭제할까요?`)) return;
    try {
      const res = await authedFetch(`/api/reference-docs/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      setAllDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{personaIcon}</span>
            <div>
              <h2 className="text-sm font-bold text-gray-900">{personaName}의 참조 문서</h2>
              <p className="text-[11px] text-gray-500">이 자문단이 배경지식으로 참고하는 문서</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* 새 문서 추가 */}
          <form onSubmit={addDocForPersona} className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Google Docs 공유 링크 붙여넣기"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || url.trim().length === 0}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "..." : "추가"}
            </button>
          </form>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {/* 현재 이 자문단에 적용 중인 문서 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-gray-700">
              📘 적용 중인 문서 ({assignedDocs.length})
            </h3>
            {loading ? (
              <p className="text-xs text-gray-400">불러오는 중...</p>
            ) : assignedDocs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                이 자문단에 할당된 참조 문서가 없습니다.
              </div>
            ) : (
              <div className="space-y-1.5">
                {assignedDocs.map((doc) => {
                  const isGlobal = doc.personaIds.length === 0;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2"
                    >
                      <a
                        href={`https://docs.google.com/document/d/${doc.googleDocId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 hover:underline"
                        title={doc.title}
                      >
                        {doc.title}
                      </a>
                      {isGlobal && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                          전체 적용
                        </span>
                      )}
                      {!isGlobal && (
                        <button
                          type="button"
                          onClick={() => unassignFromPersona(doc)}
                          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] text-orange-600 hover:bg-orange-50"
                        >
                          해제
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeDoc(doc)}
                        className="shrink-0 rounded-md px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 다른 자문단 전용 문서 (이 자문단에 추가 가능) */}
          {!loading && unassignedDocs.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-gray-500">
                📄 다른 자문단 전용 문서 (이 자문단에도 추가 가능)
              </h3>
              <div className="space-y-1.5">
                {unassignedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-600">
                      {doc.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => assignToPersona(doc)}
                      className="shrink-0 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200"
                    >
                      + 이 자문단에 추가
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 안내 */}
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-[10px] text-gray-400">
            문서는 &quot;링크가 있는 모든 사용자&quot; 공유 설정이 필요합니다. 서버가 5분마다 최신 내용을 자동 갱신합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
