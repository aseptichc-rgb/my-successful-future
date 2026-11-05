import { useRef, useSyncExternalStore } from 'react';
import { Button } from '@toss/tds-mobile';
import { clearPaymentRequired, getPaymentRequired, subscribePaymentRequired } from '../../lib/paymentRequired';
import Sheet from '../../components/ui/Sheet';
import { hasProAccess } from '../../lib/entitlement';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { useTossSubscription } from '../subscription';

export default function Paywall() {
  const visible = useSyncExternalStore(subscribePaymentRequired, getPaymentRequired, () => false);
  const { entitlement } = useAuth();
  const { available } = useTossSubscription();
  const navigate = useNavigate();
  const openPro = useRef(false);
  if (!visible || hasProAccess(entitlement)) return null;
  const close = () => {
    clearPaymentRequired();
    if (!openPro.current) return;
    openPro.current = false;
    navigate('/pro');
  };
  return <Sheet title="AI 맞춤 기능 이용 안내" onClose={close}>
    {(requestClose) => <div role="dialog" aria-modal="true" aria-label="AI 맞춤 기능 이용 안내">
      <p className="my-5 text-[var(--label-2)]">오늘의 실천과 하루 기록은 무료로 이용할 수 있어요. AI 코치 대화, 주간 코칭과 맞춤 제안은 Pro에서 이용할 수 있어요.</p>
      {available && <Button display="block" onClick={() => { openPro.current = true; requestClose(); }}>Pro 알아보기</Button>}
      <button type="button" className="toss-row justify-center" onClick={requestClose}>계속 기록하기</button>
    </div>}
  </Sheet>;
}
