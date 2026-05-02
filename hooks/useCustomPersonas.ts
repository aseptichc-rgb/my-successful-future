"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  onCustomPersonasSnapshot,
  createCustomPersona,
  updateCustomPersona,
  deleteCustomPersona,
} from "@/lib/firebase";
import type { CustomPersona } from "@/types";

export function useCustomPersonas(uid: string | undefined) {
  const [map, setMap] = useState<Record<string, CustomPersona>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const unsub = onCustomPersonasSnapshot(uid, (m) => {
      setMap(m);
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  const list = useMemo<CustomPersona[]>(() => {
    return Object.values(map).sort((a, b) => {
      const at = a.createdAt?.toMillis?.() ?? 0;
      const bt = b.createdAt?.toMillis?.() ?? 0;
      return at - bt;
    });
  }, [map]);

  const create = useCallback(
    async (
      data: Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition"> &
        Partial<Pick<CustomPersona, "photoUrl" | "isPublic">>,
      creatorName?: string,
    ) => {
      if (!uid) return;
      return createCustomPersona(uid, data, creatorName);
    },
    [uid]
  );

  const edit = useCallback(
    async (
      id: string,
      updates: Partial<Pick<CustomPersona, "name" | "icon" | "description" | "systemPromptAddition" | "photoUrl" | "isPublic">>,
      creatorName?: string,
    ) => {
      if (!uid) return;
      await updateCustomPersona(uid, id, updates, creatorName);
    },
    [uid]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!uid) return;
      await deleteCustomPersona(uid, id);
    },
    [uid]
  );

  return { map, list, loading, create, edit, remove };
}
