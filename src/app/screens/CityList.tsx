import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { storeFor } from '../../save/CitySaver';
import type { CityRef } from '../../save/SaveStore';
import { PRESET_IDS, PRESETS } from '../../sim/terrain/presets';
import { authAtom } from '../atoms';
import { cityDate, timeAgo } from '../format';
import { cityThumb } from './cityThumbs';
import type { CityEntry, Cities } from './useCities';

const presetOf = (id: string) => PRESET_IDS.find((p) => p === id) ?? null;
const keyOf = (e: CityEntry) => `${e.store}:${e.meta.id}`;
const refOf = (e: CityEntry): CityRef => ({ store: e.store, id: e.meta.id });

/** A saved city's map with the player's roads and buildings; blank until it's painted. */
function CityThumb({ entry, className }: { entry: CityEntry; className: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    cityThumb(entry.store, entry.meta).then(
      (u) => !cancelled && setUrl(u),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [entry.store, entry.meta]);
  return (
    <span className={`city-thumb ${className}`}>
      {url && <img src={url} alt="" draggable={false} />}
    </span>
  );
}

interface CityListProps {
  cities: Cities;
  onOpen: (ref: CityRef) => void;
}

/**
 * "Your cities" (docs/specs/saving.md): the last city played as a big Continue card with its
 * map, then the rest. Device cities can move to the account; delete asks first.
 */
export function CityList({ cities, onOpen }: CityListProps) {
  const oneCityPerAccount = import.meta.env.VITE_LOCAL_ACCOUNTS === 'on';
  const loggedIn = useAtomValue(authAtom).status === 'user';
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { entries, reload } = cities;
  const error = actionError ?? cities.error;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
      setConfirming(null);
      reload();
    }
  };

  const remove = (e: CityEntry) => run(keyOf(e), () => storeFor(e.store).remove(e.meta.id));
  /** Copy a device city into the account, then drop the device copy. */
  const upload = (e: CityEntry) =>
    run(keyOf(e), async () => {
      const { data } = await storeFor('local').load(e.meta.id);
      const { name, population, funds, day, size, preset, seed } = e.meta;
      await storeFor('cloud').create({ name, population, funds, day, size, preset, seed }, data);
      await storeFor('local').remove(e.meta.id);
    });

  if (!entries || (entries.length === 0 && !error)) return null;
  const [latest, ...rest] = entries;

  const details = (e: CityEntry) => {
    const m = e.meta;
    const preset = presetOf(m.preset);
    return (
      <>
        <span className="city-tile-stats">
          {m.population.toLocaleString()} moradores · {cityDate(m.day)}
        </span>
        <span className="city-tile-meta">
          {preset ? PRESETS[preset].name : m.preset} · {m.size}² · salva {timeAgo(m.updatedAt)}
        </span>
        <span className={`city-badge is-${e.store}`}>
          {e.store === 'cloud' ? 'Account' : 'This device'}
        </span>
      </>
    );
  };

  const actions = (e: CityEntry) => {
    const key = keyOf(e);
    return (
      <div className="city-actions">
        {confirming === key ? (
          <>
            <span>Delete for good?</span>
            <button type="button" className="link-button is-danger" onClick={() => void remove(e)}>
              Delete
            </button>
            <button type="button" className="link-button" onClick={() => setConfirming(null)}>
              Keep
            </button>
          </>
        ) : (
          <>
            {e.store === 'local' && loggedIn && (
              <button
                type="button"
                className="link-button"
                disabled={busy === key}
                onClick={() => void upload(e)}
              >
                Move to account
              </button>
            )}
            <button
              type="button"
              className="link-button is-dim"
              disabled={busy === key}
              onClick={() => setConfirming(key)}
            >
              Delete
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <section className="panel cities-card" aria-label={oneCityPerAccount ? 'Sua cidade' : 'Your cities'}>
      <header className="cities-header">
        <h2>{oneCityPerAccount ? 'Sua cidade' : 'Your cities'}</h2>
        {error && <span className="cities-error">{error}</span>}
      </header>
      {latest && (
        <div className="city-hero">
          <button
            type="button"
            className="city-hero-map"
            aria-label={`Continuar ${latest.meta.name}`}
            onClick={() => onOpen(refOf(latest))}
          >
            <CityThumb entry={latest} className="is-hero" />
          </button>
          <div className="city-hero-info">
            <span className="city-hero-kicker">Last played</span>
            <span className="city-hero-name">{latest.meta.name}</span>
            {details(latest)}
            <button
              type="button"
              className="ng-start city-continue"
              disabled={busy === keyOf(latest)}
              onClick={() => onOpen(refOf(latest))}
            >
              Continue
            </button>
            {actions(latest)}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="cities-strip">
          {rest.map((e) => (
            <li key={keyOf(e)} className="city-tile">
              <button
                type="button"
                className="city-open"
                disabled={busy === keyOf(e)}
                onClick={() => onOpen(refOf(e))}
              >
                <CityThumb entry={e} className="is-small" />
                <span className="city-tile-name">{e.meta.name}</span>
                {details(e)}
              </button>
              {actions(e)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
