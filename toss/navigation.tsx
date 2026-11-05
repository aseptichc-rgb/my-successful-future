import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { closeView, graniteEvent } from '@apps-in-toss/web-framework';
import { isTossHost } from './environment';

function localPath(href: string) {
  if (!href.startsWith('/') || href.startsWith('//')) throw new Error('앱 내부 경로만 열 수 있어요.');
  return href;
}
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (href: string, options?: { scroll?: boolean }) => { void options; return navigate(localPath(href)); },
    replace: (href: string, options?: { scroll?: boolean }) => { void options; return navigate(localPath(href), { replace: true }); },
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.dispatchEvent(new Event('anima:refresh')),
    prefetch: () => Promise.resolve(),
  }), [navigate]);
}
export function usePathname() { return useLocation().pathname; }
export function TossNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!isTossHost()) return;
    return graniteEvent.addEventListener('backEvent', {
    onEvent: () => {
      // React Router's idx belongs to this miniapp, so an initial deep link exits safely.
      if (window.history.state?.animaSheet) window.history.back();
      else if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else void closeView().catch(() => {});
    },
    });
  }, [navigate]);
  return null;
}
