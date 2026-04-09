"use client";

import { useState, useEffect } from "react";
import { onPresenceSnapshot } from "@/lib/firebase";
import type { UserPresence } from "@/types";

interface Props {
  uids: string[];
}

export default function PresenceIndicator({ uids }: Props) {
  const [presences, setPresences] = useState<Record<string, UserPresence>>({});

  useEffect(() => {
    if (uids.length === 0) return;
    const unsub = onPresenceSnapshot(uids, setPresences);
    return unsub;
  }, [uids.join(",")]);

  const onlineCount = Object.values(presences).filter((p) => p.online).length;

  if (onlineCount === 0) return null;

  return (
    <span className="flex items-center gap-1 text-xs text-green-600">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      {onlineCount}명 온라인
    </span>
  );
}
