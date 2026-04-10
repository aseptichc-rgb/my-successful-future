"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  addMessage,
  saveKeywordAlertConfig,
  onKeywordAlertConfigSnapshot,
  updateKeywordAlertLastChecked,
} from "@/lib/firebase";
import type { KeywordAlertConfig, KeywordAlertResponse } from "@/types";

const DEFAULT_INTERVAL = 60; // 기본 60분

/**
 * 사용자가 직접 등록한 키워드에 대해 주기적으로 뉴스를 검색해
 * 채팅방에 알림 메시지로 게시하는 훅. 페르소나 불필요.
 */
export function useKeywordAlert(sessionId: string) {
  const [config, setConfig] = useState<KeywordAlertConfig | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);

  // Firestore 실시간 동기화
  useEffect(() => {
    if (!sessionId) return;
    const unsub = onKeywordAlertConfigSnapshot(sessionId, setConfig);
    return unsub;
  }, [sessionId]);

  // 실제 뉴스 체크
  const checkNews = useCallback(async () => {
    if (!config?.enabled || !config.keywords?.length) return;
    if (isCheckingRef.current) return;

    isCheckingRef.current = true;
    setIsChecking(true);
    setLastCheckResult(null);

    try {
      const response = await fetch("/api/keyword-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          keywords: config.keywords,
        }),
      });

      if (!response.ok) {
        setLastCheckResult("알림 체크 실패");
        return;
      }

      const data: KeywordAlertResponse = await response.json();

      if (data.hasNews && data.content) {
        // "키워드 알림" 표식으로 페르소나 정보 주입
        const headline = data.matchedKeyword
          ? `🔔 [${data.matchedKeyword}] 키워드 알림`
          : "🔔 키워드 알림";

        // 첫 단락에 헤더 라인 부착
        const fullContent = `${headline}\n\n${data.content}`;

        // 문단별로 분리해 저장
        const paragraphs = fullContent
          .split("\n\n")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

        for (let i = 0; i < paragraphs.length; i++) {
          const isLast = i === paragraphs.length - 1;
          await addMessage(
            sessionId,
            "assistant",
            paragraphs[i],
            isLast ? data.sources || [] : [],
            {
              personaId: "keyword-alert",
              personaName: "키워드 알림",
              personaIcon: "🔔",
            }
          );
        }

        setLastCheckResult(
          data.matchedKeyword
            ? `"${data.matchedKeyword}" 관련 새 뉴스를 알렸습니다`
            : "새 뉴스를 알렸습니다"
        );
      } else {
        setLastCheckResult("현재 새로운 뉴스가 없습니다");
      }

      await updateKeywordAlertLastChecked(sessionId);
    } catch (error) {
      console.error("키워드 알림 체크 실패:", error);
      setLastCheckResult("알림 체크 중 오류");
    } finally {
      setIsChecking(false);
      isCheckingRef.current = false;
    }
  }, [config, sessionId]);

  // 인터벌 등록/해제
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!config?.enabled) return;
    if (!config.keywords || config.keywords.length === 0) return;

    const intervalMs = (config.intervalMinutes || DEFAULT_INTERVAL) * 60 * 1000;

    // 페이지 진입 시 마지막 체크 이후 인터벌 경과 시 즉시 체크
    if (config.lastCheckedAt) {
      const elapsed = Date.now() - config.lastCheckedAt.toMillis();
      if (elapsed >= intervalMs) {
        checkNews();
      }
    } else {
      // 처음 활성화 시 30초 후 첫 체크
      const initTimer = setTimeout(checkNews, 30000);
      intervalRef.current = setInterval(checkNews, intervalMs);
      return () => {
        clearTimeout(initTimer);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }

    intervalRef.current = setInterval(checkNews, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [config?.enabled, config?.intervalMinutes, config?.lastCheckedAt, config?.keywords?.length, checkNews]);

  // 설정 업데이트
  const updateConfig = useCallback(
    async (updates: Partial<KeywordAlertConfig>) => {
      const newConfig: KeywordAlertConfig = {
        enabled: config?.enabled ?? false,
        intervalMinutes: config?.intervalMinutes ?? DEFAULT_INTERVAL,
        keywords: config?.keywords ?? [],
        ...updates,
      };
      await saveKeywordAlertConfig(sessionId, newConfig);
    },
    [sessionId, config]
  );

  const toggleEnabled = useCallback(
    async (enabled: boolean) => {
      await updateConfig({ enabled });
    },
    [updateConfig]
  );

  const setKeywords = useCallback(
    async (keywords: string[]) => {
      await updateConfig({ keywords });
    },
    [updateConfig]
  );

  const setIntervalMinutes = useCallback(
    async (minutes: number) => {
      await updateConfig({ intervalMinutes: minutes });
    },
    [updateConfig]
  );

  const manualCheck = useCallback(async () => {
    await checkNews();
  }, [checkNews]);

  return {
    config,
    isChecking,
    lastCheckResult,
    toggleEnabled,
    setKeywords,
    setIntervalMinutes,
    manualCheck,
  };
}
