"use client";

/**
 * 어드민 명언 관리 — /admin/quotes
 *
 * 큐레이션 명언(famousQuotes) 의 CRUD UI.
 * - 시드 동기화 버튼: lib/famousQuotesSeed.ts → Firestore 일괄 적용
 * - 추가/수정/삭제/활성 토글
 *
 * 권한: 서버 측에서 ADMIN_EMAILS 환경변수로 검증 (각 API 가 401/403 처리).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/authedFetch";
import type { FamousQuote, FamousQuoteCategory, FamousQuoteLang } from "@/types";

const CATEGORY_LABEL: Record<FamousQuoteCategory, string> = {
  philosophy: "철학",
  entrepreneur: "기업가",
  classic: "한시·고전",
  leader: "리더",
  scientist: "과학자",
  literature: "문학",
  personal: "본인",
};

const ALL_CATEGORIES: FamousQuoteCategory[] = [
  "philosophy",
  "entrepreneur",
  "classic",
  "leader",
  "scientist",
  "literature",
  "personal",
];

interface Draft {
  text: string;
  author: string;
  category: FamousQuoteCategory;
  language: FamousQuoteLang;
  tags: string;
}

const EMPTY_DRAFT: Draft = {
  text: "",
  author: "",
  category: "philosophy",
  language: "ko",
  tags: "",
};

export default function AdminQuotesPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [items, setItems] = useState<FamousQuote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [filter, setFilter] = useState<"all" | FamousQuoteCategory>("all");
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, firebaseUser]);

  async function refreshList() {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/famous-quotes");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `요청 실패 (${res.status})`);
      }
      setItems((data as { items: FamousQuote[] }).items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (draft.text.trim().length < 5) {
      setError("문장을 5자 이상 입력하세요.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const res = await authedFetch("/api/admin/famous-quotes", {
        method: "POST",
        body: JSON.stringify({
          text: draft.text,
          author: draft.author.trim() || null,
          category: draft.category,
          language: draft.language,
          tags: draft.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `요청 실패 (${res.status})`);
      }
      setDraft(EMPTY_DRAFT);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleActive(item: FamousQuote) {
    setBusy(`toggle:${item.id}`);
    try {
      const res = await authedFetch(`/api/admin/famous-quotes/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `요청 실패 (${res.status})`);
      }
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(item: FamousQuote) {
    if (!confirm(`정말 삭제할까요?\n\n"${item.text.slice(0, 40)}..."`)) return;
    setBusy(`delete:${item.id}`);
    try {
      const res = await authedFetch(`/api/admin/famous-quotes/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `요청 실패 (${res.status})`);
      }
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleSeed() {
    if (!confirm("코드에 정의된 시드를 Firestore 에 동기화합니다 (기존 데이터는 보존). 진행할까요?")) {
      return;
    }
    setBusy("seed");
    setSeedMsg(null);
    try {
      const res = await authedFetch("/api/admin/seed-famous-quotes", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `요청 실패 (${res.status})`);
      }
      setSeedMsg(`동기화 완료: ${(data as { written: number }).written}건`);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((q) => q.category === filter);
  }, [items, filter]);

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F0EDE6] px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
            큐레이션 명언 관리
          </h1>
          <p className="text-[13px] text-black/60">
            안드로이드 위젯·메인 앱이 &ldquo;오늘의 한 마디&rdquo; 와 함께 회전 노출하는 명언 풀입니다.
            (전체 {items.length}건)
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {seedMsg && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {seedMsg}
          </div>
        )}

        {/* 시드 동기화 + 필터 */}
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-black/[0.06] bg-white p-4">
          <button
            type="button"
            onClick={handleSeed}
            disabled={busy === "seed"}
            className="rounded-lg bg-[#1E1B4B] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {busy === "seed" ? "동기화 중…" : "코드 시드 → Firestore 동기화"}
          </button>
          <div className="ml-auto flex items-center gap-2 text-[13px]">
            <label className="text-black/60">카테고리:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-[13px]"
            >
              <option value="all">전체</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* 새 명언 추가 */}
        <section className="rounded-xl border border-black/[0.06] bg-white p-5">
          <h2 className="mb-3 text-[16px] font-semibold text-[#1E1B4B]">새 명언 추가</h2>
          <div className="flex flex-col gap-3">
            <textarea
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              placeholder="명언 본문 (5~280자)"
              rows={3}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-[14px]"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
                placeholder="저자 (선택)"
                className="rounded-md border border-black/10 px-3 py-2 text-[14px]"
              />
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="태그 (쉼표 구분, 선택)"
                className="rounded-md border border-black/10 px-3 py-2 text-[14px]"
              />
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as FamousQuoteCategory })
                }
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-[14px]"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <select
                value={draft.language}
                onChange={(e) =>
                  setDraft({ ...draft, language: e.target.value as FamousQuoteLang })
                }
                className="rounded-md border border-black/10 bg-white px-3 py-2 text-[14px]"
              >
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy === "create"}
                className="rounded-lg bg-[#1E1B4B] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
              >
                {busy === "create" ? "추가 중…" : "추가"}
              </button>
            </div>
          </div>
        </section>

        {/* 목록 */}
        <section className="rounded-xl border border-black/[0.06] bg-white p-5">
          <h2 className="mb-3 text-[16px] font-semibold text-[#1E1B4B]">
            목록 ({filtered.length}건)
          </h2>
          {filtered.length === 0 ? (
            <p className="text-sm text-black/60">표시할 명언이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((q) => (
                <li
                  key={q.id}
                  className={`rounded-lg border px-4 py-3 ${
                    q.active
                      ? "border-black/10 bg-white"
                      : "border-black/5 bg-black/[0.03] opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-[14px] leading-relaxed text-[#1E1B4B]">{q.text}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-black/60">
                        <span>{q.author || "(미상)"}</span>
                        <span className="rounded-full border border-black/10 px-2 py-0.5">
                          {CATEGORY_LABEL[q.category] || q.category}
                        </span>
                        <span className="text-black/40">[{q.language}]</span>
                        {q.tags && q.tags.length > 0 && (
                          <span className="text-black/50">#{q.tags.join(" #")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(q)}
                        disabled={busy === `toggle:${q.id}`}
                        className="rounded-md border border-black/10 px-2 py-1 text-[12px] hover:bg-black/[0.03] disabled:opacity-50"
                      >
                        {q.active ? "비활성화" : "활성화"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(q)}
                        disabled={busy === `delete:${q.id}`}
                        className="rounded-md border border-red-200 px-2 py-1 text-[12px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
