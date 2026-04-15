"use client";

import { useState, useEffect, useCallback } from "react";
import {
  onPersonaOverridesSnapshot,
  upsertPersonaOverride,
  deletePersonaOverride,
} from "@/lib/firebase";
import type { PersonaOverride, PersonaOverrideInput, BuiltinPersonaId } from "@/types";

/**
 * 빌트인 페르소나의 사용자별 오버라이드를 구독/편집한다.
 * 존재하지 않는 키 → 기본값 사용.
 */
export function usePersonaOverrides(uid: string | undefined) {
  const [map, setMap] = useState<Record<string, PersonaOverride>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setMap({});
      setLoading(false);
      return;
    }
    const unsub = onPersonaOverridesSnapshot(uid, (m) => {
      setMap(m);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  const upsert = useCallback(
    async (personaId: BuiltinPersonaId, data: PersonaOverrideInput) => {
      if (!uid) return;
      try {
        await upsertPersonaOverride(uid, personaId, data);
      } catch (error) {
        console.error("페르소나 오버라이드 저장 실패:", error);
        throw error;
      }
    },
    [uid]
  );

  const reset = useCallback(
    async (personaId: BuiltinPersonaId) => {
      if (!uid) return;
      try {
        await deletePersonaOverride(uid, personaId);
      } catch (error) {
        console.error("페르소나 오버라이드 리셋 실패:", error);
        throw error;
      }
    },
    [uid]
  );

  return { map, loading, upsert, reset };
}
