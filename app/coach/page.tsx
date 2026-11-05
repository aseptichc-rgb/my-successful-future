"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/nav/BackButton";
import BootSplash from "@/components/ui/BootSplash";
import { COACH_CONTEXT_TURNS, COACH_DAILY_QUESTION_LIMIT, COACH_PROFILE_CONSENT_VERSION, COACH_QUESTION_MAX, type CoachReply, type CoachUsage } from "@/lib/aiCoachTypes";
import { authedFetch } from "@/lib/authedFetch";
import { useAuth } from "@/lib/auth-context";
import { hasProAccess } from "@/lib/entitlement";
import { useLanguage, useT } from "@/lib/i18n";
import { addKstDays, todayKstYmd } from "@/lib/kstDate";
import { backOrReplace } from "@/lib/navigation";

const CHAT_API = "/api/coach/chat";
const PRO_FEATURES = [
  "coach.chat.affirmations",
  "coach.chat.obstacles",
  "coach.chat.encouragement",
  "coach.chat.future",
  "coach.chat.feature",
] as const;

type ChatError = "coach.chat.access" | "coach.chat.usageError" | "coach.chat.replyError";
type Exchange = { question: string; reply: CoachReply };

function Chat({ uid }: { uid: string }) {
  const { locale, t } = useLanguage();
  const consentKey = `anima:coach-consent:${COACH_PROFILE_CONSENT_VERSION}:${uid}`;
  const [usage, setUsage] = useState<CoachUsage | null>(null);
  const [revision, setRevision] = useState(0);
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(() => {
    try { return window.localStorage.getItem(consentKey) === "granted"; }
    catch { return false; }
  });
  const [turns, setTurns] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const sending = useRef(false);

  function updateConsent(granted: boolean) {
    setConsent(granted);
    try {
      if (granted) window.localStorage.setItem(consentKey, "granted");
      else window.localStorage.removeItem(consentKey);
    } catch {
      // The choice still applies while this screen is open.
    }
  }

  useEffect(() => {
    const syncConsent = (event: StorageEvent) => {
      if (event.key === consentKey || event.key === null) setConsent(event.newValue === "granted");
    };
    window.addEventListener("storage", syncConsent);
    return () => window.removeEventListener("storage", syncConsent);
  }, [consentKey]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    let active = true;
    async function loadUsage() {
      try {
        const response = await authedFetch(CHAT_API, { signal: controller.signal });
        if (!active || sending.current) return;
        if (response.status === 402) {
          setUsage(null);
          setError("coach.chat.access");
          return;
        }
        if (!response.ok) throw new Error();
        const data = await response.json() as { usage: CoachUsage };
        if (active && !sending.current) {
          setUsage(data.usage);
          setError(null);
        }
      } catch {
        if (active && !sending.current) {
          setUsage(null);
          setError("coach.chat.usageError");
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void loadUsage();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [revision]);

  const usageDay = usage?.ymd;
  useEffect(() => {
    if (!usageDay) return;
    const refreshIfNewDay = () => {
      if (!sending.current && usageDay !== todayKstYmd()) setRevision((value) => value + 1);
    };
    const midnight = Date.parse(`${addKstDays(usageDay, 1)}T00:00:00+09:00`);
    const timer = window.setTimeout(refreshIfNewDay, Math.max(0, midnight - Date.now() + 200));
    document.addEventListener("visibilitychange", refreshIfNewDay);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshIfNewDay);
    };
  }, [usageDay]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || !consent || !usage?.remaining || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const history = turns.filter(({ reply }) => reply.kind === "answer").slice(-COACH_CONTEXT_TURNS)
        .map(({ question: previous, reply }) => ({ question: previous, answer: reply.text }));
      const response = await authedFetch(CHAT_API, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          question: text, history, language: locale, consent, profileConsentVersion: COACH_PROFILE_CONSENT_VERSION,
        }),
      });
      const data = await response.json() as { usage?: CoachUsage; reply?: CoachReply };
      setUsage(data.usage ?? null);
      if (response.status === 429) return;
      if (response.status === 402) {
        setError("coach.chat.access");
        return;
      }
      if (!response.ok || !data.reply) {
        setError("coach.chat.replyError");
        return;
      }
      const reply = data.reply;
      setTurns((previous) => [...previous, { question: text, reply }]);
      setQuestion("");
    } catch {
      setUsage(null);
      setError("coach.chat.replyError");
    } finally {
      window.clearTimeout(timeout);
      sending.current = false;
      setBusy(false);
      if (usageDay !== todayKstYmd()) setRevision((value) => value + 1);
    }
  }

  return (
    <section aria-labelledby="coach-title" className="mt-6 space-y-4 rounded-2xl bg-[var(--bg-grouped-2)] p-4 sm:p-6">
      <div role="status">
        <p className="font-semibold">{usage ? t("coach.chat.remaining", usage) : t("coach.chat.feature", { limit: COACH_DAILY_QUESTION_LIMIT })}</p>
        <p className="mt-1 text-sm text-[var(--label-2)]">{t("coach.chat.reset")}</p>
        {usage?.remaining === 0 && <p className="mt-2 text-sm">{t("coach.chat.exhausted")}</p>}
      </div>
      {turns.length > 0 && (
        <ol aria-live="polite" className="space-y-4">
          {turns.map(({ question: text, reply }, index) => (
            <li key={index} className="space-y-2 [overflow-wrap:anywhere]">
              <div className="ml-6 rounded-2xl bg-[var(--soul-soft)] p-4">
                <p className="mb-1 text-sm font-semibold">{t("coach.chat.question")}</p>
                <p>{text}</p>
              </div>
              <div className="mr-6 rounded-2xl bg-[var(--bg-grouped)] p-4">
                <p className="mb-1 text-sm font-semibold">{t("coach.chat.answer")}</p>
                <p>{reply.kind === "answer" ? reply.text : t(`coach.chat.${reply.kind}`)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-sm text-[var(--label-2)]">{t(error)}</p>}
      {!usage && error && (
        <button type="button" className="min-h-11 text-[var(--soul)] underline" onClick={() => setRevision((value) => value + 1)}>
          {t("common.retry")}
        </button>
      )}
      {!usage && !error && <p role="status" className="text-sm">{t("common.loading")}</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--soul)]" checked={consent}
          disabled={busy} onChange={(event) => updateConsent(event.target.checked)} />
        {t("coach.chat.consent")}
      </label>
      {Boolean(usage?.remaining) && (
        <form onSubmit={(event) => void ask(event)} className="space-y-3" aria-busy={busy}>
          <label htmlFor="coach-question" className="block font-semibold">{t("coach.chat.label")}</label>
          <textarea
            id="coach-question"
            className="w-full rounded-xl border border-[var(--sep)] bg-[var(--bg-grouped)] p-3 text-base"
            rows={3}
            maxLength={COACH_QUESTION_MAX}
            value={question}
            disabled={busy}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("coach.chat.example")}
            aria-describedby="coach-privacy"
          />
          <p id="coach-privacy" className="text-sm text-[var(--label-2)]">{t("coach.chat.privacy")}</p>
          <button type="submit" disabled={busy || !consent || !question.trim()}
            className="min-h-11 w-full rounded-xl bg-[var(--soul)] px-4 py-3 font-semibold text-white disabled:opacity-50">
            {t(busy ? "coach.chat.sending" : "coach.chat.send")}
          </button>
        </form>
      )}
    </section>
  );
}

export default function CoachPage() {
  const router = useRouter();
  const { entitlement, firebaseUser, loading } = useAuth();
  const t = useT();

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [firebaseUser, loading, router]);

  if (loading || !firebaseUser) return <BootSplash />;

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+12px)]">
      <BackButton label={t("common.prev")} onClick={() => backOrReplace(router, "/home")} />
      <h1 id="coach-title" className="mt-4 text-3xl font-bold">{t("coach.chat.title")}</h1>
      <p className="mt-2 text-[var(--label-2)]">{t("coach.chat.intro")}</p>
      {hasProAccess(entitlement) ? <Chat key={firebaseUser.uid} uid={firebaseUser.uid} /> : (
        <section aria-label={t("settings.pro.header")} className="mt-6 rounded-2xl bg-[var(--bg-grouped-2)] p-5">
          <p>{t("coach.chat.access")}</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {PRO_FEATURES.map((feature) => <li key={feature}>{t(feature, { limit: COACH_DAILY_QUESTION_LIMIT })}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
