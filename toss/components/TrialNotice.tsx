import { useEffect, useState } from 'react';
import { useAuth } from '../auth-context';
export default function TrialNotice() {
  const { entitlement } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  if (entitlement.kind !== 'trial') return null;
  const days = Math.max(1, Math.ceil((entitlement.trialEndsAt - now) / 86400000));
  return <p className="rounded-2xl bg-white p-4 text-sm text-[var(--label-2)]">AI 맞춤 기능을 {days}일 더 체험할 수 있어요. 오늘의 실천과 기록은 체험 후에도 계속 사용할 수 있어요.</p>;
}
