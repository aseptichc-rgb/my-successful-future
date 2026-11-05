import { useState } from 'react';
import { Share } from '@apps-in-toss/web-framework';

export default function ShareButton({ count }: { count: number; best: number; declaration: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (count <= 0) return null;
  const share = async () => {
    setBusy(true); setError('');
    try { const link = await Share.createLink({ path: 'intoss://anima' }); await Share.sendMessage({ message: `아니마에서 ${count}일 연속 실천했어요.\n${link}` }); }
    catch { setError('공유를 열지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  return <><button type="button" className="mt-3 rounded-full px-4 py-2 text-sm text-[var(--soul)]" disabled={busy} onClick={() => void share()}>실천 기록 공유하기</button>{error && <p role="status" className="text-xs">{error}</p>}</>;
}
