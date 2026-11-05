import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@toss/tds-mobile';
import { useAuth } from '../auth-context';
import { authedFetch } from '../authedFetch';
import { updateUserLanguage } from '../../lib/firebase';
import { useLanguage, SUPPORTED_LOCALES, LOCALE_META, type Locale } from '../../lib/i18n';
import Link from '../Link';

export default function Settings() {
  const { firebaseUser, user, refreshUser, signOut, entitlement } = useAuth();
  const { locale, setLocale } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const language = async (value: Locale) => {
    if (!firebaseUser) return;
    setBusy(true); setMessage('');
    try { await updateUserLanguage(firebaseUser.uid, value); setLocale(value); await refreshUser(); }
    catch { setMessage('언어를 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await authedFetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) throw new Error();
      await signOut(); navigate('/', { replace: true });
    } catch { setMessage('기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <main className="toss-page"><h1>설정</h1>
    <h2>{user?.displayName || '나'}의 아니마</h2><p>토스 사용자 식별키로 연결된 기록이에요. 다른 앱의 계정과 자동으로 합쳐지지 않아요.</p>
    <label className="toss-row"><span className="flex-1">앱 언어</span><select aria-label="앱 언어" disabled={busy} value={locale} onChange={(event) => void language(event.target.value as Locale)}>{SUPPORTED_LOCALES.map((value) => <option key={value} value={value}>{LOCALE_META[value].nativeLabel}</option>)}</select></label>
    <h2>이용 안내</h2><p>{entitlement.kind === 'trial' ? 'AI 맞춤 기능을 무료 체험 중이에요.' : entitlement.kind === 'free' ? '오늘의 실천과 기록을 무료로 사용할 수 있어요.' : '맞춤 기능 이용 권한이 연결되어 있어요.'}</p>
    <Link className="toss-row" href="/privacy">개인정보 처리방침</Link><Link className="toss-row" href="/terms">이용약관</Link><a className="toss-row" href="mailto:aseptichc@gmail.com">고객 문의</a>
    <h2>내 기록 관리</h2><p>삭제하면 꿈, 목표, 실천 기록과 프로필을 복구할 수 없어요. 부정 이용 방지를 위한 최초 체험 시점의 단방향 식별 기록은 보관해요.</p>
    {!confirmDelete ? <button type="button" className="toss-row text-red-600" onClick={() => setConfirmDelete(true)}>내 계정과 기록 삭제하기</button> : <div className="rounded-2xl bg-white p-5"><p>모든 기록을 삭제할까요?</p><Button display="block" disabled={busy} onClick={() => void remove()}>{busy ? '삭제하고 있어요' : '계정과 기록 영구 삭제'}</Button><button type="button" disabled={busy} className="toss-row justify-center" onClick={() => setConfirmDelete(false)}>취소</button></div>}
    {message && <p role="alert">{message}</p>}<p className="text-xs mt-10">아니마 · 토스 버전 1.0.0</p>
  </main>;
}
