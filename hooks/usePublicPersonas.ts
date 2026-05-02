"use client";

import { useEffect, useState, useCallback } from "react";
import { onPublicPersonasSnapshot, clonePublicPersona } from "@/lib/firebase";
import type { PublicPersona } from "@/types";

/**
 * 모든 공개 페르소나를 실시간 구독한다.
 * 본인이 작성한 항목은 호출 측에서 currentUid 로 필터하면 된다.
 */
export function usePublicPersonas() {
  const [list, setList] = useState<PublicPersona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onPublicPersonasSnapshot((items) => {
      setList(items);
      setLoading(false);
    });
    return unsub;
  }, []);

  const clone = useCallback(async (uid: string, publicPersonaId: string) => {
    return clonePublicPersona(uid, publicPersonaId);
  }, []);

  return { list, loading, clone };
}
