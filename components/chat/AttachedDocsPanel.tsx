"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { getAuth_, getDb_ } from "@/lib/firebase";
import type { SessionDocument, SessionDocumentScope } from "@/types";

interface Props {
  sessionId: string;
  currentUid: string;
  currentName?: string;
}

const ACCEPT = ".md,.markdown,.txt,text/plain,text/markdown,application/pdf,.pdf";

export default function AttachedDocsPanel({ sessionId, currentUid, currentName }: Props) {
  const [docs, setDocs] = useState<SessionDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SessionDocumentScope>("session");
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId || !currentUid) return;
    // participants 로도 필터링해야 Firestore 보안 규칙(resource.data.participants 검사)이
    // 쿼리 단계에서 통과한다. 빈 컬렉션이라도 규칙 평가는 일어남.
    const q = query(
      collection(getDb_(), "sessionDocuments"),
      where("sessionId", "==", sessionId),
      where("participants", "array-contains", currentUid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SessionDocument[] = snap.docs.map((d) => {
          const data = d.data() as Omit<SessionDocument, "id" | "extractedText"> & {
            createdAt: Timestamp;
          };
          // 클라이언트에는 extractedText 노출 X (필요시만 별도 fetch)
          return { id: d.id, ...data, extractedText: "" } as SessionDocument;
        });
        setDocs(list);
      },
      (err) => {
        console.error("docs snapshot error:", err);
      }
    );
    return () => unsub();
  }, [sessionId, currentUid]);

  const activeCount = docs.filter((d) => d.active).length;

  async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const user = getAuth_().currentUser;
    if (!user) throw new Error("로그인이 필요합니다.");
    const token = await user.getIdToken();
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sessionId", sessionId);
      fd.append("scope", scope);
      if (currentName) fd.append("ownerName", currentName);

      const res = await authedFetch("/api/document/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `업로드 실패 (HTTP ${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleActive(doc: SessionDocument) {
    try {
      const res = await authedFetch(`/api/document/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !doc.active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "변경 실패");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경 실패");
    }
  }

  async function removeDoc(doc: SessionDocument) {
    if (!confirm(`"${doc.fileName}" 첨부를 삭제할까요?`)) return;
    try {
      const res = await authedFetch(`/api/document/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "삭제 실패");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  return (
    <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-gray-700 hover:bg-gray-200"
        >
          📎 첨부 문서{activeCount > 0 ? ` (${activeCount})` : ""}
          <span className="text-gray-400">{open ? "▲" : "▼"}</span>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-md bg-blue-600 px-2 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "+ 파일 추가"}
        </button>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as SessionDocumentScope)}
          className="rounded-md border border-gray-300 bg-white px-1 py-1 text-gray-700"
          title="첨부 범위"
        >
          <option value="session">세션 전체</option>
          <option value="message">다음 1개 메시지만</option>
        </select>
        <span className="ml-auto text-[10px] text-gray-500">
          .md / .txt / .pdf · 최대 5MB
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {error && (
        <div className="mx-auto mt-1 max-w-3xl rounded-md bg-red-50 px-2 py-1 text-red-700">
          {error}
        </div>
      )}

      {open && (
        <div className="mx-auto mt-2 max-w-3xl space-y-1">
          {docs.length === 0 && (
            <p className="text-gray-500">첨부된 문서가 없습니다.</p>
          )}
          {docs.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                d.active ? "border-blue-200 bg-white" : "border-gray-200 bg-gray-100 opacity-60"
              }`}
            >
              <span className="truncate font-medium text-gray-900" title={d.fileName}>
                {d.mime === "application/pdf" ? "📕" : "📄"} {d.fileName}
              </span>
              <span className="text-[10px] text-gray-500">
                {d.charCount.toLocaleString()}자
                {d.truncated && " · 일부만 첨부"}
                {d.scope === "message" && " · 1회용"}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleActive(d)}
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    d.active
                      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {d.active ? "AI 사용 ON" : "OFF"}
                </button>
                {d.ownerUid === currentUid && (
                  <button
                    type="button"
                    onClick={() => removeDoc(d)}
                    className="rounded px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-100"
                  >
                    삭제
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
