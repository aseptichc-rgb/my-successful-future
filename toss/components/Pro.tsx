import { Button } from '@toss/tds-mobile';
import { useAuth } from '../auth-context';
import { useTossSubscription } from '../subscription';
import Link from '../Link';

function Offer({ entitlement, billing }: { entitlement: ReturnType<typeof useAuth>['entitlement']; billing: ReturnType<typeof useTossSubscription> }) {
  if (entitlement.kind === 'subscription' && entitlement.platform === 'toss') {
    return <p>AI 맞춤 기능 이용 기간은 {new Date(entitlement.expiresAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}까지예요.</p>;
  }
  if (entitlement.kind === 'trial') {
    return <p>14일 무료 체험 중이에요. {billing.price ? `체험 후에는 월 ${billing.price}에 직접 구독할 수 있어요.` : '체험이 끝나도 기록은 무료예요.'}</p>;
  }
  if (entitlement.kind !== 'free') return <p>현재 이용권으로 AI 맞춤 기능을 사용할 수 있어요.</p>;
  if (!billing.available) return <p>지금은 신규 구독을 신청할 수 없어요.</p>;
  if (!billing.supported) return <p>구독하려면 토스 앱을 최신 버전으로 업데이트해 주세요.</p>;
  if (!billing.price) return <p>구독 상품 정보를 확인할 수 없어요. 잠시 뒤 다시 열어 주세요.</p>;

  return <>
    <p>월 {billing.price} · 구독을 신청하면 30일마다 자동으로 결제돼요. 구독을 해지하면 다음 결제부터 중단돼요.</p>
    <Button display="block" disabled={!billing.canSubscribe} onClick={billing.subscribe}>월 {billing.price}에 구독하기</Button>
  </>;
}

export default function Pro() {
  const { entitlement } = useAuth();
  const billing = useTossSubscription();

  return <main className="toss-page">
    <h1>아니마 Pro</h1>
    <p>내가 적은 꿈과 목표를 오늘 할 한 걸음으로 바꿔보세요.</p>
    <h2>무료</h2>
    <p>꿈과 목표 정리, 실천 체크, 하루 기록과 성장 현황, 기본 명언을 계속 이용할 수 있어요.</p>
    <h2>Pro AI 맞춤 기능</h2>
    <ul className="list-disc pl-5 space-y-2">
      <li>AI 코치와 대화 · 하루 질문 3개</li>
      <li>최근 7일의 기록을 바탕으로 한 AI 주간 코칭</li>
      <li>내 꿈에 맞춘 다짐과 목표 제안</li>
      <li>실행을 막는 장애물과 실행 계획 제안</li>
      <li>개인화된 응원과 미래의 내 모습</li>
    </ul>
    <Link className="toss-row" href="/pro/coach">AI 코치와 대화하기</Link>
    <Link className="toss-row" href="/pro/weekly">AI 주간 코칭 보기</Link>
    <div className="mt-6 rounded-2xl bg-white p-5">
      <Offer entitlement={entitlement} billing={billing} />
      {billing.canRestore && <button type="button" className="toss-row justify-center" disabled={billing.busy} onClick={() => void billing.restore()}>{billing.busy ? '구매 내역을 확인하고 있어요' : '구매 복원'}</button>}
      {billing.message && <p role="status">{billing.message}</p>}
    </div>
    <h2>구독 관리</h2>
    <p>자동 갱신은 iPhone의 Apple 계정 구독 메뉴 또는 Android의 Google Play 구독 메뉴에서 해지할 수 있어요. 결제 내역은 토스 앱의 인앱 결제 내역에서 확인해 주세요.</p>
    <Link className="toss-row" href="/terms">구독 및 환불 안내</Link>
  </main>;
}
