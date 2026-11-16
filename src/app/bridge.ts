import type { createStore } from 'jotai';
import type { Game } from '../game/Game';
import {
  activeToolAtom,
  buildingChoiceAtom,
  pavementAtom,
  flyoverAtom,
  cityAtom,
  debugStatsAtom,
  fundsAtom,
  gameAtom,
  gridOnAtom,
  hoveredTileAtom,
  inspectAtom,
  zoneInspectAtom,
  mutedAtom,
  inboxAtom,
  INBOX_MAX,
  type InboxAlert,
  rotationAtom,
  clockAtom,
  dayNightAtom,
  budgetAtom,
  trafficViewAtom,
  happinessViewAtom,
  airViewAtom,
  worldVersionAtom,
  toolPreviewAtom,
} from './atoms';

type Store = ReturnType<typeof createStore>;

/** Pipe game events into Jotai atoms. Returns an unsubscribe function. */
export function connectGameToStore(game: Game, store: Store): () => void {
  // Seed atoms with current state; events only carry changes.
  store.set(gameAtom, game);
  // A different city: its own alerts only.
  store.set(inboxAtom, []);
  store.set(fundsAtom, game.city.funds);
  store.set(activeToolAtom, game.tool);
  store.set(mutedAtom, game.muted);
  store.set(buildingChoiceAtom, game.building);
  store.set(pavementAtom, game.pavement);
  store.set(flyoverAtom, game.flyover);
  store.set(rotationAtom, game.rotation);
  store.set(dayNightAtom, game.dayNight);

  const offs = [
    game.events.on('stats', (s) => store.set(debugStatsAtom, s)),
    game.events.on('hover', (t) => store.set(hoveredTileAtom, t)),
    game.events.on('grid', (on) => store.set(gridOnAtom, on)),
    game.events.on('tool', (t) => store.set(activeToolAtom, t)),
    game.events.on('building', (b) => store.set(buildingChoiceAtom, b)),
    game.events.on('pavement', (p) => store.set(pavementAtom, p)),
    game.events.on('flyover', (on) => store.set(flyoverAtom, on)),
    game.events.on('funds', (f) => store.set(fundsAtom, f)),
    game.events.on('muted', (m) => store.set(mutedAtom, m)),
    game.events.on('rotation', (r) => store.set(rotationAtom, r)),
    game.events.on('clock', (h) => store.set(clockAtom, h)),
    game.events.on('dayNight', (m) => store.set(dayNightAtom, m)),
    game.events.on('budget', (b) => store.set(budgetAtom, b)),
    game.events.on('trafficView', (on) => store.set(trafficViewAtom, on)),
    game.events.on('happinessView', (on) => store.set(happinessViewAtom, on)),
    game.events.on('airView', (on) => store.set(airViewAtom, on)),
    game.events.on('worldChanged', (v) => store.set(worldVersionAtom, v)),
    game.events.on('city', (c) => store.set(cityAtom, c)),
    game.events.on('inspect', (i) => store.set(inspectAtom, i)),
    game.events.on('zoneInspect', (i) => store.set(zoneInspectAtom, i)),
    game.events.on('toolPreview', (p) => store.set(toolPreviewAtom, p)),
    game.events.on('notice', (n) => {
      // Every game notice goes to the secretary; replace recurring messages instead of flooding it.
      const key = n.key ?? `message:${n.message}`;
      const alert: InboxAlert = { key, kind: n.kind, message: n.message, date: n.date ?? '', id: n.id, read: false };
      store.set(inboxAtom, (list) => [alert, ...list.filter((a) => a.key !== key)].slice(0, INBOX_MAX));
    }),
    // An ongoing problem was fixed: its alert goes.
    game.events.on('resolve', (key) => store.set(inboxAtom, (list) => (list.some((a) => a.key === key) ? list.filter((a) => a.key !== key) : list))),
  ];
  game.emitCity();
  game.emitBudget();
  return () => {
    offs.forEach((off) => off());
    store.set(gameAtom, null);
    store.set(toolPreviewAtom, null);
    store.set(inspectAtom, null);
    store.set(zoneInspectAtom, null);
  };
}
