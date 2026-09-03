"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  saveDailyWins,
  saveTomorrowFirstAction,
  MAX_DAILY_WINS,
  TOMORROW_FIRST_ACTION_MAX,
} from "@/lib/firebase";
import { notifyAndroidWidgetRefresh } from "@/lib/widgetBridge";
import { refreshIosWidget } from "@/lib/iosWidget";
import { useT } from "@/lib/i18n";
import type { HomeMode } from "@/lib/homeMode";
import type { PlanUnlockState } from "@/lib/planUnlock";
import type { WinsUnlockState } from "@/lib/winsUnlock";
import type { WeeklyReview } from "@/lib/weeklyReview";
import type { DailyEntry, ExecutionPlan } from "@/types";
import DisclosureSection from "@/components/ui/DisclosureSection";
import FutureSelfLine from "@/components/home/FutureSelfLine";
import DailyPlanCard from "@/components/home/DailyPlanCard";
import ExecutionPlanSheet from "@/components/woop/ExecutionPlanSheet";
import WeeklyReviewCard from "@/components/home/WeeklyReviewCard";

/* ─────────────────────────────────────────────────────────────────
 * MoreSection — 홈의 "더 보기" (기본 접힘).
 *
 * 홈에 상시 노출되는 것은 명언 · 오늘 카드 · 7일 링 셋뿐이고, 나머지는 전부 여기로
 * 내려왔다. 선택 입력이 첫 화면에 깔려 있으면 필수 행동조차 밀린다(choice overload).
 *
 * 안에 든 것: 미래의 나 · 오늘의 if-then / 추가 목표 ·
 *             오늘의 기록(잘한 일 · 내일 첫 행동) · 주간 회고.
 *
 * "그 꿈을 사는 하루"는 여기 있었지만 오늘 카드(선언 ↔ 오늘의 목표 사이)로 올라갔다 —
 * 접힌 채로는 선언과 행동을 잇는 다리 역할을 못 한다.
 *
 * "잘한 일 / 내일 첫 행동"의 600ms 디바운스 자동 저장은 이 섹션에서만 쓰이므로
 * 상태와 핸들러를 홈에서 통째로 옮겨 왔다 — 홈 페이지가 다시 비대해지지 않게.
 * ───────────────────────────────────────────────────────────────── */

const WIN_MAX = 140;
const WINS_AUTOSAVE_MS = 600;
const WINS_SAVED_TOAST_MS = 1800;
/** 잘한 일은 1칸만 펼쳐두고 나머지는 "한 줄 더"로 — 빈 칸 3개는 숙제처럼 읽힌다. */
const WINS_INITIAL_VISIBLE = 1;

// 슬롯 배지는 모두 동일 indigo — 차분한 인상.
const SLOT_COLOR = "#1E1B4B";

const IconChevron = ({ color = "rgba(60,60,67,0.3)" }: { color?: string }) => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden>
    <path d="M1 1l6 6-6 6" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function MoreSection({
  uid,
  ymd,
  entry,
  entryLoaded,
  homeMode,
  futureText,
  todayPlan,
  activePlanCount,
  yesterdayFirstAction,
  goals,
  identityLabels,
  unlock,
  winsUnlock,
  achievedGoals,
  onToggleGoalAchieved,
  weeklyReview,
  onOpenSettings,
  onOpenWinsHistory,
}: {
  uid: string;
  ymd: string;
  /** 오늘 문서 — 홈의 onDailyEntrySnapshot 구독 결과를 그대로 받는다(중복 구독 없음). */
  entry: DailyEntry | null;
  /** 스냅샷이 한 번이라도 도착했는가. false 동안은 초안을 덮어쓰지 않는다. */
  entryLoaded: boolean;
  homeMode: HomeMode;
  futureText: string;
  todayPlan: Pick<ExecutionPlan, "goal" | "ifText" | "thenText"> | null;
  /** 활성 플랜 개수 — 카드가 "매일 하나씩 돌아간다"는 안내를 켤지 판단한다. */
  activePlanCount: number;
  yesterdayFirstAction: string | null;
  /** 전체 목표 (User.goals) — 첫 목표는 오늘 카드 몫이라 여기선 나머지만 그린다. */
  goals: string[];
  /** 설계 시트의 정체성 칩 풀 (User.identities.labels — 없으면 시트가 섹션 숨김). */
  identityLabels: string[];
  /** 실행 설계 해금 상태. null = 플랜 첫 스냅샷 전 — 영역을 그리지 않는다(깜빡임 방지). */
  unlock: PlanUnlockState | null;
  /** 잘한 일 기록 해금 상태. null = 오늘 문서 첫 스냅샷 전 — 잠금 행조차 그리지 않는다. */
  winsUnlock: WinsUnlockState | null;
  achievedGoals: string[];
  onToggleGoalAchieved: (goal: string) => void;
  /** 일요일 저녁이 아니면 null — 카드 자체가 생략된다. */
  weeklyReview: WeeklyReview | null;
  onOpenSettings: () => void;
  onOpenWinsHistory: () => void;
}) {
  const t = useT();

  // 첫 목표는 오늘 카드가 이미 보여주므로 여기서는 나머지만 그린다.
  const extraGoals = goals.slice(1);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);

  const [wins, setWins] = useState<string[]>(() => Array(MAX_DAILY_WINS).fill(""));
  const [winsAutoSaving, setWinsAutoSaving] = useState(false);
  const [winsJustSaved, setWinsJustSaved] = useState(false);
  const [winsError, setWinsError] = useState<string | null>(null);
  const [winsVisible, setWinsVisible] = useState(WINS_INITIAL_VISIBLE);

  const [tomorrowAction, setTomorrowAction] = useState("");
  const [tomorrowSaving, setTomorrowSaving] = useState(false);
  const [tomorrowJustSaved, setTomorrowJustSaved] = useState(false);
  const [tomorrowError, setTomorrowError] = useState<string | null>(null);

  /* 저장본 — 오늘 문서에서 그대로 파생한다(Firestore 는 저장 직후 로컬 에코 스냅샷으로
   * entry 를 갱신하므로 별도 state 동기화가 필요 없다). dirty 판정에만 쓰인다. */
  const savedWins = useMemo(() => {
    const raw = Array.isArray(entry?.wins) ? entry.wins : [];
    return Array.from({ length: MAX_DAILY_WINS }, (_, i) => raw[i] || "");
  }, [entry]);
  const savedTomorrowAction =
    typeof entry?.tomorrowFirstAction === "string" ? entry.tomorrowFirstAction : "";

  const winsSavedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winsAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tomorrowAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tomorrowToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 저장을 이미 건 값 — Enter → blur 로 flush 가 두 번 불려도 같은 값을 두 번 쓰지 않는다. */
  const tomorrowSavingValueRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
      if (winsAutosaveTimerRef.current) clearTimeout(winsAutosaveTimerRef.current);
      if (tomorrowAutosaveTimerRef.current) clearTimeout(tomorrowAutosaveTimerRef.current);
      if (tomorrowToastTimerRef.current) clearTimeout(tomorrowToastTimerRef.current);
    };
  }, []);

  /* ── 오늘 문서 → 입력 초안 하이드레이션 (렌더 중 상태 조정) ──
   * 계정·날짜(uid:ymd)가 바뀌면 새 문서로 다시 채운다. 그렇지 않으면 자정 롤오버 시
   * 전날 기록이 오늘 화면에 남고, 한 글자만 입력해도 전날 내용이 오늘 문서로
   * 자동 저장되는 데이터 오염이 발생한다.
   * 같은 키 안에서는 다시 채우지 않아 타이핑 중인 초안을 덮어쓰지 않는다. */
  const hydrationKey = `${uid}:${ymd}`;
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  if (entryLoaded && hydratedKey !== hydrationKey) {
    setHydratedKey(hydrationKey);
    setWins(savedWins);
    setTomorrowAction(savedTomorrowAction);
  }

  const doAutoSaveWins = async (snapshot: string[]) => {
    setWinsAutoSaving(true);
    setWinsError(null);
    try {
      await saveDailyWins(uid, ymd, snapshot);
      setWinsJustSaved(true);
      void refreshIosWidget();
      if (winsSavedToastTimerRef.current) clearTimeout(winsSavedToastTimerRef.current);
      winsSavedToastTimerRef.current = setTimeout(
        () => setWinsJustSaved(false),
        WINS_SAVED_TOAST_MS,
      );
    } catch (err) {
      console.error("[home] 잘한 일 자동 저장 실패:", err);
      setWinsError(t("home.wins.saveFailed"));
    } finally {
      setWinsAutoSaving(false);
    }
  };

  const handleChangeWin = (idx: number, value: string) => {
    const next = wins.map((w, i) => (i === idx ? value.slice(0, WIN_MAX) : w));
    setWins(next);
    if (winsJustSaved) setWinsJustSaved(false);
    if (winsError) setWinsError(null);

    const dirty = next.some((w, i) => (w || "") !== (savedWins[i] || ""));
    const hasContent = next.some((w) => (w || "").trim().length > 0);
    if (winsAutosaveTimerRef.current) clearTimeout(winsAutosaveTimerRef.current);
    if (!dirty || !hasContent) return;
    winsAutosaveTimerRef.current = setTimeout(() => {
      void doAutoSaveWins(next);
    }, WINS_AUTOSAVE_MS);
  };

  const doAutoSaveTomorrowAction = async (snapshot: string) => {
    tomorrowSavingValueRef.current = snapshot;
    setTomorrowSaving(true);
    setTomorrowError(null);
    try {
      await saveTomorrowFirstAction(uid, ymd, snapshot);
      setTomorrowJustSaved(true);
      if (tomorrowToastTimerRef.current) clearTimeout(tomorrowToastTimerRef.current);
      tomorrowToastTimerRef.current = setTimeout(
        () => setTomorrowJustSaved(false),
        WINS_SAVED_TOAST_MS,
      );
    } catch (err) {
      console.error("[home] 내일 첫 행동 자동 저장 실패:", err);
      tomorrowSavingValueRef.current = null; // 실패한 값은 다시 저장 대상으로 되돌린다.
      setTomorrowError(t("home.wins.saveFailed"));
    } finally {
      setTomorrowSaving(false);
    }
  };

  const handleChangeTomorrowAction = (value: string) => {
    const next = value.slice(0, TOMORROW_FIRST_ACTION_MAX);
    setTomorrowAction(next);
    if (tomorrowJustSaved) setTomorrowJustSaved(false);
    if (tomorrowError) setTomorrowError(null);

    if (tomorrowAutosaveTimerRef.current) clearTimeout(tomorrowAutosaveTimerRef.current);
    const dirty = next !== savedTomorrowAction;
    if (!dirty || next.trim().length === 0) return;
    tomorrowAutosaveTimerRef.current = setTimeout(() => {
      void doAutoSaveTomorrowAction(next);
    }, WINS_AUTOSAVE_MS);
  };

  /* 대기 중인 디바운스를 취소하고 지금 저장 — Enter(완료) · 포커스 아웃에서 쓴다.
   * "한 줄짜리 행동"이라 Enter 는 줄바꿈이 아니라 저장/닫기여야 한다. */
  const flushTomorrowAction = () => {
    if (tomorrowAutosaveTimerRef.current) {
      clearTimeout(tomorrowAutosaveTimerRef.current);
      tomorrowAutosaveTimerRef.current = null;
    }
    const next = tomorrowAction.trim();
    if (next !== tomorrowAction) setTomorrowAction(next);
    if (next.length === 0) return;
    if (next === savedTomorrowAction || next === tomorrowSavingValueRef.current) return;
    void doAutoSaveTomorrowAction(next);
  };

  // 이미 적어둔 잘한 일은 접지 않는다 — 별도 state 동기화 없이 렌더 시점에 파생한다.
  const winsFilled = wins.filter((w) => (w || "").trim().length > 0).length;
  const winRowCount = Math.min(MAX_DAILY_WINS, Math.max(winsVisible, winsFilled));

  /* ── 잠긴 기능 예고: 이름 없이 하나만 ──
   * 아직 못 여는 기능들을 이름·설명과 함께 줄줄이 세워두면 "앞으로 열릴 것"이 아니라
   * "지금 못 쓰는 것"의 목록이 된다. 그래서 잠긴 것이 몇 개든 가장 가까운 하나만,
   * 정체를 감춘 채 조건과 진행도만 보여준다 — 궁금함이 남아야 다시 온다.
   * 두 스냅샷이 다 도착하기 전(null)에는 그리지 않는다: 나중에 도착한 쪽이 더 가까우면
   * 남은 일수가 눈앞에서 줄어드는 것처럼 보인다. */
  const nearestLock =
    unlock && winsUnlock
      ? ([unlock, winsUnlock]
          .filter((state) => state.kind === "locked")
          .sort((a, b) => a.threshold - b.threshold)[0] ?? null)
      : null;

  return (
    <>
    <DisclosureSection
      id="home.more"
      header={t("home.section.more")}
      // 접힌 요약도 잠긴 기능의 이름을 흘리지 않는다(펼침/접힘 어느 쪽도 예고는 한 벌).
      summary={t(nearestLock ? "home.more.summaryLocked" : "home.more.summary")}
    >
      {/* 미래의 나 — 한 줄, 탭하면 펼침. 수정은 설정에서. */}
      <div className="border-b border-[var(--sep)]">
        <FutureSelfLine text={futureText} onWrite={onOpenSettings} />
      </div>

      {/* 오늘의 if-then — 아침엔 전체, 그 외엔 한 줄 축약. 잠김/로딩 전엔 래퍼(구분선)째 생략.
          잠긴 동안 남는 건 "어젯밤의 첫 행동" 뿐이다(기능 이름은 아래 잠금 행에서도 감춘다). */}
      {(() => {
        if (!unlock) return null;
        const firstAction = homeMode === "morning" ? yesterdayFirstAction : null;
        if (unlock.kind !== "open" && !firstAction) return null;
        return (
          <div className="border-b border-[var(--sep)]">
            <DailyPlanCard
              plan={todayPlan}
              activePlanCount={activePlanCount}
              yesterdayFirstAction={firstAction}
              compact={homeMode !== "morning"}
              unlock={unlock}
              onCreateCta={() => setPlanSheetOpen(true)}
            />
          </div>
        );
      })()}

      {/* 추가로 해금한 목표 — 배지를 탭해 달성 토글(추가/삭제는 설정). */}
      {extraGoals.map((goal, idx) => {
        const trimmed = goal.trim();
        const achieved = trimmed.length > 0 && achievedGoals.includes(trimmed);
        // 첫 목표는 오늘 카드에 있으므로 번호는 2번부터 이어진다.
        const num = String(idx + 2).padStart(2, "0");
        return (
          <div key={`${idx}-${goal}`} className="relative flex items-center gap-3 px-4 min-h-[60px]">
            <button
              type="button"
              onClick={() => onToggleGoalAchieved(goal)}
              aria-label={
                achieved
                  ? t("home.goals.toggleUnachievedAria")
                  : t("home.goals.toggleAchievedAria")
              }
              aria-pressed={achieved}
              disabled={trimmed.length === 0}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 transition-opacity"
              style={{
                background: achieved ? SLOT_COLOR : SLOT_COLOR + "1A",
                opacity: trimmed.length === 0 ? 0.4 : 1,
              }}
            >
              {achieved ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              ) : (
                <span className="text-[15px] font-bold tracking-[-0.3px]" style={{ color: SLOT_COLOR }}>
                  {num}
                </span>
              )}
            </button>
            <div className="flex-1 min-w-0 py-2">
              <div
                className={`text-[17px] leading-[22px] tracking-[-0.43px] ${
                  achieved
                    ? "text-[var(--label-2)] line-through decoration-[var(--label-3)]"
                    : "text-[var(--label)]"
                }`}
              >
                {trimmed || (
                  <span className="text-[var(--label-3)]">{t("home.goals.placeholder")}</span>
                )}
              </div>
            </div>
            <div
              className="absolute bottom-0 right-0 h-[0.5px]"
              style={{ left: 60, background: "var(--sep)" }}
            />
          </div>
        );
      })}

      {/* 목표 관리 — 홈 첫 화면에 자유입력이 깔리지 않는다. 편집은 시트/설정에서.
          잠긴 동안엔 문구에서 실행 설계 이름을 뺀다(예고는 잠금 행 한 곳으로 충분). */}
      <button
        type="button"
        onClick={onOpenSettings}
        className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-[var(--sep)]"
      >
        <span className="w-9 flex-shrink-0 text-center text-[15px]" aria-hidden>
          ⚡
        </span>
        <span className="flex-1 text-[15px] leading-[20px] font-medium text-[var(--soul)]">
          {t(unlock?.kind === "open" ? "home.plans.manage" : "home.plans.manageLocked")}
        </span>
        <IconChevron />
      </button>

      {/* ── 오늘의 기록 — 전부 선택 입력 ──
          잘한 일 3칸도 꾸준함으로 벌어서 연다(lib/winsUnlock). 필수 루틴이 붙기 전의 빈 칸
          여러 개는 격려가 아니라 숙제로 읽힌다. 첫 스냅샷 전(null)에는 잠금 행조차 그리지
          않는다 — 열려 있던 기록이 한 프레임 잠겼다 풀리는 편이 더 나쁘다. */}
      {nearestLock && (
        <LockedTeaserRow progress={nearestLock.progress} threshold={nearestLock.threshold} />
      )}

      {winsUnlock?.kind === "open" && (
        <>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-[13px] uppercase tracking-[-0.08px] text-[var(--label-2)]">
              {t("home.wins.title", { max: MAX_DAILY_WINS })}
            </span>
            <div className="flex items-center gap-4">
              {winsError ? (
                <span className="text-[13px] text-[#FF3B30]">{winsError}</span>
              ) : winsJustSaved ? (
                <span className="text-[13px] font-medium text-[#D85A30]">{t("common.saved")}</span>
              ) : winsAutoSaving ? (
                <span className="text-[13px] text-[var(--label-3)]">{t("common.saving")}</span>
              ) : null}
              <button
                type="button"
                onClick={onOpenWinsHistory}
                className="text-[15px] font-medium text-[var(--soul)]"
              >
                {t("home.wins.history")}
              </button>
            </div>
          </div>

          {Array.from({ length: winRowCount }, (_, idx) => {
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
                  onChange={(e) => handleChangeWin(idx, e.target.value)}
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

          {winRowCount < MAX_DAILY_WINS && (
            <button
              type="button"
              onClick={() => setWinsVisible((n) => Math.min(MAX_DAILY_WINS, n + 1))}
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
      )}

      {/* 내일 첫 행동 1개 — 저녁에만 나타난다(위치는 항상 기록 끝) */}
      {homeMode === "evening" && (
        <div className="relative flex items-start gap-3 px-4 py-3 border-t border-[var(--sep)]">
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
              {tomorrowError ? (
                <span className="text-[13px] text-[#FF3B30]">{tomorrowError}</span>
              ) : tomorrowJustSaved ? (
                <span className="text-[13px] font-medium text-[#D85A30]">{t("common.saved")}</span>
              ) : tomorrowSaving ? (
                <span className="text-[13px] text-[var(--label-3)]">{t("common.saving")}</span>
              ) : null}
            </div>
            {/* 여러 줄이 아니라 한 줄 입력 — textarea 는 Enter 마다 줄이 늘어 스크롤을 만든다.
                Enter/완료는 곧바로 저장하고 키보드를 내린다(조합 중 Enter 는 한글 확정이라 통과). */}
            <input
              type="text"
              value={tomorrowAction}
              maxLength={TOMORROW_FIRST_ACTION_MAX}
              enterKeyHint="done"
              onChange={(e) => handleChangeTomorrowAction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                flushTomorrowAction();
                e.currentTarget.blur();
              }}
              onBlur={flushTomorrowAction}
              placeholder={t("home.evening.firstAction.placeholder")}
              className="mt-1 w-full bg-transparent text-[17px] leading-[24px] tracking-[-0.43px] text-[var(--label)] placeholder:text-[var(--label-3)] focus:outline-none"
            />
            {/* 저장 버튼이 없다는 사실 자체를 알려준다 — 안 그러면 "저장을 못 했다"고 읽힌다. */}
            <p className="mt-1 text-[12px] leading-[16px] text-[var(--label-3)]">
              {t("home.evening.firstAction.footer")}
            </p>
          </div>
        </div>
      )}

      {/* 주간 회고 — 일요일 저녁만, 입력 요구 0 */}
      {weeklyReview && (
        <div className="border-t border-[var(--sep)]">
          <WeeklyReviewCard review={weeklyReview} />
        </div>
      )}
    </DisclosureSection>

    {/* 설계 시트 — DisclosureSection 바깥에 마운트해 섹션을 접어도 시트가 살아 있다.
        기본은 빠른 설계(quick, 키보드 0회) — 자유입력은 "직접 다듬기" 두 단계 뒤. */}
    {planSheetOpen && (
      <ExecutionPlanSheet
        uid={uid}
        goals={goals}
        identityLabels={identityLabels}
        onClose={() => setPlanSheetOpen(false)}
      />
    )}
    </>
  );
}

/**
 * 잠금 예고 행 — 어떤 기능인지는 밝히지 않고 조건과 진행도만 알린다.
 *
 * 실행 설계·잘한 일 기록이 이 한 행을 공유한다(호출부가 가장 가까운 잠금 하나만 넘긴다).
 * 이름과 설명을 미리 보여주면 "곧 열릴 것"이 아니라 "지금 못 쓰는 것"의 목록이 되고,
 * 목록은 궁금함을 남기지 않는다 — 정체는 열리는 날의 몫이다.
 * 눌러도 아무 일이 없으므로 button 이 아니다.
 */
function LockedTeaserRow({ progress, threshold }: { progress: number; threshold: number }) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <span className="w-9 flex-shrink-0 text-center text-[17px] leading-[22px]" aria-hidden>
        🔒
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] leading-[20px] font-medium text-[var(--label-2)]">
          {t("unlock.teaser.title")}
        </p>
        <p className="mt-0.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
          {t("unlock.teaser.hint")}
        </p>
        <p className="mt-1 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-3)]">
          {t("unlock.locked.body", { days: threshold, progress })}
        </p>
      </div>
    </div>
  );
}
