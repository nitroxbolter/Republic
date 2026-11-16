import { useEffect, useState } from 'react';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Mobile menu action: use native browser fullscreen where available, otherwise explain the PWA option. */
export function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [standalone, setStandalone] = useState(isStandalone);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const sync = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      setStandalone(standaloneQuery.matches);
    };
    document.addEventListener('fullscreenchange', sync);
    standaloneQuery.addEventListener('change', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      standaloneQuery.removeEventListener('change', sync);
    };
  }, []);

  const toggle = async () => {
    setMessage('');
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const screen = document.querySelector<HTMLElement>('.game-screen');
        if (!screen?.requestFullscreen) {
          setMessage('Este navegador não permite tela cheia aqui. No iPhone, use Compartilhar → Adicionar à Tela de Início.');
          return;
        }
        await screen.requestFullscreen();
      }
    } catch {
      setMessage('Não foi possível ativar a tela cheia. Tente novamente pelo menu do navegador.');
    }
  };

  return (
    <div className="more-fullscreen-control">
      <button type="button" className="secondary-button more-fullscreen-button" onClick={() => void toggle()} aria-pressed={fullscreen || standalone}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {fullscreen ? <path d="M8 3v5H3m13 0h5V3M3 16h5v5m8-5h5v5" /> : <path d="M3 8V3h5m8 0h5v5M8 21H3v-5m13 5h5v-5" />}
        </svg>
        {fullscreen ? 'Sair da tela cheia' : standalone ? 'Tela cheia ativa' : 'Ativar tela cheia'}
      </button>
      {message && <p className="more-fullscreen-message" role="status">{message}</p>}
    </div>
  );
}
