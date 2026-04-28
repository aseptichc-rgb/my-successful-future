"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { useAuth } from "@/lib/auth-context";
import { useCustomPersonas } from "@/hooks/useCustomPersonas";
import { usePersonaOverrides } from "@/hooks/usePersonaOverrides";
import { getPersona } from "@/lib/personas";
import type { BuiltinPersonaId, PersonaId } from "@/types";

interface ReferenceDocItem {
  id: string;
  googleDocId: string;
  title: string;
  active: boolean;
  personaIds: string[];
  createdAt: number | null;
}

interface PersonaOption {
  id: PersonaId;
  name: string;
  icon: string;
}

// 자문단 UI 에 노출되는 빌트인 페르소나 (future-self 는 별도 홈이라 제외)
const BUILTIN_ADVISOR_IDS: BuiltinPersonaId[] = [
  "entrepreneur",
  "fund-trader",
  "tech-cto",
  "policy-analyst",
  "healthcare-expert",
  "default",
];

/**
 * 사용자별 Google Docs 참조 링크 관리 패널.
 * 각 문서는 전체 페르소나 적용(기본) 또는 특정 자문단 한정 적용을 선택할 수 있다.
 * 등록된 링크는 서버가 5분 캐시로 fetch 하여 해당 페르소나 대화 시 시스템 프롬프트에 주입한다.
 */
export default function ReferenceDocsPanel() {
  const { firebaseUser } = useAuth();
  const { list: customList } = useCustomPersonas(firebaseUser?.uid);
  const { map: overrideMap } = usePersonaOverrides(firebaseUser?.uid);

  const [items, setItems] = useState<ReferenceDocItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");
  const [newPersonaIds, setNewPersonaIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scopeEditId, setScopeEditId] = useState<string | null>(null);

  const personaOptions = useMemo<PersonaOption[]>(() => {
    const builtins: PersonaOption[] = BUILTIN_ADVISOR_IDS.map((id) => {
      const p = getPersona(id, undefined, overrideMap);
      return { id, name: p.name, icon: p.icon };
    });
    const customs: PersonaOption[] = customList.map((cp) => ({
      id: cp.id,
      name: cp.name,
      icon: cp.icon,
    }));
    return [...builtins, ...customs];
  }, [customList, overrideMap]);

  const personaLabel = useCallback(
    (id: string): string => {
      const match = personaOptions.find((p) => p.id === id);
      if (match) return `${match.icon} ${match.name}`;
      if (id.startsWith("custom:")) return "🗒 (삭제된 멘토)";
      return id;
    },
    [personaOptions]
  );

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
      setItems(data.items.map((i) => ({ ...i, personaIds: i.personaIds ?? [] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ url: input, personaIds: newPersonaIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `등록 실패 (HTTP ${res.status})`);
      }
      setUrl("");
      setNewPersonaIds([]);
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

  async function updatePersonaScope(item: ReferenceDocItem, nextIds: string[]) {
    try {
      const res = await authedFetch(`/api/reference-docs/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ personaIds: nextIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "범위 수정 실패");
      }
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, personaIds: nextIds } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "범위 수정 실패");
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

  function togglePersonaIn(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
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
          문서별로 적용할 자문단을 지정할 수 있습니다 (미지정 시 전체 적용, 5분 캐시)
        </span>
      </div>

      {open && (
        <div className="mx-auto mt-2 max-w-3xl space-y-2">
          <form onSubmit={addDoc} className="space-y-1.5">
            <div className="flex gap-1.5">
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
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-gray-500 mr-1">
                적용 자문단 (미선택 = 전체):
              </span>
              {personaOptions.map((p) => {
                const on = newPersonaIds.includes(p.id as string);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNewPersonaIds((prev) => togglePersonaIn(prev, p.id as string))}
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                      on
                        ? "border-blue-500 bg-blue-100 text-blue-800"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p.icon} {p.name}
                  </button>
                );
              })}
            </div>
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
            items.map((item) => {
              const editing = scopeEditId === item.id;
              const scoped = item.personaIds && item.personaIds.length > 0;
              return (
                <div
                  key={item.id}
                  className={`rounded-md border px-2 py-1 ${
                    item.active ? "border-blue-200 bg-white" : "border-gray-200 bg-gray-100 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2">
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
                        onClick={() => setScopeEditId(editing ? null : item.id)}
                        className="rounded px-2 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                      >
                        {editing ? "완료" : "범위"}
                      </button>
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

                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {!editing ? (
                      scoped ? (
                        item.personaIds.map((pid) => (
                          <span
                            key={pid}
                            className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700"
                          >
                            {personaLabel(pid)}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-400">전체 자문단 적용</span>
                      )
                    ) : (
                      personaOptions.map((p) => {
                        const on = item.personaIds.includes(p.id as string);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              updatePersonaScope(item, togglePersonaIn(item.personaIds, p.id as string))
                            }
                            className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                              on
                                ? "border-blue-500 bg-blue-100 text-blue-800"
                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {p.icon} {p.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
