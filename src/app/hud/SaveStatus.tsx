import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { saveStatusAtom } from '../atoms';
import { timeAgo } from '../format';

/** Save state in the top bar; click (or Ctrl/⌘ S) to save now. Hidden for cities that aren't saved. */
export function SaveStatus({ onSave }: { onSave: () => void }) {
  const status = useAtomValue(saveStatusAtom);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!status) return null;
  let label: string;
  let title: string;
  switch (status.kind) {
    case 'new':
      label = 'Not saved yet';
      title = 'Salva automaticamente quando você começa a construir · clique para salvar agora (Ctrl/⌘ S)';
      break;
    case 'saving':
      label = 'Saving…';
      title = 'Saving your city';
      break;
    case 'saved':
      label = `Salva ${timeAgo(status.at, now)}`;
      title = `${status.store === 'cloud' ? 'Salva na sua conta' : 'Salva neste dispositivo · entre para guardá-la numa conta'} · salvamento automático durante o jogo (Ctrl/⌘ S)`;
      break;
    case 'error':
      label = 'Save failed';
      title = `${status.message} · tentando novamente automaticamente · clique para tentar agora`;
      break;
  }

  return (
    <button type="button" className={`save-status is-${status.kind}`} title={title} onClick={onSave} disabled={status.kind === 'saving'}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        {status.kind === 'saved' && status.store === 'cloud' ? (
          <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M5 4h11l3 3v13H5z" />
            <path d="M8 4v5h7V4M8 20v-6h8v6" />
          </g>
        )}
      </svg>
      <span>{label}</span>
    </button>
  );
}
