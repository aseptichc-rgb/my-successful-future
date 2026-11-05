import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@toss/tds-mobile';
import { COACH_CONTEXT_TURNS, COACH_DAILY_QUESTION_LIMIT, COACH_QUESTION_MAX, type CoachReply, type CoachUsage, type WeeklyCoaching } from '../../lib/aiCoachTypes';
import { hasProAccess } from '../../lib/entitlement';
import { useLanguage } from '../../lib/i18n';
import { addKstDays, todayKstYmd } from '../../lib/kstDate';
import { useAuth } from '../auth-context';
import { authedFetch } from '../authedFetch';
import Link from '../Link';

const AI_TIMEOUT_MS = 45_000;

function CoachingPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const { entitlement } = useAuth();
  return <main className="toss-page">
    <h1>{title}</h1>
    <p>{intro}</p>
    {hasProAccess(entitlement) ? children : <>
      <p>14일 무료 체험 또는 Pro 구독으로 이용할 수 있어요.</p>
      <Link className="toss-row" href="/pro">아니마 Pro 알아보기</Link>
    </>}
  </main>;
}

type DisplayTurn = { question: string; reply: CoachReply };

function Chat() {
  const { locale } = useLanguage();
  const [usage, setUsage] = useState<CoachUsage | null>(null);
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [turns, setTurns] = useState<DisplayTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const sending = useRef(false);

  const loadUsage = useCallback(async () => {
    if (sending.current) return;
    try {
      const response = await authedFetch('/api/coach/chat', { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error();
      const data = await response.json() as { usage: CoachUsage };
      if (!sending.current) { setUsage(data.usage); setMessage(''); }
    } catch {
      if (!sending.current) { setUsage(null); setMessage('남은 질문 수를 확인하지 못했어요.'); }
    }
  }, []);

  useEffect(() => { void loadUsage(); }, [loadUsage]);
  const usageDay = usage?.ymd;
  useEffect(() => {
    if (!usageDay) return;
    const refreshDay = () => { if (usageDay !== todayKstYmd()) void loadUsage(); };
    const nextMidnight = Date.parse(`${addKstDays(usageDay, 1)}T00:00:00+09:00`);
    const timer = setTimeout(refreshDay, Math.max(0, nextMidnight - Date.now() + 500));
    document.addEventListener('visibilitychange', refreshDay);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refreshDay); };
  }, [usageDay, loadUsage]);

  const ask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || !consent || !usage?.remaining || sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const history = turns.filter((turn) => turn.reply.kind === 'answer').slice(-COACH_CONTEXT_TURNS)
        .map((turn) => ({ question: turn.question, answer: turn.reply.text }));
      const response = await authedFetch('/api/coach/chat', { method: 'POST', signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        body: JSON.stringify({ question: text, history, language: locale, consent }) });
      const data = await response.json() as { usage?: CoachUsage; reply?: CoachReply };
      if (data.usage) setUsage(data.usage);
      if (response.status === 429) return;
      if (!response.ok || !data.reply) throw new Error();
      const reply = data.reply;
      setTurns((previous) => [...previous, { question: text, reply }]);
      setQuestion('');
    } catch {
      setMessage('답변을 받지 못했어요. 남은 질문을 확인한 뒤 다시 시도해 주세요.');
      setUsage(null);
    } finally {
      sending.current = false;
      setBusy(false);
      if (usage.ymd !== todayKstYmd()) void loadUsage();
    }
  };

  return <>
    <p className="font-semibold" role="status">{usage ? `오늘 남은 질문 ${usage.remaining}/${usage.limit}개` : `오늘 질문 한도 ${COACH_DAILY_QUESTION_LIMIT}개`} · 한국시간 자정에 초기화돼요.</p>
    <ol className="my-5 space-y-4" aria-label="AI 코치 대화" aria-live="polite">
      {turns.map(({ question: text, reply }, index) => <li key={index} className="space-y-2 break-words">
        <div className="ml-6 rounded-2xl bg-[var(--bg-grouped-2)] p-4"><strong className="text-sm">내 질문</strong><div>{text}</div></div>
        <div className="mr-6 rounded-2xl bg-white p-4"><strong className="text-sm">{reply.kind === 'answer' ? 'AI가 생성한 답변' : '안전 안내'}</strong><div>{reply.text}</div></div>
      </li>)}
    </ol>
    <form onSubmit={(event) => void ask(event)} className="space-y-3">
      <label htmlFor="coach-question" className="block font-semibold">질문</label>
      <textarea id="coach-question" rows={3} maxLength={COACH_QUESTION_MAX} value={question}
        onChange={(event) => setQuestion(event.target.value)} placeholder="예를 들어, 퇴근 후 운동을 꾸준히 하려면 무엇부터 할까요?"
        className="w-full resize-y rounded-xl border border-[var(--separator)] bg-white p-3" />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />질문과 최근 대화 일부를 Gemini에 보내는 데 동의해요.</label>
      <Button display="block" type="submit" disabled={busy || !consent || !usage?.remaining || !question.trim()}>{busy ? '답변을 준비하고 있어요' : 'AI 코치에게 질문하기'}</Button>
    </form>
    {message && <p role="alert">{message}</p>}
    {!usage && message && <button type="button" className="toss-row justify-center" onClick={() => void loadUsage()}>남은 질문 다시 확인</button>}
    {usage?.remaining === 0 && <p>오늘 질문을 다 썼어요. 내일 다시 이어갈 수 있어요.</p>}
  </>;
}

type WeeklyResult = { kind: 'report'; report: WeeklyCoaching } | { kind: 'empty' | 'pending' | 'blocked' };

function WeeklyReport() {
  const { locale } = useLanguage();
  const [report, setReport] = useState<WeeklyCoaching | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const running = useRef(false);

  const generate = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    if (report?.to !== todayKstYmd()) setReport(null);
    try {
      const response = await authedFetch(`/api/coach/weekly?language=${encodeURIComponent(locale)}`, { method: 'POST', signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
      if (response.status === 429) { setMessage('오늘은 다시 생성할 수 없어요. 내일 확인해 주세요.'); return; }
      if (!response.ok) throw new Error();
      const result = await response.json() as WeeklyResult;
      if (result.kind === 'report') setReport(result.report);
      else if (result.kind === 'empty') setMessage('최근 7일에 코칭에 사용할 기록이 없어요. 할 일이나 잘한 일을 적고 다시 확인해 주세요.');
      else if (result.kind === 'pending') setMessage('코칭을 만드는 중이에요. 잠시 뒤 다시 확인해 주세요.');
      else setMessage('이 기록으로 안전한 코칭을 만들기 어려웠어요.');
    } catch {
      setMessage('주간 코칭을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return <>
    <Button display="block" disabled={busy} onClick={() => void generate()}>{busy ? '최근 기록을 살펴보고 있어요' : '최근 7일 AI 코칭 보기'}</Button>
    {message && <p role="status">{message}</p>}
    {report && <section className="mt-6 rounded-2xl bg-white p-5" aria-live="polite">
      <p className="text-sm font-semibold">AI가 생성한 코칭 · {report.from} ~ {report.to}</p>
      <h2>잘한 실천</h2>
      <p>{report.practice ? `${report.practice.text} (${report.practice.ymd})` : '완료한 실천을 보여 주는 기록이 아직 없어요.'}</p>
      <h2>반복된 장애물</h2>
      <p>{report.obstacle ? `${report.obstacle.text} (${report.obstacle.days.join(', ')})` : '기록에서 반복된 장애물을 확인하기 어려워요.'}</p>
      <h2>다음 주에 해볼 행동</h2>
      <p>{report.action}</p>
    </section>}
  </>;
}

export function CoachChat() {
  return <CoachingPage title="AI 코치와 대화" intro="목표, 습관, 작은 실천에 대한 질문을 Gemini AI가 읽고 답해요. 이름, 연락처, 건강 정보처럼 민감한 내용은 입력하지 마세요."><Chat /></CoachingPage>;
}

export function CoachWeekly() {
  return <CoachingPage title="AI 주간 코칭" intro="오늘을 포함한 최근 7일의 할 일, 잘한 일, 장애물 기록을 Gemini AI가 살펴봐요. 같은 날에는 처음 생성한 코칭을 다시 보여드려요."><WeeklyReport /></CoachingPage>;
}
