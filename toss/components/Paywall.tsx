import { useSyncExternalStore } from 'react';
import { Button } from '@toss/tds-mobile';
import { clearPaymentRequired, getPaymentRequired, subscribePaymentRequired } from '../../lib/paymentRequired';
import Sheet from '../../components/ui/Sheet';
export default function Paywall() {
  const visible = useSyncExternalStore(subscribePaymentRequired, getPaymentRequired, () => false);
  if (!visible) return null;
  return <Sheet title="AI 맞춤 체험이 끝났어요" onClose={clearPaymentRequired}><div role="dialog" aria-modal="true" aria-label="AI 맞춤 체험 종료 안내"><p className="my-5 text-[var(--label-2)]">오늘의 실천과 하루 기록은 계속 사용할 수 있어요. 기존 기록도 그대로 남아 있어요.</p><Button display="block" onClick={clearPaymentRequired}>확인</Button></div></Sheet>;
}
