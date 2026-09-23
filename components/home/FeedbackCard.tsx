"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLanguage } from "@/lib/i18n";
import Sheet from "@/components/ui/Sheet";
import { authedFetch } from "@/lib/authedFetch";
import { FEEDBACK_MAX_LEN, feedbackAckStore, shouldShowFeedbackCard } from "@/lib/feedbackCard";
import { detectEventPlatform, track } from "@/lib/track";
import type { AffirmationStreak } from "@/types";

/* ─────────────────────────────────────────────────────────────────
 * FeedbackCard — 3일 스트릭 뒤 한 번만 뜨는 "만든 사람에게 한마디".
 *
 * StoreReviewCard 와 같은 골격(자격은 lib/feedbackCard 순수 함수, 확인은 ackStore).
 * 다른 점은 목적지다 — 스토어가 아니라 우리 서버(/api/feedback → Firestore + 텔레그램).
 *
 *   [한마디 남기기]  → 시트(본문 + "답장 받아도 괜찮아요") → 전송 → 영구 종료
 *   [괜찮아요]       → 영구 종료 (다시 묻지 않는다)
 *
 * 시트에서 취소하면 카드는 그대로 남는다 — 눌렀다가 마음이 바뀐 건 "답한 것" 이 아니다.
 * 전송 성공 뒤엔 짧은 감사 문구를 시트 안에 보여주고, 시트를 닫을 때 카드도 사라진다.
 *
 * SSR 스냅샷은 "이미 답함"(true) — 서버 렌더에서는 항상 숨겨졌다가 하이드레이션 후에만
 * 실제 값으로 판정된다(StoreReviewCard 와 같은 규칙).
 * ───────────────────────────────────────────────────────────────── */

const SEND_TIMEOUT_MS = 10_000;

type SendState = "idle" | "sending" | "done" | "failed";

export default function FeedbackCard({ streak }: { streak: AffirmationStreak | undefined }) {
  const { t, locale } = useLanguage();
  const acked = useSyncExternalStore(
    feedbackAckStore.subscribe,
    feedbackAckStore.getSnapshot,
    feedbackAckStore.getServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [state, setState] = useState<SendState>("idle");

  const visible = shouldShowFeedbackCard({ streak, acked });

  useEffect(() => {
    if (visible) track("feedback_card_shown");
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    track("feedback_card_dismissed");
    feedbackAckStore.acknowledge(true);
  };

  const closeSheet = () => {
    setOpen(false);
    // 보냈으면 카드도 접는다. 취소면 카드는 남는다.
    if (state === "done") feedbackAckStore.acknowledge(true);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || state === "sending") return;
    setState("sending");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await authedFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ text: body, contactOk, locale, platform: detectEventPlatform() }),
        signal: controller.signal,
      });
      setState(res.ok ? "done" : "failed");
    } catch (err) {
      console.warn("[feedback] 전송 실패:", err instanceof Error ? err.message : String(err));
      setState("failed");
    } finally {
      clearTimeout(timer);
    }
  };

  return (
    <>
      <div className="mx-4 mt-4 rounded-[12px] bg-[var(--bg-grouped-2)] px-5 py-4">
        <p className="text-[17px] font-semibold tracking-[-0.43px] text-[var(--label)]">
          {t("feedback.title")}
        </p>
        <p className="mt-1.5 text-[13px] leading-[18px] tracking-[-0.08px] text-[var(--label-2)]">
          {t("feedback.body")}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-[#1E1B4B] px-4 py-2 text-[15px] font-semibold text-white"
          >
            {t("feedback.cta")}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto text-[15px] font-medium text-[var(--label-3)]"
          >
            {t("feedback.later")}
          </button>
        </div>
      </div>

      {open && (
        <Sheet onClose={closeSheet} title={t("feedback.sheet.title")}>
          {state === "done" ? (
            <div className="flex flex-col gap-4 pb-2">
              <p className="text-[15px] leading-[22px] text-[var(--label)]">
                {t("feedback.sheet.done")}
              </p>
              <button
                type="button"
                onClick={closeSheet}
                className="w-full rounded-[14px] bg-[#1E1B4B] py-3.5 text-[17px] font-semibold text-white"
              >
                {t("common.close")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, FEEDBACK_MAX_LEN))}
                placeholder={t("feedback.sheet.placeholder")}
                rows={5}
                maxLength={FEEDBACK_MAX_LEN}
                autoFocus
                className="w-full resize-none rounded-[12px] bg-[var(--bg-grouped-2)] px-4 py-3 text-[15px] leading-[22px] text-[var(--label)] outline-none placeholder:text-[var(--label-3)]"
              />
              <div className="flex items-center justify-between text-[12px] text-[var(--label-3)]">
                <span>
                  {text.length}/{FEEDBACK_MAX_LEN}
                </span>
              </div>
              <label className="flex items-start gap-2 text-[14px] leading-[20px] text-[var(--label-2)]">
                <input
                  type="checkbox"
                  checked={contactOk}
                  onChange={(e) => setContactOk(e.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>{t("feedback.sheet.contactOk")}</span>
              </label>
              {state === "failed" && (
                <p className="text-[13px] text-red-600">{t("feedback.sheet.failed")}</p>
              )}
              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || state === "sending"}
                className="w-full rounded-[14px] bg-[#1E1B4B] py-3.5 text-[17px] font-semibold text-white disabled:opacity-40"
              >
                {state === "sending" ? t("feedback.sheet.sending") : t("feedback.sheet.send")}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
