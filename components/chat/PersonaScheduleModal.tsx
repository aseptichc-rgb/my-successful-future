"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getPersonaSchedule,
  savePersonaSchedule,
  deletePersonaSchedule,
} from "@/lib/firebase";
import {
  HHMM_PATTERN,
  MAX_KEYWORDS,
  MAX_SCHEDULED_SLOTS,
} from "@/lib/constants/keyword-alert";
import { getCuratedKeywords } from "@/lib/curated-keywords";
import type { PersonaId, ScheduledNewsSlot } from "@/types";

interface Props {
  personaId: PersonaId;
  personaName: string;
  personaIcon: string;
  onClose: () => void;
}

const DEFAULT_SLOT_TIME = "07:00";

export default function PersonaScheduleModal({
  personaId,
  personaName,
  personaIcon,
  onClose,
}: Props) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  const [enabled, setEnabled] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [slots, setSlots] = useState<ScheduledNewsSlot[]>([{ time: DEFAULT_SLOT_TIME }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const curated = useMemo(() => getCuratedKeywords(personaId), [personaId]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getPersonaSchedule(uid, String(personaId));
        if (cancelled) return;
        if (cfg) {
          setEnabled(cfg.enabled);
          setKeywords(cfg.keywords ?? []);
          setSlots(
            (cfg.scheduledTimes ?? []).length > 0
              ? cfg.scheduledTimes
              : [{ time: DEFAULT_SLOT_TIME }]
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "불러오기 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, personaId]);

  const slotTimesValid = useMemo(
    () => slots.every((s) => HHMM_PATTERN.test(s.time)),
    [slots]
  );
  const canSave =
    !saving &&
    !!uid &&
    slotTimesValid &&
    (!enabled || (keywords.length > 0 && slots.length > 0));

  function tryAddKeyword(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (keywords.includes(trimmed)) return false;
    if (keywords.length >= MAX_KEYWORDS) {
      setError(`키워드는 최대 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
      return false;
    }
    setKeywords((prev) => [...prev, trimmed]);
    setError(null);
    return true;
  }

  function addKeywordFromDraft() {
    if (tryAddKeyword(keywordDraft)) {
      setKeywordDraft("");
    } else if (keywords.includes(keywordDraft.trim())) {
      setKeywordDraft("");
    }
  }

  function removeKeyword(k: string) {
    setKeywords(keywords.filter((x) => x !== k));
  }

  function updateSlot(index: number, time: string) {
    setSlots(slots.map((s, i) => (i === index ? { ...s, time } : s)));
  }

  function addSlot() {
    if (slots.length >= MAX_SCHEDULED_SLOTS) {
      setError(`시간 슬롯은 최대 ${MAX_SCHEDULED_SLOTS}개까지 등록할 수 있어요.`);
      return;
    }
    setSlots([...slots, { time: DEFAULT_SLOT_TIME }]);
    setError(null);
  }

  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!uid || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const dedupedSlots = Array.from(
        new Map(slots.map((s) => [s.time, s])).values()
      );
      await savePersonaSchedule(uid, String(personaId), {
        enabled,
        keywords,
        scheduledTimes: dedupedSlots,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisableAll() {
    if (!uid) return;
    if (!confirm("정시 뉴스 알림 설정을 완전히 삭제할까요?")) return;
    setSaving(true);
    try {
      await deletePersonaSchedule(uid, String(personaId));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{personaIcon}</span>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                {personaName}의 정시 뉴스 알림
              </h2>
              <p className="text-[11px] text-gray-500">
                키워드 기반으로 매일 정해진 시각에 자동으로 뉴스를 검색해 채팅방에 보내줘요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-xs text-gray-400">불러오는 중...</p>
          ) : (
            <>
              {/* 활성화 토글 */}
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">정시 뉴스 알림</p>
                  <p className="text-[11px] text-gray-500">
                    꺼두면 정시 크론과 최초 진입 실시간 브리프 모두 비활성화돼요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors ${
                    enabled ? "bg-violet-500" : "bg-gray-300"
                  }`}
                  aria-pressed={enabled}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* 키워드 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    검색 키워드
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {keywords.length}/{MAX_KEYWORDS}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addKeywordFromDraft();
                      }
                    }}
                    placeholder="자유 입력 — 예: K-바이오, AI 스타트업"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={addKeywordFromDraft}
                    disabled={!keywordDraft.trim() || keywords.length >= MAX_KEYWORDS}
                    className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>
                {keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs text-violet-700"
                      >
                        {k}
                        <button
                          type="button"
                          onClick={() => removeKeyword(k)}
                          className="text-violet-400 hover:text-violet-600"
                          aria-label={`${k} 삭제`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 추천 키워드 풀 */}
                {curated.length > 0 && (
                  <div className="mt-3 space-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
                    <p className="text-[11px] font-medium text-gray-600">
                      추천 키워드 · 클릭해서 바로 추가
                    </p>
                    {curated.map((group) => (
                      <div key={group.category}>
                        <p className="mb-1 text-[10px] text-gray-400">{group.category}</p>
                        <div className="flex flex-wrap gap-1">
                          {group.keywords.map((k) => {
                            const selected = keywords.includes(k);
                            const disabled = selected || keywords.length >= MAX_KEYWORDS;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => tryAddKeyword(k)}
                                disabled={disabled}
                                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                                  selected
                                    ? "border-violet-300 bg-violet-100 text-violet-700"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                              >
                                {selected ? "✓ " : "+ "}
                                {k}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 시간 슬롯 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    발송 시각 (KST 24h)
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {slots.length}/{MAX_SCHEDULED_SLOTS}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {slots.map((slot, idx) => {
                    const valid = HHMM_PATTERN.test(slot.time);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={slot.time}
                          onChange={(e) => updateSlot(idx, e.target.value)}
                          className={`rounded-lg border px-3 py-1.5 text-sm text-gray-900 ${
                            valid ? "border-gray-300" : "border-red-300"
                          }`}
                        />
                        {slot.lastFiredYmd && (
                          <span className="text-[11px] text-gray-400">
                            마지막 발송: {slot.lastFiredYmd}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSlot(idx)}
                          disabled={slots.length <= 1}
                          className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-50 disabled:opacity-30"
                        >
                          삭제
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={addSlot}
                  disabled={slots.length >= MAX_SCHEDULED_SLOTS}
                  className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  + 시간 추가
                </button>
              </div>

              <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                ⚠️ Vercel Hobby 플랜에서는 서버 크론이 하루 1회 09:00 KST 전후만 동작해요.
                다른 시각 슬롯도 등록해두면, 채팅방에 처음 진입할 때 당일 브리프가 없을 경우 실시간으로 한 번 생성돼요.
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={handleDisableAll}
            disabled={loading || saving}
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            설정 삭제
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
