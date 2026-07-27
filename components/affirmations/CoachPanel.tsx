"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";
import { useT, type DictKey } from "@/lib/i18n";

/* ─────────────────────────────────────────────────────────────────
 * CoachPanel — 다짐 한 줄에 대한 AI 코치 제안 인라인 패널.
 *
 * AffirmationsEditor 의 행 아래에 펼쳐진다(Sheet 아님 — 온보딩 step2 에서도
 * 그대로 동작해야 하므로 자립형 인라인). 마운트 시 1회 /api/affirmation-coach 를
 * 호출해 과정/질문/정체성 3가지 리라이트를 받고, 탭하면 부모의 updateRow 로 교체된다.
 * 따라쓰기 체크인 플로우는 이 패널과 완전히 무관하다.
 * ───────────────────────────────────────────────────────────────── */

type RewriteStyle = "process" | "question" | "identity";

interface CoachSuggestion {
  style: RewriteStyle;
  text: string;
}

/** 스타일 → i18n 라벨 키 (템플릿 리터럴은 DictKey 검증을 못 받으므로 명시 맵). */
const STYLE_LABEL_KEY: Record<RewriteStyle, DictKey> = {
  process: "coach.style.process",
  question: "coach.style.question",
  identity: "coach.style.identity",
};

const HTTP_TOO_MANY_REQUESTS = 429;

export default function CoachPanel({
  text,
  onApply,
  onClose,
}: {
  /** 제안 대상 다짐 원문. */
  text: string;
  /** 제안 탭 → 부모가 행 텍스트를 교체. */
  onApply: (next: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [suggestions, setSuggestions] = useState<CoachSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/affirmation-coach", {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          suggestions?: CoachSuggestion[];
          error?: string;
        };
        if (cancelled) return;
        if (res.status === HTTP_TOO_MANY_REQUESTS) {
          setError(t("coach.quota"));
          return;
        }
        if (!res.ok || !data.ok || !Array.isArray(data.suggestions)) {
          setError(data.error || t("coach.failed"));
          return;
        }
        setSuggestions(data.suggestions);
      } catch (err) {
        console.error("[coach] 제안 조회 실패:", err);
        if (!cancelled) setError(t("coach.failed"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // text 를 의존성에 두지 않는다 — 패널이 열린 시점의 원문 1회 제안이 의도
    // (타이핑 중 재호출로 쿼터가 새는 것을 방지). 다시 받으려면 닫았다 다시 연다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-2 rounded-[10px] border border-black/10 bg-[#F7F4ED] px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#1E1B4B]">
          ✦ {t("coach.title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-6 w-6 items-center justify-center rounded-full text-black/40 hover:bg-black/[0.05]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-[12px] text-[#FF3B30]">{error}</p>
      ) : !suggestions ? (
        <div className="mt-2 space-y-2" aria-label={t("coach.loading")}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-[8px] bg-black/[0.06]" />
          ))}
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onApply(s.text)}
                className="flex w-full items-start gap-2 rounded-[8px] bg-white px-2.5 py-2 text-left transition-colors hover:bg-[#1E1B4B]/[0.04]"
              >
                <span className="mt-[1px] shrink-0 rounded-[5px] bg-[#1E1B4B]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1E1B4B]">
                  {t(STYLE_LABEL_KEY[s.style])}
                </span>
                <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-[#1E1B4B]">
                  {s.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
