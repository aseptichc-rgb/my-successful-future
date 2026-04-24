"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  addMessage,
  saveDailyRitualConfig,
  onDailyRitualConfigSnapshot,
} from "@/lib/firebase";
import type { DailyRitualConfig, MoodKind } from "@/types";

interface UseDailyRitualOptions {
  userPersona?: string;
  futurePersona?: string;
  userMemory?: string;
  mood?: MoodKind;
}

const DEFAULT_CONFIG: DailyRitualConfig = {
  enabled: false,
  morningEnabled: true,
  morningTime: "07:00",
  eveningEnabled: true,
  eveningTime: "22:00",
};

// 현재 KST를 "YYYY-MM-DD" 와 "HH:mm" 으로 리턴
function getKstClock(): { date: string; time: string; minutes: number } {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const hh = kst.getUTCHours();
  const mm = kst.getUTCMinutes();
  return {
    date: `${y}-${m}-${d}`,
    time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    minutes: hh * 60 + mm,
  };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

// 설정 시각 ±10분 허용 범위 내면 true
function withinWindow(nowMinutes: number, targetHHMM: string, windowMinutes = 10): boolean {
  const target = hhmmToMinutes(targetHHMM);
  const diff = nowMinutes - target;
  return diff >= 0 && diff <= windowMinutes;
}

export function useDailyRitual(
  uid: string | undefined,
  sessionId: string | undefined,
  options: UseDailyRitualOptions
) {
  const [config, setConfig] = useState<DailyRitualConfig | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const inFlightRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Firestore 설정 구독
  useEffect(() => {
    if (!uid) {
      setConfig(null);
      return;
    }
    const unsub = onDailyRitualConfigSnapshot(uid, setConfig);
    return unsub;
  }, [uid]);

  const runRitual = useCallback(
    async (kind: "morning" | "evening") => {
      if (!uid || !sessionId) return;
      if (inFlightRef.current) return;
      const { futurePersona, userPersona, userMemory, mood } = optionsRef.current;
      if (!futurePersona || futurePersona.trim().length === 0) return;

      inFlightRef.current = true;
      try {
        const res = await fetch("/api/daily-ritual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            currentPersona: userPersona || undefined,
            futurePersona,
            userMemory: userMemory || undefined,
            mood: mood && mood !== "unknown" ? mood : undefined,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const content: string = data.content || "";
        if (!content.trim()) return;

        // 문단별로 메시지 저장
        const paragraphs = content
          .split("\n\n")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        const kindLabel = kind === "morning" ? "☀️ 아침 브리프" : "🌙 저녁 회고";
        for (let i = 0; i < paragraphs.length; i++) {
          const text = i === 0 ? `${kindLabel}\n\n${paragraphs[i]}` : paragraphs[i];
          await addMessage(sessionId, "assistant", text, [], {
            personaId: "future-self",
            personaName: "미래의 나",
            personaIcon: "🌟",
          });
        }

        const { date } = getKstClock();
        const update: Partial<DailyRitualConfig> =
          kind === "morning" ? { lastMorningDate: date } : { lastEveningDate: date };
        await saveDailyRitualConfig(uid, update);
      } catch (err) {
        console.warn("Daily ritual 실패:", err);
      } finally {
        inFlightRef.current = false;
      }
    },
    [uid, sessionId]
  );

  // 폴링: 1분마다 체크, 해당 시간대 진입 + 오늘 아직 안 보냈으면 발송
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!config?.enabled || !uid || !sessionId) return;
    if (!config.sessionId || config.sessionId !== sessionId) {
      // 첫 활성화 시 sessionId 저장
      saveDailyRitualConfig(uid, { sessionId }).catch(() => {});
    }

    const tick = () => {
      const { date, minutes } = getKstClock();
      if (config.morningEnabled && config.lastMorningDate !== date) {
        if (withinWindow(minutes, config.morningTime)) {
          void runRitual("morning");
        }
      }
      if (config.eveningEnabled && config.lastEveningDate !== date) {
        if (withinWindow(minutes, config.eveningTime)) {
          void runRitual("evening");
        }
      }
    };

    // 즉시 한 번, 이후 1분마다
    tick();
    pollRef.current = setInterval(tick, 60 * 1000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [
    config?.enabled,
    config?.morningEnabled,
    config?.eveningEnabled,
    config?.morningTime,
    config?.eveningTime,
    config?.lastMorningDate,
    config?.lastEveningDate,
    config?.sessionId,
    uid,
    sessionId,
    runRitual,
  ]);

  const updateConfig = useCallback(
    async (updates: Partial<DailyRitualConfig>) => {
      if (!uid) return;
      const base: DailyRitualConfig = {
        ...DEFAULT_CONFIG,
        ...(config || {}),
        ...updates,
      };
      await saveDailyRitualConfig(uid, base);
    },
    [uid, config]
  );

  const triggerNow = useCallback(
    async (kind: "morning" | "evening") => {
      await runRitual(kind);
    },
    [runRitual]
  );

  return {
    config: config || null,
    updateConfig,
    triggerNow,
  };
}
