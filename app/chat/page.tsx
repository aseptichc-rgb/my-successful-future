"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  ensureFutureSelfSession,
  updateFuturePersona,
  updateUserGoals,
  onDailyEntrySnapshot,
  saveDailyTodos,
  saveDailyWins,
  saveDailyAchievedGoals,
  getKstYmd,
  MAX_USER_GOALS,
  MAX_DAILY_WINS,
} from "@/lib/firebase";
import type { DailyEntry, DailyTodo } from "@/types";

const FUTURE_PERSONA_MAX = 500;
const GOAL_MAX = 80;
const TODO_MAX = 120;
const WIN_MAX = 140;
const SAVE_DEBOUNCE_MS = 600;

function formatKstHeader(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return ymd;
  return `${y}년 ${m}월 ${d}일`;
}

function newTodoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomeDashboardPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();

  const [futureDraft, setFutureDraft] = useState("");
  const [futureEditing, setFutureEditing] = useState(false);
  const [futureSaving, setFutureSaving] = useState(false);

  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState("");
  const goalsHydratedRef = useRef(false);

  const ymd = useMemo(() => getKstYmd(), []);
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [todoDraft, setTodoDraft] = useState("");
  const [wins, setWins] = useState<string[]>(["", "", ""]);
  const [achievedGoals, setAchievedGoals] = useState<string[]>([]);
  const dailyHydratedRef = useRef(false);
  const winsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 온보딩 미완료 사용자는 위저드로
  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    if (user && !user.onboardedAt) {
      router.replace("/onboarding");
      return;
    }
    // future-self 세션은 백그라운드로만 준비
    const displayName = user?.displayName || firebaseUser.displayName || "사용자";
    ensureFutureSelfSession(firebaseUser.uid, displayName).catch((err) => {
      console.warn("미래의 나 세션 준비 실패:", err);
    });
  }, [firebaseUser, loading, router, user]);

  // 사용자 프로필에서 future persona / goals 동기화
  useEffect(() => {
    if (!user) return;
    setFutureDraft(user.futurePersona || "");
    if (!goalsHydratedRef.current) {
      setGoals(user.goals && user.goals.length > 0 ? [...user.goals] : []);
      goalsHydratedRef.current = true;
    }
  }, [user]);

  // 오늘 일일 엔트리 구독
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onDailyEntrySnapshot(firebaseUser.uid, ymd, (entry: DailyEntry | null) => {
      if (!entry) {
        if (!dailyHydratedRef.current) {
          setTodos([]);
          setWins(["", "", ""]);
          setAchievedGoals([]);
          dailyHydratedRef.current = true;
        }
        return;
      }
      setTodos(Array.isArray(entry.todos) ? entry.todos : []);
      const w = Array.isArray(entry.wins) ? entry.wins : [];
      setWins([0, 1, 2].map((i) => w[i] || ""));
      setAchievedGoals(Array.isArray(entry.achievedGoals) ? entry.achievedGoals : []);
      dailyHydratedRef.current = true;
    });
    return unsub;
  }, [firebaseUser, ymd]);

  if (loading || !firebaseUser) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F0EDE6]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#1E1B4B]" />
      </div>
    );
  }

  const uid = firebaseUser.uid;

  // ── 미래의 나 ────────────────────────────────────
  const handleFutureSave = async () => {
    if (!firebaseUser) return;
    const next = futureDraft.trim().slice(0, FUTURE_PERSONA_MAX);
    setFutureSaving(true);
    try {
      await updateFuturePersona(uid, next);
      setFutureEditing(false);
    } catch (err) {
      console.error("미래의 나 저장 실패:", err);
      window.alert("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setFutureSaving(false);
    }
  };

  const handleFutureCancel = () => {
    setFutureDraft(user?.futurePersona || "");
    setFutureEditing(false);
  };

  // ── 목표 ─────────────────────────────────────────
  const persistGoals = async (next: string[]) => {
    try {
      await updateUserGoals(uid, next);
    } catch (err) {
      console.error("목표 저장 실패:", err);
      window.alert("목표 저장에 실패했습니다.");
    }
  };

  // 오늘 달성 토글: 목표 텍스트 자체를 키로 저장 (텍스트가 바뀌면 자연스럽게 무효화)
  const handleToggleGoalAchieved = async (goalText: string) => {
    const trimmed = goalText.trim();
    if (!trimmed) return;
    const isAchieved = achievedGoals.includes(trimmed);
    const next = isAchieved
      ? achievedGoals.filter((g) => g !== trimmed)
      : [...achievedGoals, trimmed];
    setAchievedGoals(next);
    try {
      await saveDailyAchievedGoals(uid, ymd, next);
    } catch (err) {
      console.error("목표 달성 저장 실패:", err);
      // 실패 시 롤백 — 다음 스냅샷이 정정해 줄 수 있지만 즉각 반영을 위해 명시적으로 되돌린다.
      setAchievedGoals(achievedGoals);
      window.alert("저장에 실패했습니다.");
    }
  };

  // 목표 삭제·수정 후 더 이상 존재하지 않는 목표에 걸린 체크를 정리한다.
  const pruneAchievedGoals = async (currentGoals: string[]) => {
    const valid = new Set(currentGoals.map((g) => g.trim()).filter((g) => g.length > 0));
    const pruned = achievedGoals.filter((g) => valid.has(g));
    if (pruned.length === achievedGoals.length) return;
    setAchievedGoals(pruned);
    try {
      await saveDailyAchievedGoals(uid, ymd, pruned);
    } catch (err) {
      console.error("달성 목표 정리 실패:", err);
    }
  };

  const handleAddGoal = async () => {
    const text = goalDraft.trim().slice(0, GOAL_MAX);
    if (!text) return;
    if (goals.length >= MAX_USER_GOALS) {
      window.alert(`목표는 최대 ${MAX_USER_GOALS}개까지 추가할 수 있어요.`);
      return;
    }
    const next = [...goals, text];
    setGoals(next);
    setGoalDraft("");
    await persistGoals(next);
  };

  const handleUpdateGoal = async (idx: number, value: string) => {
    const next = goals.map((g, i) => (i === idx ? value.slice(0, GOAL_MAX) : g));
    setGoals(next);
  };

  const handleCommitGoal = async (idx: number) => {
    const trimmed = (goals[idx] || "").trim();
    if (!trimmed) {
      const next = goals.filter((_, i) => i !== idx);
      setGoals(next);
      await persistGoals(next);
      await pruneAchievedGoals(next);
      return;
    }
    const next = goals.map((g, i) => (i === idx ? trimmed : g));
    setGoals(next);
    await persistGoals(next);
    await pruneAchievedGoals(next);
  };

  const handleRemoveGoal = async (idx: number) => {
    const next = goals.filter((_, i) => i !== idx);
    setGoals(next);
    await persistGoals(next);
    await pruneAchievedGoals(next);
  };

  // ── 오늘의 할 일 ─────────────────────────────────
  const persistTodos = async (next: DailyTodo[]) => {
    try {
      await saveDailyTodos(uid, ymd, next);
    } catch (err) {
      console.error("할 일 저장 실패:", err);
      window.alert("할 일 저장에 실패했습니다.");
    }
  };

  const handleAddTodo = async () => {
    const text = todoDraft.trim().slice(0, TODO_MAX);
    if (!text) return;
    const next: DailyTodo[] = [...todos, { id: newTodoId(), text, done: false }];
    setTodos(next);
    setTodoDraft("");
    await persistTodos(next);
  };

  const handleToggleTodo = async (id: string) => {
    const next = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setTodos(next);
    await persistTodos(next);
  };

  const handleRemoveTodo = async (id: string) => {
    const next = todos.filter((t) => t.id !== id);
    setTodos(next);
    await persistTodos(next);
  };

  // ── 오늘 잘한 일 3가지 (디바운스 저장) ──────────
  const handleChangeWin = (idx: number, value: string) => {
    const next = wins.map((w, i) => (i === idx ? value.slice(0, WIN_MAX) : w));
    setWins(next);
    if (winsTimerRef.current) clearTimeout(winsTimerRef.current);
    winsTimerRef.current = setTimeout(() => {
      saveDailyWins(uid, ymd, next).catch((err) => {
        console.error("잘한 일 저장 실패:", err);
      });
    }, SAVE_DEBOUNCE_MS);
  };

  const handleCommitWins = async () => {
    if (winsTimerRef.current) {
      clearTimeout(winsTimerRef.current);
      winsTimerRef.current = null;
    }
    try {
      await saveDailyWins(uid, ymd, wins);
    } catch (err) {
      console.error("잘한 일 저장 실패:", err);
    }
  };

  const completedCount = todos.filter((t) => t.done).length;
  const futureText = user?.futurePersona || "";

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#F0EDE6] pb-24 lg:pb-4">
      <header className="border-b border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-7">
        <div className="mx-auto max-w-3xl pr-12 sm:pr-14">
          <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.005em] text-[#1E1B4B] sm:text-[32px]">
            오늘의 나
          </h1>
          <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.022em] text-black/60">
            {formatKstHeader(ymd)} · 미래의 나에게 한 걸음 더 가까워지는 하루를 만들어 보세요.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6">
        {/* ── 10년 후의 나의 모습 ─────────────────── */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
                <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 16.6 6.8 19.3l1-5.9L3.5 9.3l5.9-.9L12 3z" />
                </svg>
                10년 후의 나의 모습
              </h2>
              <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
                되고 싶은 모습을 자유롭게 적어두면, 매일 이 모습을 향해 걸을 수 있어요.
              </p>
            </div>
            {!futureEditing && (
              <button
                type="button"
                onClick={() => setFutureEditing(true)}
                className="shrink-0 rounded-pill border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-black/70 transition-colors hover:border-[#1E1B4B] hover:text-[#1E1B4B]"
              >
                {futureText ? "수정" : "작성"}
              </button>
            )}
          </div>

          {futureEditing ? (
            <div className="mt-4">
              <textarea
                value={futureDraft}
                onChange={(e) => setFutureDraft(e.target.value)}
                rows={5}
                maxLength={FUTURE_PERSONA_MAX}
                placeholder="예: 10년 뒤 나는 매일 아침 운동과 독서로 하루를 시작하고, 가족과 충분한 시간을 보내며 좋아하는 일로 안정적인 수익을 만든다."
                className="w-full resize-none rounded-[14px] border border-black/10 bg-white px-4 py-3 text-[14px] leading-[1.5] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between text-[11px] tracking-[-0.01em] text-black/40">
                <span>{futureDraft.length}/{FUTURE_PERSONA_MAX}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFutureCancel}
                    disabled={futureSaving}
                    className="rounded-pill border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-black/70 transition-colors hover:border-black/20 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleFutureSave}
                    disabled={futureSaving}
                    className="rounded-pill bg-[#1E1B4B] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:opacity-50"
                  >
                    {futureSaving ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            </div>
          ) : futureText ? (
            <p className="mt-4 whitespace-pre-wrap rounded-[12px] bg-[#F7F4ED] px-4 py-3 text-[14px] leading-[1.6] tracking-[-0.01em] text-[#1E1B4B]">
              {futureText}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setFutureEditing(true)}
              className="mt-4 w-full rounded-[12px] border border-dashed border-black/15 bg-[#F7F4ED] px-4 py-5 text-[13px] tracking-[-0.01em] text-black/50 transition-colors hover:border-[#1E1B4B]/40 hover:text-[#1E1B4B]"
            >
              아직 적어둔 모습이 없어요. 눌러서 작성해 보세요.
            </button>
          )}
        </section>

        {/* ── 나의 목표 (최대 10) ───────────────── */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
              나의 목표
            </h2>
            <span className="text-[12px] tracking-[-0.01em] text-black/48">
              {goals.length}/{MAX_USER_GOALS}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-[12px] tracking-[-0.01em] text-black/56">
              구체적이고 측정 가능한 형태로 적어두면 더 잘 이뤄져요. 달성한 목표는 왼쪽 동그라미를 눌러 표시하세요.
            </p>
            {goals.length > 0 && (
              <span className="shrink-0 text-[12px] font-medium tracking-[-0.01em] text-[#1E1B4B]/70">
                오늘 {achievedGoals.filter((g) => goals.includes(g)).length}/{goals.length}
              </span>
            )}
          </div>

          {goals.length > 0 && (
            <ul className="mt-4 space-y-2">
              {goals.map((goal, idx) => {
                const trimmed = goal.trim();
                const achieved = trimmed.length > 0 && achievedGoals.includes(trimmed);
                return (
                <li key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleGoalAchieved(goal)}
                    aria-label={achieved ? "달성 취소" : "오늘 달성으로 표시"}
                    aria-pressed={achieved}
                    title={achieved ? "오늘 달성함 — 취소하려면 클릭" : "오늘 달성으로 표시"}
                    disabled={trimmed.length === 0}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors ${
                      achieved
                        ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                        : "border-black/15 bg-[#F0EDE6] text-[#1E1B4B] hover:border-[#1E1B4B]"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {achieved ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </button>
                  <input
                    value={goal}
                    maxLength={GOAL_MAX}
                    onChange={(e) => handleUpdateGoal(idx, e.target.value)}
                    onBlur={() => handleCommitGoal(idx)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    className={`min-w-0 flex-1 rounded-[10px] border border-transparent bg-[#F7F4ED] px-3 py-2 text-[14px] tracking-[-0.01em] focus:border-[#1E1B4B] focus:bg-white focus:outline-none ${
                      achieved ? "text-black/40 line-through" : "text-[#1E1B4B]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveGoal(idx)}
                    aria-label="목표 삭제"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/80"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
                );
              })}
            </ul>
          )}

          {goals.length < MAX_USER_GOALS && (
            <div className="mt-3 flex items-center gap-2">
              <input
                value={goalDraft}
                maxLength={GOAL_MAX}
                onChange={(e) => setGoalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddGoal();
                  }
                }}
                placeholder="예: 매일 30분 책 읽기"
                className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                disabled={!goalDraft.trim()}
                className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
              >
                추가
              </button>
            </div>
          )}
        </section>

        {/* ── 오늘의 할 일 체크리스트 ─────────────── */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
              <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              오늘의 할 일
            </h2>
            <span className="text-[12px] tracking-[-0.01em] text-black/48">
              {completedCount}/{todos.length} 완료
            </span>
          </div>

          {todos.length > 0 && (
            <ul className="mt-4 space-y-1">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className="group flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-black/[0.02]"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleTodo(todo.id)}
                    aria-label={todo.done ? "완료 취소" : "완료"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      todo.done
                        ? "border-[#1E1B4B] bg-[#1E1B4B] text-white"
                        : "border-black/25 bg-white hover:border-[#1E1B4B]"
                    }`}
                  >
                    {todo.done && (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`min-w-0 flex-1 break-words text-[14px] tracking-[-0.01em] ${
                      todo.done ? "text-black/40 line-through" : "text-[#1E1B4B]"
                    }`}
                  >
                    {todo.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTodo(todo.id)}
                    aria-label="할 일 삭제"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-black/30 opacity-0 transition-opacity hover:bg-black/[0.04] hover:text-black/70 group-hover:opacity-100 focus:opacity-100"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input
              value={todoDraft}
              maxLength={TODO_MAX}
              onChange={(e) => setTodoDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTodo();
                }
              }}
              placeholder="오늘 꼭 해야 할 일을 적어보세요"
              className="min-w-0 flex-1 rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddTodo}
              disabled={!todoDraft.trim()}
              className="shrink-0 rounded-pill bg-[#1E1B4B] px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2A2766] disabled:cursor-not-allowed disabled:opacity-40"
            >
              추가
            </button>
          </div>

          {todos.length === 0 && (
            <p className="mt-3 text-center text-[12px] tracking-[-0.01em] text-black/40">
              오늘의 할 일을 추가해 보세요.
            </p>
          )}
        </section>

        {/* ── 오늘 스스로 잘한 일 3가지 ─────────────── */}
        <section className="rounded-[16px] border border-black/[0.06] bg-white p-5 shadow-apple">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.022em] text-[#1E1B4B]">
            <svg className="h-[18px] w-[18px] text-[#1E1B4B]/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-4.5-7-11a4 4 0 017-2.6A4 4 0 0119 10c0 6.5-7 11-7 11z" />
            </svg>
            오늘 스스로 잘한 일 {MAX_DAILY_WINS}가지
          </h2>
          <p className="mt-1 text-[12px] tracking-[-0.01em] text-black/56">
            아주 작은 일이어도 좋아요. 스스로를 칭찬하는 한 줄을 적어두세요.
          </p>

          <ul className="mt-4 space-y-2">
            {[0, 1, 2].map((idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0EDE6] text-[11px] font-semibold text-[#1E1B4B]">
                  {idx + 1}
                </span>
                <textarea
                  value={wins[idx] || ""}
                  rows={1}
                  maxLength={WIN_MAX}
                  onChange={(e) => handleChangeWin(idx, e.target.value)}
                  onBlur={handleCommitWins}
                  placeholder={
                    idx === 0
                      ? "예: 미루던 메일에 답장했다."
                      : idx === 1
                        ? "예: 아침에 10분 산책했다."
                        : "예: 가족에게 따뜻한 말 한마디를 했다."
                  }
                  className="min-h-[40px] min-w-0 flex-1 resize-none rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[14px] leading-[1.45] tracking-[-0.01em] text-[#1E1B4B] placeholder:text-black/40 focus:border-[#1E1B4B] focus:outline-none"
                />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
