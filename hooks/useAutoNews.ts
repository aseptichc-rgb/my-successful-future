"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { addMessage, saveAutoNewsConfig, onAutoNewsConfigSnapshot, updateAutoNewsLastChecked } from "@/lib/firebase";
import { getPersona, PERSONA_SPECIALTIES } from "@/lib/personas";
import type { AutoNewsConfig, AutoNewsResponse, PersonaId } from "@/types";

const DEFAULT_INTERVAL = 60; // 기본 60분

interface UseAutoNewsOptions {
  futurePersona?: string;
  currentPersona?: string;
}

export function useAutoNews(sessionId: string, options?: UseAutoNewsOptions) {
  const [config, setConfig] = useState<AutoNewsConfig | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Firestore에서 자동 뉴스 설정 실시간 동기화
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onAutoNewsConfigSnapshot(sessionId, setConfig);
    return unsub;
  }, [sessionId]);

  // 단일 페르소나의 자동 뉴스 체크
  const checkPersonaNews = useCallback(
    async (personaId: PersonaId, customTopics?: string[]) => {
      try {
        const response = await fetch("/api/auto-news", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            personaId,
            customTopics,
            futurePersona: optionsRef.current?.futurePersona,
            currentPersona: optionsRef.current?.currentPersona,
          }),
        });

        if (!response.ok) return null;

        const data: AutoNewsResponse = await response.json();

        if (data.hasNews && data.content) {
          const persona = getPersona(personaId);

          // 문단별로 분리하여 Firestore에 저장
          const paragraphs = data.content
            .split("\n\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

          for (let i = 0; i < paragraphs.length; i++) {
            const isLast = i === paragraphs.length - 1;
            await addMessage(
              sessionId,
              "assistant",
              paragraphs[i],
              isLast ? (data.sources || []) : [],
              {
                personaId,
                personaName: persona.name,
                personaIcon: persona.icon,
              }
            );
          }

          return persona.name;
        }

        return null;
      } catch (error) {
        console.error(`자동 뉴스 체크 실패 (${personaId}):`, error);
        return null;
      }
    },
    [sessionId]
  );

  // 모든 활성 페르소나에 대해 자동 뉴스 체크
  const checkAllNews = useCallback(async () => {
    if (!config?.enabled || !config.activePersonas.length) return;
    if (isCheckingRef.current) return;

    isCheckingRef.current = true;
    setIsChecking(true);
    setLastCheckResult(null);

    const results: string[] = [];

    // 페르소나 순차 실행 (API 부하 방지)
    for (const personaId of config.activePersonas) {
      const name = await checkPersonaNews(personaId, config.customTopics);
      if (name) results.push(name);
    }

    await updateAutoNewsLastChecked(sessionId);

    if (results.length > 0) {
      setLastCheckResult(`${results.join(", ")}이(가) 새 뉴스를 공유했습니다`);
    } else {
      setLastCheckResult("현재 주요 새 뉴스가 없습니다");
    }

    setIsChecking(false);
    isCheckingRef.current = false;
  }, [config, sessionId, checkPersonaNews]);

  // 인터벌 설정/해제
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!config?.enabled) return;

    const intervalMs = (config.intervalMinutes || DEFAULT_INTERVAL) * 60 * 1000;

    // 페이지 진입 시 마지막 체크 이후 인터벌이 지났으면 즉시 체크
    if (config.lastCheckedAt) {
      const lastChecked = config.lastCheckedAt.toMillis();
      const elapsed = Date.now() - lastChecked;
      if (elapsed >= intervalMs) {
        checkAllNews();
      }
    } else {
      // 처음 활성화 시 30초 후 첫 체크 (페이지 로드 안정화 대기)
      const initTimer = setTimeout(checkAllNews, 30000);
      return () => clearTimeout(initTimer);
    }

    intervalRef.current = setInterval(checkAllNews, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [config?.enabled, config?.intervalMinutes, config?.lastCheckedAt, checkAllNews]);

  // 자동 뉴스 설정 업데이트
  const updateConfig = useCallback(
    async (updates: Partial<AutoNewsConfig>) => {
      const newConfig: AutoNewsConfig = {
        enabled: config?.enabled ?? false,
        intervalMinutes: config?.intervalMinutes ?? DEFAULT_INTERVAL,
        activePersonas: config?.activePersonas ?? [],
        customTopics: config?.customTopics ?? [],
        ...updates,
      };
      await saveAutoNewsConfig(sessionId, newConfig);
    },
    [sessionId, config]
  );

  // 자동 뉴스 활성화/비활성화
  const toggleAutoNews = useCallback(
    async (enabled: boolean) => {
      await updateConfig({ enabled });
    },
    [updateConfig]
  );

  // 페르소나 토글
  const togglePersona = useCallback(
    async (personaId: PersonaId) => {
      const current = config?.activePersonas ?? [];
      const next = current.includes(personaId)
        ? current.filter((id) => id !== personaId)
        : [...current, personaId];
      await updateConfig({ activePersonas: next });
    },
    [config?.activePersonas, updateConfig]
  );

  // 커스텀 토픽 업데이트
  const setCustomTopics = useCallback(
    async (topics: string[]) => {
      await updateConfig({ customTopics: topics });
    },
    [updateConfig]
  );

  // 인터벌 변경
  const setInterval_ = useCallback(
    async (minutes: number) => {
      await updateConfig({ intervalMinutes: minutes });
    },
    [updateConfig]
  );

  // 수동 체크
  const manualCheck = useCallback(async () => {
    await checkAllNews();
  }, [checkAllNews]);

  return {
    config,
    isChecking,
    lastCheckResult,
    toggleAutoNews,
    togglePersona,
    setCustomTopics,
    setInterval: setInterval_,
    manualCheck,
  };
}
