"use client";

import { useMemo } from "react";
import type { IdentityProgress, UserIdentities } from "@/types";

interface IdentityProgressProps {
  /**
   * 사용자가 가진 정체성 라벨 풀 (3~5개). 첫 응답 전에도 빈 카드를 보여주려고 받는다.
   * 미정의면 풀 자체가 없다는 뜻 — 여전히 entries 만으로 렌더한다.
   */
  identities?: UserIdentities;
  /** Firestore 의 identityProgress 컬렉션 스냅샷. 라벨 누적 +1 시 즉시 갱신. */
  entries: IdentityProgress[];
}

const RECENT_PREVIEW = 3;

interface LabelRow {
  identityTag: string;
  count: number;
  recent: string[];
}

/**
 * 라벨 풀과 진행도를 합쳐 정렬된 행으로 만든다.
 * - 풀에 있지만 응답 0인 라벨도 빈 행으로 노출 → "다음에 강화할 정체성" 가시화.
 * - 응답 카운트 내림차순, 동률은 라벨 가나다 순.
 */
function buildRows(identities: UserIdentities | undefined, entries: IdentityProgress[]): LabelRow[] {
  const byTag = new Map<string, IdentityProgress>();
  for (const e of entries) {
    if (e?.identityTag) byTag.set(e.identityTag, e);
  }
  const tags = new Set<string>();
  if (identities?.labels) for (const l of identities.labels) tags.add(l);
  for (const e of entries) if (e?.identityTag) tags.add(e.identityTag);

  const rows: LabelRow[] = Array.from(tags).map((tag) => {
    const e = byTag.get(tag);
    return {
      identityTag: tag,
      count: e?.count ?? 0,
      recent: Array.isArray(e?.recentResponses) ? e!.recentResponses.slice(0, RECENT_PREVIEW) : [],
    };
  });

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.identityTag.localeCompare(b.identityTag, "ko");
  });
  return rows;
}

export default function IdentityProgressView({ identities, entries }: IdentityProgressProps) {
  const rows = useMemo(() => buildRows(identities, entries), [identities, entries]);
  const totalEvidences = useMemo(
    () => rows.reduce((sum, r) => sum + r.count, 0),
    [rows],
  );

  return (
    <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
          <svg
            className="h-[18px] w-[18px] text-[#1E1B4B]/70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2l2.4 5 5.6.8-4 3.9 1 5.6L12 14.8 7 17.3l1-5.6L4 7.8l5.6-.8L12 2z" />
          </svg>
          나는 어떤 사람인가
        </h2>
        <span className="text-[12px] tracking-[-0.01em] text-black/48">
          누적 증거 {totalEvidences}개
        </span>
      </div>
      <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
        매일 카드 미션에 한 줄 답할 때마다, 당신이 어떤 사람인지에 대한 증거가 한 칸씩 쌓입니다.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-[12px] border border-dashed border-black/15 bg-[#F7F4ED] px-4 py-5 text-center text-[13px] leading-[1.5] tracking-[-0.01em] text-black/50">
          오늘 첫 응답을 남기면, 당신의 정체성 카드가 여기 채워집니다.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li
              key={r.identityTag}
              className="rounded-[12px] border border-black/[0.06] bg-[#F7F4ED] px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-semibold leading-[1.4] tracking-[-0.015em] text-[#1E1B4B]">
                  나는 <span>{r.identityTag}</span>입니다
                </p>
                <span
                  className={`shrink-0 text-[12px] font-semibold tabular-nums tracking-[-0.005em] ${
                    r.count > 0 ? "text-[#1E1B4B]" : "text-black/40"
                  }`}
                >
                  {r.count > 0 ? `${r.count}번의 증거` : "증거 0"}
                </span>
              </div>
              {r.recent.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {r.recent.map((t, i) => (
                    <li
                      key={i}
                      className="truncate text-[12px] leading-[1.5] tracking-[-0.005em] text-black/60"
                      title={t}
                    >
                      · {t}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
