import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';
import { Button, TDSMobileProvider } from '@toss/tds-mobile';
import LanguageBridge from '../components/LanguageBridge';
import BootSplash from '../components/ui/BootSplash';
import TabsLayout from '../app/(tabs)/layout';
import { AuthProvider, useAuth } from './auth-context';
import { TossNavigation } from './navigation';
import Link from './Link';
import Settings from './components/Settings';
import Legal from './components/Legal';
import Paywall from './components/Paywall';
import Pro from './components/Pro';
import { TossSubscriptionProvider } from './subscription';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';
import { isTossHost } from './environment';

function TossTheme({ children }: { children: ReactNode }) {
  // Tailwind already supplies the reset. TDS's unlayered reset overrides its
  // font-size, padding and border-radius utilities on native form controls.
  return isTossHost() ? <TDSMobileAITProvider resetGlobalCss={false} brandPrimaryColor="#1E1B4B">{children}</TDSMobileAITProvider>
    : <TDSMobileProvider resetGlobalCss={false} userAgent={{ fontA11y: undefined, fontScale: 100, isAndroid: false, isIOS: false, colorPreference: 'light' }}>{children}</TDSMobileProvider>;
}

const Home = lazy(() => import('../app/(tabs)/home/page'));
const Record = lazy(() => import('../app/(tabs)/record/page'));
const Progress = lazy(() => import('../app/(tabs)/progress/page'));
const Dream = lazy(() => import('../app/(tabs)/dream/page'));
const History = lazy(() => import('../app/(tabs)/record/history/page'));
const Onboarding = lazy(() => import('../app/onboarding/page'));
const CoachChat = lazy(() => import('./components/Coaching').then(({ CoachChat }) => ({ default: CoachChat })));
const CoachWeekly = lazy(() => import('./components/Coaching').then(({ CoachWeekly }) => ({ default: CoachWeekly })));

function Intro() {
  const { user, firebaseUser, loading, error, start } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (firebaseUser && user) navigate(user.onboardedAt ? '/home' : '/onboarding', { replace: true });
  }, [firebaseUser, user, navigate]);
  return <main className="toss-page">
    <div className="mb-10 mt-8 text-[var(--soul)] text-lg font-bold">아니마</div>
    <h1>꿈을 이루는 하루,<br />작은 실천부터 시작해요</h1>
    <p>이루고 싶은 꿈을 적고, 오늘 할 한 걸음을 정해 보세요. 매일의 실천과 다짐을 기록하며 변화를 확인할 수 있어요.</p>
    <p>AI 맞춤 기능은 처음 14일 동안 무료예요. 체험이 끝나도 자동으로 결제되지 않으며, 목표와 실천 기록은 계속 무료예요.</p>
    <ul className="my-8 space-y-4 text-[var(--label-2)]"><li>✦ 나의 꿈과 오늘의 목표 정하기</li><li>✦ 하루의 실천과 잘한 일 기록하기</li><li>✦ 쌓이는 기록과 성장 돌아보기</li></ul>
    <div className="rounded-2xl bg-white p-5 mb-8"><strong className="text-sm">AI 활용 안내</strong><p className="text-sm">작성한 꿈과 목표를 바탕으로 AI가 다짐·계획·응원을 제안해요. AI가 생성한 내용은 사실과 다를 수 있으니 직접 확인해 주세요. 민감한 개인정보는 입력하지 마세요.</p><p className="text-sm">토스에서 나의 실천 기록을 이어갈 수 있어요.</p></div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <Button display="block" size="large" style={{ backgroundColor: 'var(--soul)' }} disabled={loading} onClick={() => void start()}>{loading ? '기록을 연결하고 있어요' : '시작하기'}</Button>
    <p className="mt-5 text-xs text-center"><Link href="/privacy">개인정보 처리방침</Link> · <Link href="/terms">이용약관</Link></p>
  </main>;
}
function SignedIn({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <BootSplash />;
  if (!firebaseUser) return <Navigate to="/" replace />;
  return <>{children}</>;
}
function App() {
  return <BrowserRouter><TossNavigation /><TossTheme><AuthProvider><LanguageBridge><TossSubscriptionProvider>
    <Suspense fallback={<BootSplash />}>
      <Routes>
        <Route path="/" element={<Intro />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/onboarding" element={<SignedIn><Onboarding /></SignedIn>} />
        <Route element={<TabsLayout><Outlet /></TabsLayout>}>
          <Route path="/home" element={<Home />} />
          <Route path="/record" element={<Record />} />
          <Route path="/record/history" element={<History />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/dream" element={<Dream />} />
        </Route>
        <Route path="/settings" element={<SignedIn><Settings /></SignedIn>} />
        <Route path="/pro" element={<SignedIn><Pro /></SignedIn>} />
        <Route path="/pro/coach" element={<SignedIn><CoachChat /></SignedIn>} />
        <Route path="/pro/weekly" element={<SignedIn><CoachWeekly /></SignedIn>} />
        <Route path="/delete-account" element={<Navigate to="/settings" replace />} />
        <Route path="/privacy" element={<Legal type="privacy" />} />
        <Route path="/terms" element={<Legal type="terms" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    <p className="toss-ai-label pb-[calc(var(--tab-bar-h)+20px)]">AI 생성 안내 · 맞춤 다짐, 계획, 미래의 나와 응원 문구는 AI가 생성해요. 중요한 내용은 직접 확인해 주세요.</p>
    <Paywall />
  </TossSubscriptionProvider></LanguageBridge></AuthProvider></TossTheme></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
