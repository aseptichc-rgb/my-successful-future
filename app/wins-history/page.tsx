"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getDailyWinsHistory, WINS_HISTORY_DEFAULT_LIMIT } from "@/lib/firebase";

function formatKstDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

const IconBack = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export default function WinsHistoryPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [entries, setEntries] = useState<{ ymd: string; wins: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
    }
  }, [authLoading, firebaseUser, router]);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await getDailyWinsHistory(uid, WINS_HISTORY_DEFAULT_LIMIT);
      setEntries(list);
    } catch (err) {
      console.error("잘한 일 히스토리 조회 실패:", err);
      setError("기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    void load(firebaseUser.uid);
  }, [firebaseUser, load]);

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#F0EDE6] pb-8">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto flex max-w-3xl items-start gap-3">
          <button
            type="button"
            onClick={() => router.push("/home")}
            aria-label="뒤로가기"
            className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#1E1B4B] shadow-apple transition-colors hover:bg-[#F7F4ED]"
          >
            <IconBack className="h-[18px] w-[18px]" />
          </button>
          <div>
            <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
              잘한 일 기록
            </h1>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
              지금까지 스스로를 칭찬한 기록이에요. 최신 날짜부터 보여드려요.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-3 px-4 py-5 sm:px-6">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-[12px] bg-rose-50 px-4 py-3 text-[13px] tracking-[-0.01em] text-rose-700">
            {error}
            <button
              type="button"
              onClick={() => firebaseUser && load(firebaseUser.uid)}
              className="ml-2 underline underline-offset-2"
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="rounded-[16px] border border-dashed border-black/15 bg-white px-5 py-10 text-center">
            <p className="text-[14px] tracking-[-0.01em] text-black/60">
              아직 저장된 기록이 없어요.
            </p>
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="mt-3 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766]"
            >
              오늘의 잘한 일 적으러 가기
            </button>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.ymd}
                className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                    {formatKstDate(entry.ymd)}
                  </h2>
                  <span className="text-[12px] tracking-[-0.01em] text-black/48">
                    {entry.wins.length}가지
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {entry.wins.map((win, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0EDE6] text-[11px] font-semibold text-[#1E1B4B]">
                        {idx + 1}
                      </span>
                      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] leading-[1.5] tracking-[-0.01em] text-[#1E1B4B]">
                        {win}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
