import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import { storeFor } from '../../save/CitySaver';
import type { StoreKind } from '../../save/SaveStore';
import type { SaveMeta } from '../../shared/api';
import { authAtom } from '../atoms';

export interface CityEntry {
  readonly store: StoreKind;
  readonly meta: SaveMeta;
}

export interface Cities {
  /** Newest first; null while loading. */
  readonly entries: readonly CityEntry[] | null;
  readonly error: string | null;
  readonly reload: () => void;
}

/** This device's cities, plus the account's when logged in, newest first. */
async function fetchCities(
  loggedIn: boolean,
): Promise<{ entries: CityEntry[]; error: string | null }> {
  const accountOnly = import.meta.env.VITE_LOCAL_ACCOUNTS === 'on';
  const [local, cloud] = await Promise.allSettled([
    accountOnly ? Promise.resolve([]) : storeFor('local').list(),
    loggedIn ? storeFor('cloud').list() : Promise.resolve([]),
  ]);
  const entries: CityEntry[] = [];
  if (!accountOnly && local.status === 'fulfilled')
    entries.push(...local.value.map((meta) => ({ store: 'local' as const, meta })));
  if (cloud.status === 'fulfilled')
    entries.push(...cloud.value.map((meta) => ({ store: 'cloud' as const, meta })));
  entries.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
  return {
    entries,
    error: cloud.status === 'rejected' ? "Couldn't load your account's cities" : null,
  };
}

/** The player's cities, reloaded when they log in or out. */
export function useCities(): Cities {
  const auth = useAtomValue(authAtom);
  const loggedIn = auth.status === 'user';
  const [entries, setEntries] = useState<readonly CityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (auth.status === 'checking') return;
    let cancelled = false;
    void fetchCities(loggedIn).then((r) => {
      if (cancelled) return;
      setEntries(r.entries);
      setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status, loggedIn, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { entries, error, reload };
}

