"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuth_ } from "@/lib/firebase";

interface Props {
  sessionId: string;
  ownerName?: string;
  onClose: () => void;
}

interface TokenSummary {
  id: string;
  ownerUid: string;
  ownerName?: string | null;
  label?: string | null;
  expiresAt: number | null;
  revoked: boolean;
  useCount: number;
  maxUses: number | null;
  lastUsedAt: number | null;
  createdAt: number | null;
}

const SAMPLE_HOST = typeof window !== "undefined" ? window.location.origin : "https://your-domain";

export default function PushTokenModal({ sessionId, ownerName, onClose }: Props) {
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [maxUses, setMaxUses] = useState<number | "">("");

  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [issuedLabel, setIssuedLabel] = useState<string>("");
  const [copyMsg, setCopyMsg] = useState<string>("");

  const authedFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const u = getAuth_().currentUser;
    if (!u) throw new Error("로그인이 필요합니다.");
    const t = await u.getIdToken();
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${t}`);
    return fetch(input, { ...init, headers });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/push-token?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || "조회 실패");
      }
      const json = (await res.json()) as { tokens: TokenSummary[] };
      setTokens(json.tokens || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [sessionId, authedFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function issue() {
    setError(null);
    try {
      const res = await authedFetch("/api/push-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          label: label || undefined,
          expiresInDays,
          maxUses: maxUses === "" ? undefined : Number(maxUses),
          ownerName,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || "발급 실패");
      }
      const json = (await res.json()) as { token: string; label?: string | null };
      setIssuedToken(json.token);
      setIssuedLabel(json.label || label || "");
      setLabel("");
      setMaxUses("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "발급 실패");
    }
  }

  async function revoke(id: string) {
    if (!confirm("이 토큰을 폐기할까요? 이후 푸시는 차단됩니다.")) return;
    try {
      const res = await authedFetch(`/api/push-token/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || "폐기 실패");
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "폐기 실패");
    }
  }

  // 친구에게 공유할 마법사 페이지 URL (토큰은 fragment 에 — 서버 로그 미노출)
  const shareUrl = issuedToken
    ? `${SAMPLE_HOST}/connect#token=${encodeURIComponent(issuedToken)}${
        issuedLabel ? `&label=${encodeURIComponent(issuedLabel)}` : ""
      }`
    : "";

  function copy(text: string, msg = "복사됨") {
    navigator.clipboard.writeText(text);
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(""), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">🔑 외부 푸시 토큰 (Claude Code 등)</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          이 토큰을 받은 사람의 Claude Code/스크립트가 결과물을 이 채팅방에 직접 푸시할 수 있습니다.
          토큰은 발급 직후 한 번만 표시되니 안전하게 전달하세요.
        </p>

        {/* 발급 폼 */}
        <div className="mt-4 rounded-lg border border-gray-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-gray-700">
              라벨 (선택)
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                placeholder="예: 친구A의 Claude Code"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-gray-700">
              만료 (일)
              <input
                type="number"
                min={1}
                max={90}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-gray-700">
              최대 사용 횟수 (선택)
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="무제한"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={issue}
            className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            토큰 발급
          </button>
        </div>

        {/* 발급 결과 — 친구에게 보낼 링크가 메인 */}
        {issuedToken && shareUrl && (
          <div className="mt-4 rounded-lg border border-green-300 bg-green-50 p-3">
            <p className="text-sm font-semibold text-green-900">
              ✅ 친구에게 이 링크 하나만 보내주세요
            </p>
            <p className="mt-1 text-[11px] text-green-800">
              친구가 링크를 열면 안내된 화면에서 결과 붙여넣기 또는 자동 연결을 한 번에 할 수 있어요.
              (이 창을 닫으면 링크는 다시 만들 수 없으니 지금 복사 또는 공유하세요)
            </p>
            <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-[11px] text-gray-900">
              {shareUrl}
            </code>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                onClick={() => copy(shareUrl, "링크 복사됨")}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                🔗 링크 복사
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent("채팅방 결과 보내기 링크")}&body=${encodeURIComponent(`아래 링크를 열어서 결과물을 보내주세요:\n\n${shareUrl}\n\n링크 안에 있는 안내를 따라 클릭만 하면 됩니다.`)}`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                ✉️ 메일로 보내기
              </a>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={() =>
                    navigator
                      .share({ title: "채팅방 결과 보내기", url: shareUrl })
                      .catch(() => {})
                  }
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  📤 공유
                </button>
              )}
              {copyMsg && (
                <span className="self-center text-[11px] text-green-700">{copyMsg}</span>
              )}
            </div>

            <details className="mt-3 text-[11px]">
              <summary className="cursor-pointer text-green-900">
                🔑 원시 토큰 보기 (개발자/직접 호출용)
              </summary>
              <code className="mt-1 block break-all rounded bg-white p-2 font-mono text-gray-900">
                {issuedToken}
              </code>
              <button
                onClick={() => copy(issuedToken)}
                className="mt-1 underline text-green-700"
              >
                토큰 복사
              </button>
            </details>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
        )}

        {/* 토큰 목록 */}
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900">발급 내역</h3>
          {loading && <p className="mt-2 text-xs text-gray-500">불러오는 중...</p>}
          {!loading && tokens.length === 0 && (
            <p className="mt-2 text-xs text-gray-500">발급된 토큰이 없습니다.</p>
          )}
          <ul className="mt-2 space-y-1">
            {tokens.map((t) => {
              const expired = t.expiresAt && t.expiresAt < Date.now();
              const exhausted = typeof t.maxUses === "number" && t.useCount >= t.maxUses;
              const dead = t.revoked || expired || exhausted;
              return (
                <li
                  key={t.id}
                  className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                    dead ? "border-gray-200 bg-gray-100 opacity-60" : "border-blue-200 bg-white"
                  }`}
                >
                  <span className="font-medium text-gray-900">
                    {t.label || "(라벨 없음)"}
                  </span>
                  <span className="text-gray-500">
                    {t.useCount}회 사용
                    {t.maxUses ? ` / 최대 ${t.maxUses}회` : ""}
                  </span>
                  <span className="text-gray-500">
                    만료: {t.expiresAt ? new Date(t.expiresAt).toLocaleString() : "-"}
                  </span>
                  {t.revoked && <span className="text-red-600">폐기됨</span>}
                  {expired && !t.revoked && <span className="text-red-600">만료</span>}
                  {exhausted && !t.revoked && !expired && (
                    <span className="text-red-600">사용량 소진</span>
                  )}
                  {!t.revoked && (
                    <button
                      onClick={() => revoke(t.id)}
                      className="ml-auto rounded px-2 py-0.5 text-red-600 hover:bg-red-100"
                    >
                      폐기
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
