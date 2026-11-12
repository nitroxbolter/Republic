import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { api } from '../../save/api';
import { authAtom, authDialogAtom, authProvidersAtom, cityAtom, fundsAtom, gameAtom } from '../atoms';
import { GithubMark, signInWithGithub } from './AuthDialog';
import { GUEST_TRIAL_ON, HEARTBEAT_MS, OFFLINE_GRACE_MS, readGuestId, readNudged, writeGuestId, writeNudged } from './guestPlay';

const PERKS = ['Saved online, safe if this browser is cleared', 'Carry on from any phone or computer', 'Free, no card, no ads'] as const;

/** What the server last said about this guest's trial. */
interface TrialStatus {
  readonly state: 'ok' | 'nudge' | 'gate';
  readonly playSeconds: number;
}

/**
 * Guest trial (D-083). The server measures play from heartbeats sent while the tab is visible
 * and answers ok, nudge (a reminder they can close) or gate (play pauses until they sign up or
 * log in; the city moves into the account). If the server can't be reached for a few minutes of
 * play, play pauses too, so blocking the API doesn't skip the trial.
 */
export function GuestLimit({ cityName }: { cityName: string }) {
  const auth = useAtomValue(authAtom);
  const game = useAtomValue(gameAtom);
  const openDialog = useSetAtom(authDialogAtom);
  const speed = useAtomValue(cityAtom)?.speed ?? 0;
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [nudged, setNudged] = useState(readNudged);
  // Bumped by "Try again": restarts the heartbeat loop at once.
  const [attempt, setAttempt] = useState(0);
  const counting = GUEST_TRIAL_ON && auth.status === 'guest' && !!game;

  useEffect(() => {
    if (!counting) return;
    let stopped = false;
    let unverifiedMs = 0;
    const beat = (playing: boolean) => {
      api.guestHeartbeat(readGuestId()).then(
        (r) => {
          if (stopped || r.kind !== 'guest') return;
          writeGuestId(r.guestId);
          unverifiedMs = 0;
          setOffline(false);
          setTrial({ state: r.state, playSeconds: r.playSeconds });
        },
        () => {
          if (stopped) return;
          if (playing) unverifiedMs += HEARTBEAT_MS;
          if (unverifiedMs >= OFFLINE_GRACE_MS) setOffline(true);
        },
      );
    };
    beat(false);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') beat(true);
    }, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [counting, attempt]);

  // The gate holds the clock still (Space and [ ] included), so nothing happens to the city meanwhile.
  const gated = counting && (offline || trial?.state === 'gate');
  useEffect(() => {
    if (gated && speed > 0) game?.setSpeed(0);
  }, [gated, game, speed]);

  if (!counting) return null;
  if (gated) {
    return (
      <GuestGate
        cityName={cityName}
        minutes={Math.round((trial?.playSeconds ?? 0) / 60)}
        offline={offline}
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
  }
  if (trial?.state !== 'nudge' || nudged) return null;

  const later = () => {
    writeNudged();
    setNudged(true);
  };
  return (
    <div className="guest-nudge" role="status">
      <span className="gate-kicker">Only in this browser</span>
      <p>
        <strong>{cityName}</strong> isn't backed up yet. A free account keeps it safe and on all your devices.
      </p>
      <div className="guest-nudge-actions">
        <button type="button" className="gate-text" onClick={later}>
          Later
        </button>
        <button type="button" className="gate-small" onClick={() => openDialog('signup')}>
          Save my city
        </button>
      </div>
    </div>
  );
}

interface GuestGateProps {
  readonly cityName: string;
  readonly minutes: number;
  /** The server couldn't be reached, rather than the trial being over. */
  readonly offline: boolean;
  readonly onRetry: () => void;
}

/** The pause card: the player's own city on the left (what they'd keep), the way in on the right. */
function GuestGate({ cityName, minutes, offline, onRetry }: GuestGateProps) {
  const openDialog = useSetAtom(authDialogAtom);
  const providers = useAtomValue(authProvidersAtom);
  const city = useAtomValue(cityAtom);
  const funds = useAtomValue(fundsAtom);
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="guest-gate">
      <div className="gate-card" role="dialog" aria-modal="true" aria-labelledby="gate-title">
        <section className="gate-permit" aria-label="Your city so far">
          <span className="gate-kicker">Your city so far</span>
          <strong className="gate-city">{cityName}</strong>
          <dl className="gate-stats">
            <div>
              <dt>Residents</dt>
              <dd>{(city?.population ?? 0).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Treasury</dt>
              <dd>${funds.toLocaleString()}</dd>
            </div>
            {minutes > 0 && (
              <div>
                <dt>Planned for</dt>
                <dd>{minutes} min</dd>
              </div>
            )}
          </dl>
          <span className="gate-stamp">{offline ? 'Saved on this device' : 'Not backed up'}</span>
        </section>

        {offline ? (
          <section className="gate-pitch">
            <h2 id="gate-title">Reconnecting…</h2>
            <p className="gate-lead">
              Guest play needs a connection to Republica. Your city is safe on this device and carries on the moment we're back.
            </p>
            <div className="gate-buttons">
              <button type="button" className="auth-submit" autoFocus onClick={onRetry}>
                Try again
              </button>
            </div>
          </section>
        ) : (
          <section className="gate-pitch">
            <h2 id="gate-title">Keep building {cityName}</h2>
            <p className="gate-lead">Guest time is up. Make a free account in a few seconds and this city comes with you, exactly as it is.</p>
            <ul className="gate-perks">
              {PERKS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className="gate-buttons">
              <button type="button" className="auth-submit" autoFocus onClick={() => openDialog('signup')}>
                Create free account
              </button>
              {providers.github && (
                <button
                  type="button"
                  className="auth-provider"
                  disabled={leaving}
                  onClick={() => {
                    setLeaving(true);
                    signInWithGithub();
                  }}
                >
                  <GithubMark />
                  {leaving ? 'Opening GitHub…' : 'Continue with GitHub'}
                </button>
              )}
            </div>
            <p className="gate-foot">
              Already have an account?{' '}
              <button type="button" className="gate-text" onClick={() => openDialog('login')}>
                Log in
              </button>
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
