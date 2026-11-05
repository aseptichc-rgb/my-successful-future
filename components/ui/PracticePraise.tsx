"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const PraiseContext = createContext<(text: string) => void>(() => {});

export function usePracticePraise() {
  return useContext(PraiseContext);
}

export function PracticePraiseProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string } | null>(null);
  const showPraise = useCallback((text: string) => {
    if (document.visibilityState === "visible") setMessage({ text });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 6500);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <PraiseContext.Provider value={showPraise}>
      {children}
      <div role="status" aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px)+12px)] z-40 mx-auto max-w-lg px-4">
        {message && (
          <div className="flex items-start gap-3 rounded-2xl bg-[var(--soul)] px-4 py-3 text-sm leading-snug text-white shadow-lg [overflow-wrap:anywhere]">
            <span aria-hidden="true" className="shrink-0">✦</span>
            <span>{message.text}</span>
          </div>
        )}
      </div>
    </PraiseContext.Provider>
  );
}
