"use client";

import { useEffect, useRef, useState } from "react";
import { saveTomorrowFirstAction, TOMORROW_FIRST_ACTION_MAX } from "@/lib/firebase";
import { WINS_AUTOSAVE_MS, WINS_SAVED_TOAST_MS } from "@/lib/constants/record";
import { docKey } from "@/lib/docKey";
import { useT } from "@/lib/i18n";
import type { DailyEntry } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * TomorrowActionRow — 저녁에만 나타나는 "내일 첫 행동 1개" 한 줄 입력.
 *
 * 저녁 판정(lib/homeMode)은 호출부가 한다 — 위치는 항상 기록 끝(섹션 순서 고정 원칙).
 * Masicampo & Baumeister 2011: 계획을 적으면 미완료 목표의 인지 침입이 해소된다.
 * 오늘 문서에 저장하고, 다음 날 아침 카드가 어제 문서에서 읽어간다.
 *
 * 저장 버튼이 없다: 디바운스 자동 저장 + Enter/포커스 아웃 즉시 저장(flush).
 * 앱 이탈(visibilitychange/pagehide)과 언마운트(탭 전환) 때도 flush 한다 — blur 는 홈 버튼으로
 * 나갈 때 발생이 보장되지 않아, 방금 적은 한 줄이 사라지던 구멍을 막는다.
 * ───────────────────────────────────────────────────────────────── */

export default function TomorrowActionRow({
  uid,
  ymd,
  entry,
  entryLoaded,
}: {
  uid: string;
  ymd: string;
  entry: DailyEntry | null;
  entryLoaded: boolean;
}) {
  const t = useT();

  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = typeof entry?.tomorrowFirstAction === "string" ? entry.tomorrowFirstAction : "";

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 저장을 이미 건 값 — Enter → blur 로 flush 가 두 번 불려도 같은 값을 두 번 쓰지 않는다. */
  const savingValueRef = useRef<string | null>(null);
  /** 언마운트 flush 용 최신값 — 클린업은 클로저가 아니라 이 ref 를 읽는다. */
  const latestRef = useRef({ uid, ymd, value, saved });
  useEffect(() => {
    latestRef.current = { uid, ymd, value, saved };
  });

  // 하이드레이션 — TodayWinsCard 와 같은 규칙(계정·날짜 키가 바뀔 때만 다시 채운다).
  const hydrationKey = docKey(uid, ymd);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  if (entryLoaded && hydratedKey !== hydrationKey) {
    setHydratedKey(hydrationKey);
    setValue(saved);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (!autosaveTimerRef.current) return;
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      const latest = latestRef.current;
      const next = latest.value.trim();
      if (next.length === 0 || next === latest.saved || next === savingValueRef.current) return;
      saveTomorrowFirstAction(latest.uid, latest.ymd, next).catch((err) =>
        console.error("[record] 내일 첫 행동 언마운트 저장 실패:", err),
      );
    };
  }, []);

  const doAutoSave = async (snapshot: string) => {
    savingValueRef.current = snapshot;
    setSaving(true);
    setError(null);
    try {
      await saveTomorrowFirstAction(uid, ymd, snapshot);
      setJustSaved(true);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setJustSaved(false), WINS_SAVED_TOAST_MS);
    } catch (err) {
      console.error("[record] 내일 첫 행동 자동 저장 실패:", err);
      savingValueRef.current = null; // 실패한 값은 다시 저장 대상으로 되돌린다.
      setError(t("home.wins.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (raw: string) => {
    const next = raw.slice(0, TOMORROW_FIRST_ACTION_MAX);
    setValue(next);
    if (justSaved) setJustSaved(false);
    if (error) setError(null);

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    if (next === saved || next.trim().length === 0) return;
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void doAutoSave(next);
    }, WINS_AUTOSAVE_MS);
  };

  /* 대기 중인 디바운스를 취소하고 지금 저장 — Enter(완료) · 포커스 아웃에서 쓴다.
   * "한 줄짜리 행동"이라 Enter 는 줄바꿈이 아니라 저장/닫기여야 한다. */
  const flush = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const next = value.trim();
    if (next !== value) setValue(next);
    if (next.length === 0) return;
    if (next === saved || next === savingValueRef.current) return;
    void doAutoSave(next);
  };

  /* 앱 이탈(홈 버튼 · 앱 전환) 직전 flush — 최신 클로저를 ref 로 갈아끼운다.
   * 여기서는 위젯 갱신 인텐트를 쏘지 않는다(user activation 없는 발화는 Chrome 확인창 회귀). */
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const onLeave = () => flushRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  return (
    <div className="relative flex items-start gap-3 px-4 py-3">
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: "rgba(216,90,48,0.12)" }}
      >
        <span className="text-[15px]" aria-hidden>
          🌅
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-[var(--label-2)]">
            {t("home.evening.firstAction.title")}
          </span>
          {error ? (
            <span className="text-[13px] text-[#FF3B30]">{error}</span>
          ) : justSaved ? (
            <span className="text-[13px] font-medium text-[#D85A30]">{t("common.saved")}</span>
          ) : saving ? (
            <span className="text-[13px] text-[var(--label-3)]">{t("common.saving")}</span>
          ) : null}
        </div>
        {/* 여러 줄이 아니라 한 줄 입력 — textarea 는 Enter 마다 줄이 늘어 스크롤을 만든다.
            Enter/완료는 곧바로 저장하고 키보드를 내린다(조합 중 Enter 는 한글 확정이라 통과). */}
        <input
          type="text"
          value={value}
          maxLength={TOMORROW_FIRST_ACTION_MAX}
          enterKeyHint="done"
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            flush();
            e.currentTarget.blur();
          }}
          onBlur={flush}
          placeholder={t("home.evening.firstAction.placeholder")}
          className="mt-1 w-full bg-transparent text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none"
        />
        {/* 저장 버튼이 없다는 사실 자체를 알려준다 — 안 그러면 "저장을 못 했다"고 읽힌다. */}
        <p className="mt-1 text-[12px] leading-[16px] text-[var(--label-3)]">
          {t("home.evening.firstAction.footer")}
        </p>
      </div>
    </div>
  );
}
