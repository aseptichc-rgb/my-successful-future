"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveDailyWins, MAX_DAILY_WINS } from "@/lib/firebase";
import {
  WIN_MAX,
  WINS_AUTOSAVE_MS,
  WINS_INITIAL_VISIBLE,
  WINS_SAVED_TOAST_MS,
} from "@/lib/constants/record";
import { docKey } from "@/lib/docKey";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT } from "@/lib/i18n";
import type { DailyEntry } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * TodayWinsCard — "오늘 잘한 일" 입력 (전부 선택 입력, 600ms 디바운스 자동 저장).
 *
 * 해금 판정(lib/winsUnlock)은 호출부가 한다 — 이 컴포넌트는 열린 상태만 그린다.
 * 인셋 카드 래퍼도 호출부 몫(기록 탭은 자체 카드, 더 보기 안에서는 섹션 카드).
 *
 * 탭 구조에서는 입력 후 600ms 안에 다른 탭으로 옮기는 경로가 흔하다 — 언마운트 시
 * 대기 중인 초안을 그 자리에서 저장한다(flush). 안 하면 방금 적은 한 줄이 사라진다.
 * ───────────────────────────────────────────────────────────────── */

// 슬롯 배지는 모두 동일 indigo — 차분한 인상.
const SLOT_COLOR = "#1E1B4B";

function isDirty(next: string[], saved: string[]): boolean {
  return next.some((w, i) => (w || "") !== (saved[i] || ""));
}

function hasContent(list: string[]): boolean {
  return list.some((w) => (w || "").trim().length > 0);
}

export default function TodayWinsCard({
  uid,
  ymd,
  entry,
  entryLoaded,
  onOpenHistory,
}: {
  uid: string;
  ymd: string;
  /** 오늘 문서 — 공유 컨텍스트의 구독 결과를 그대로 받는다(중복 구독 없음). */
  entry: DailyEntry | null;
  /** 스냅샷이 한 번이라도 도착했는가. false 동안은 초안을 덮어쓰지 않는다. */
  entryLoaded: boolean;
  onOpenHistory: () => void;
}) {
  const t = useT();

  const [wins, setWins] = useState<string[]>(() => Array(MAX_DAILY_WINS).fill(""));
  const [autoSaving, setAutoSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(WINS_INITIAL_VISIBLE);

  /* 저장본 — 오늘 문서에서 그대로 파생한다(Firestore 는 저장 직후 로컬 에코 스냅샷으로
   * entry 를 갱신하므로 별도 state 동기화가 필요 없다). dirty 판정에만 쓰인다. */
  const savedWins = useMemo(() => {
    const raw = Array.isArray(entry?.wins) ? entry.wins : [];
    return Array.from({ length: MAX_DAILY_WINS }, (_, i) => raw[i] || "");
  }, [entry]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 언마운트 flush 용 최신값 — 클린업은 클로저가 아니라 이 ref 를 읽는다. */
  const latestRef = useRef({ uid, ymd, wins, savedWins });
  latestRef.current = { uid, ymd, wins, savedWins };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (!autosaveTimerRef.current) return;
      // 디바운스가 걸려 있다 = 아직 저장 안 된 초안이 있다 — 지금 저장한다.
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      const latest = latestRef.current;
      if (!isDirty(latest.wins, latest.savedWins) || !hasContent(latest.wins)) return;
      saveDailyWins(latest.uid, latest.ymd, latest.wins)
        .then(() => void refreshIosWidget())
        .catch((err) => console.error("[record] 잘한 일 언마운트 저장 실패:", err));
    };
  }, []);

  /* ── 오늘 문서 → 입력 초안 하이드레이션 (렌더 중 상태 조정) ──
   * 계정·날짜(uid:ymd)가 바뀌면 새 문서로 다시 채운다. 그렇지 않으면 자정 롤오버 시
   * 전날 기록이 오늘 화면에 남고, 한 글자만 입력해도 전날 내용이 오늘 문서로
   * 자동 저장되는 데이터 오염이 발생한다.
   * 같은 키 안에서는 다시 채우지 않아 타이핑 중인 초안을 덮어쓰지 않는다. */
  const hydrationKey = docKey(uid, ymd);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  if (entryLoaded && hydratedKey !== hydrationKey) {
    setHydratedKey(hydrationKey);
    setWins(savedWins);
  }

  const doAutoSave = async (snapshot: string[]) => {
    setAutoSaving(true);
    setError(null);
    try {
      await saveDailyWins(uid, ymd, snapshot);
      setJustSaved(true);
      void refreshIosWidget();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setJustSaved(false), WINS_SAVED_TOAST_MS);
    } catch (err) {
      console.error("[record] 잘한 일 자동 저장 실패:", err);
      setError(t("home.wins.saveFailed"));
    } finally {
      setAutoSaving(false);
    }
  };

  const handleChange = (idx: number, value: string) => {
    const next = wins.map((w, i) => (i === idx ? value.slice(0, WIN_MAX) : w));
    setWins(next);
    if (justSaved) setJustSaved(false);
    if (error) setError(null);

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    if (!isDirty(next, savedWins) || !hasContent(next)) return;
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void doAutoSave(next);
    }, WINS_AUTOSAVE_MS);
  };

  // 이미 적어둔 잘한 일은 접지 않는다 — 별도 state 동기화 없이 렌더 시점에 파생한다.
  const filled = wins.filter((w) => (w || "").trim().length > 0).length;
  const rowCount = Math.min(MAX_DAILY_WINS, Math.max(visible, filled));

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
          {t("home.wins.title", { max: MAX_DAILY_WINS })}
        </span>
        <div className="flex items-center gap-4">
          {error ? (
            <span className="text-[13px] text-[#FF3B30]">{error}</span>
          ) : justSaved ? (
            <span className="text-[13px] font-medium text-[#D85A30]">{t("common.saved")}</span>
          ) : autoSaving ? (
            <span className="text-[13px] text-[var(--label-3)]">{t("common.saving")}</span>
          ) : null}
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-[15px] font-medium text-[var(--soul)]"
          >
            {t("home.wins.history")}
          </button>
        </div>
      </div>

      {Array.from({ length: rowCount }, (_, idx) => {
        const num = String(idx + 1).padStart(2, "0");
        const placeholder =
          idx === 0
            ? t("home.wins.placeholder1")
            : idx === 1
              ? t("home.wins.placeholder2")
              : t("home.wins.placeholder3");
        return (
          <div key={idx} className="relative flex items-start gap-3 px-4 py-3">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: SLOT_COLOR + "1A" }}
            >
              <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color: SLOT_COLOR }}>
                {num}
              </span>
            </div>
            {/* 자동 저장은 디바운스 뒤라 user-activation 이 없다. 탭으로 포커스를
                빼는 순간에 먼저 신호하고, 네이티브는 유예 후 저장본을 읽는다. */}
            <textarea
              value={wins[idx] || ""}
              rows={1}
              maxLength={WIN_MAX}
              onChange={(e) => handleChange(idx, e.target.value)}
              onBlur={() => notifyAndroidWidgetRefresh()}
              placeholder={placeholder}
              className="flex-1 min-h-[24px] resize-none bg-transparent text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none py-2"
            />
            <div
              className="absolute bottom-0 right-0 h-[0.5px]"
              style={{ left: 60, background: "var(--sep)" }}
            />
          </div>
        );
      })}

      {rowCount < MAX_DAILY_WINS && (
        <button
          type="button"
          onClick={() => setVisible((n) => Math.min(MAX_DAILY_WINS, n + 1))}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
        >
          <span className="w-9 flex-shrink-0 text-center text-[17px] text-[var(--soul)]" aria-hidden>
            ＋
          </span>
          <span className="flex-1 text-[15px] leading-[20px] font-medium text-[var(--soul)]">
            {t("home.wins.addRow")}
          </span>
        </button>
      )}
    </>
  );
}
