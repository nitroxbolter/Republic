import { useAtomValue, useSetAtom } from 'jotai';
import { authAtom, authDialogAtom } from '../../atoms';
import { heroAnchor, HeroCity } from './HeroCity';

interface LandingScreenProps {
  /** Continue as a guest (cities are saved on this device). */
  onPlay: () => void;
  /** Open the demo city. */
  onDemo: () => void;
}

/** Labels pinned onto the diorama like a planning map: a ground point (tiles), a height (px), and which side the tag sits. */
const PINS: readonly { label: string; x: number; y: number; z: number; side: 'left' | 'right' }[] = [
  { label: 'Downtown', x: 1, y: 1, z: 150, side: 'left' },
  { label: 'Corner shops', x: 8.5, y: 2.6, z: 24, side: 'right' },
  { label: 'Central park', x: 1.4, y: 6.4, z: 6, side: 'left' },
  { label: 'Main street', x: 4.5, y: 8.6, z: 0, side: 'right' },
];

/** Questions people actually ask before playing; also what search engines read. */
const FAQ: readonly { q: string; a: string }[] = [
  { q: 'Is Republica free?', a: 'Yes. The whole game is free to play, with no ads in the game and nothing to buy.' },
  { q: 'Do I need to download anything?', a: 'No. Republica is a city building game that runs in your web browser. Open the page and start building; there is nothing to install.' },
  { q: 'What kind of game is it?', a: 'An open-world city simulation. You build and govern a city, but its people, businesses and government will make their own decisions, so the world can surprise you. Today it plays as a classic city builder: roads, zones, power, water, services, budgets and traffic.' },
  { q: 'Are the AI citizens and governments in the game yet?', a: 'Not yet. The city builder is the foundation and is playable now. Citizens, workers, governments, trade and politics with minds of their own are being built in the open and arrive in updates, one system at a time.' },
  { q: 'Are my cities saved?', a: 'Always. As a guest your cities save on your device as you play. With a free account they save to the cloud, so you can carry on from any browser.' },
  { q: 'What do I play it on?', a: 'Any modern browser on a computer. It is built for a mouse or trackpad, and runs smoothly on ordinary laptops.' },
];

const STEPS: readonly { title: string; text: string }[] = [
  { title: 'Zone', text: 'Lay roads, then paint homes, shops and industry along them. Lots fill up when people want to live and work there.' },
  { title: 'Serve', text: 'Run power and water, open schools, clinics and stations. Citizens tell you exactly what their street is missing.' },
  { title: 'Grow', text: 'Land value rises, cottages give way to apartments and towers, and the city keeps moving long after dark.' },
];

/** Where the game is heading: inhabitants that decide for themselves. Not in the game yet, and labelled so. */
const WORLD: readonly { title: string; text: string }[] = [
  { title: 'Citizens and workers', text: 'People who choose where to live, where to work and when to leave, for reasons of their own.' },
  { title: 'Governments', text: 'Establish a government, then live with the one that takes power. Policies have consequences you did not plan for.' },
  { title: 'Economies and trade', text: 'Markets that move on their own, resources to manage and trade deals between cities.' },
  { title: 'Politics and conflict', text: 'Alliances, rivalries and, one day, wars between cities that want different things.' },
];

/**
 * The first screen for visitors who aren't signed in: the game drawn with its own art, labelled
 * like a planning map, and three ways in: sign up, log in, or play straight away as a guest.
 */
export function LandingScreen({ onPlay, onDemo }: LandingScreenProps) {
  const localAccount = import.meta.env.VITE_LOCAL_ACCOUNTS === 'on';
  const auth = useAtomValue(authAtom);
  const openDialog = useSetAtom(authDialogAtom);
  const online = localAccount || auth.status !== 'guest' || auth.online;

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-wordmark">Republica</span>
        {online && (
          <nav className="landing-nav-actions" aria-label="Account">
            <button type="button" className="landing-text-button" onClick={() => openDialog('login')}>
              Log in
            </button>
            <button type="button" className="landing-button is-small" onClick={() => openDialog('signup')}>
              Sign up
            </button>
          </nav>
        )}
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="landing-eyebrow">An open-world city simulation, in your browser</p>
            <h1>
              Build the city.
              <br />
              Then let it live.
            </h1>
            <p className="landing-lead">
              Shape streets, set up a government and steer the economy of a city whose people make their own decisions. You won't control everything: the world has its own dynamics, and
              its choices have consequences.
            </p>
            <div className="landing-ctas">
              {localAccount ? (
                <>
                  <button type="button" className="landing-button" onClick={() => openDialog('signup')}>Criar conta</button>
                  <button type="button" className="landing-button is-ghost" onClick={() => openDialog('login')}>Entrar</button>
                </>
              ) : online ? (
                <>
                  <button type="button" className="landing-button" onClick={() => openDialog('signup')}>
                    Create an account
                  </button>
                  <button type="button" className="landing-button is-ghost" onClick={onPlay}>
                    Play without one
                  </button>
                </>
              ) : (
                <button type="button" className="landing-button" onClick={onPlay}>
                  Start playing
                </button>
              )}
            </div>
            <p className="landing-aside">
              {online && !localAccount && (
                <>
                  Have an account?{' '}
                  <button type="button" className="landing-link" onClick={() => openDialog('login')}>
                    Log in
                  </button>
                  <span className="landing-sep" aria-hidden="true">
                    /
                  </span>
                </>
              )}
              {!localAccount && <button type="button" className="landing-link" onClick={onDemo}>Walk around a finished city</button>}
              {localAccount && auth.status === 'guest' && !auth.online && <span>Inicie o MySQL no painel do XAMPP para entrar.</span>}
            </p>
          </div>

          <figure className="landing-map">
            <div className="landing-map-frame">
              <HeroCity className="landing-city" />
              {PINS.map((p) => (
                <span key={p.label} className={`landing-pin is-${p.side}`} style={heroAnchor(p.x, p.y, p.z)}>
                  <span className="landing-pin-tag">{p.label}</span>
                </span>
              ))}
            </div>
            <figcaption>Every building, tree and street here is drawn by the game, live in your browser.</figcaption>
          </figure>
        </section>

        <section className="landing-steps is-world" aria-labelledby="landing-world-title">
          <h2 id="landing-world-title" className="landing-section-title">
            Not just a city. A living world.
          </h2>
          <p className="landing-section-lead">
            Most city builders follow fixed rules. Republica is growing into a world run by AI-driven citizens, workers, governments and markets, each deciding for itself. You don't just
            build the city, you become part of it.
          </p>
          <ol>
            {WORLD.map((w) => (
              <li key={w.title}>
                <span className="landing-step-no">In development</span>
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-steps" aria-labelledby="landing-steps-title">
          <h2 id="landing-steps-title" className="landing-section-title">
            Playable today: how a city grows
          </h2>
          <ol>
            {STEPS.map((s, k) => (
              <li key={s.title}>
                <span className="landing-step-no">{String(k + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-faq" aria-labelledby="landing-faq-title">
          <h2 id="landing-faq-title" className="landing-section-title">
            Questions
          </h2>
          <div className="landing-faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{localAccount && f.q === 'Are my cities saved?' ? 'Sim. Entre com sua conta e o jogo salva automaticamente suas cidades no MySQL do XAMPP.' : f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-saves">
          <div>
            <h2 className="landing-section-title">Your cities stay yours</h2>
            <p>{localAccount ? 'Crie uma conta com login e senha. Suas cidades serão salvas automaticamente no banco de dados do XAMPP.' : 'Start without signing up: your cities save on this device as you play. Make an account whenever you like and move them across, then open them from any browser.'}</p>
          </div>
          {!localAccount && <dl className="landing-compare">
            <div>
              <dt>As a guest</dt>
              <dd>Saved on this device</dd>
            </div>
            <div>
              <dt>With an account</dt>
              <dd>Saved to the cloud, open anywhere</dd>
            </div>
          </dl>}
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-wordmark is-small">Republica</span>
        <span>An open-world city simulation. Free to play in any modern browser, nothing to install.</span>
      </footer>
    </div>
  );
}
