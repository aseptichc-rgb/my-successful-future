"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const PraiseContext = createContext<(text: string) => void>(() => {});

export function usePracticePraise() {
  return useContext(PraiseContext);
}

export function PracticePraiseProvider({ children, floatingAction }: { children: ReactNode; floatingAction?: ReactNode }) {
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
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-h)+env(safe-area-inset-bottom,0px)+12px)] z-40 mx-auto flex max-w-3xl flex-col items-end gap-3 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
        <div role="status" aria-atomic="true" className="mx-auto w-full max-w-lg">
          {message && (
            <div className="flex items-start gap-3 rounded-2xl bg-[var(--soul)] px-4 py-3 text-sm leading-snug text-white shadow-lg [overflow-wrap:anywhere]">
              <span aria-hidden="true" className="shrink-0">✦</span>
              <span>{message.text}</span>
            </div>
          )}
        </div>
        {floatingAction}
      </div>
    </PraiseContext.Provider>
  );
}
