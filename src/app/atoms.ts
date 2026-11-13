import { atom } from 'jotai';
import type { BudgetInfo, CityInfo, DayNightMode, DebugStats, InspectInfo, Notice, ToolPreviewInfo, ZoneInspectInfo } from '../game/events';
import type { Game } from '../game/Game';
import type { ToolId } from '../game/tools';
import type { SaveStatus } from '../save/CitySaver';
import type { ApiUser, AuthProviders } from '../shared/api';
import type { BuildingId } from '../sim/buildings/catalog';

/** UI state only. Game state lives in the City/World; these atoms mirror what the HUD shows. */
export const debugVisibleAtom = atom(false);
export const debugStatsAtom = atom<DebugStats | null>(null);
export const hoveredTileAtom = atom<{ x: number; y: number } | null>(null);
export const gridOnAtom = atom(false);

/** The running game, so HUD buttons can call into it (setTool etc). */
export const gameAtom = atom<Game | null>(null);
export const fundsAtom = atom(0);
export const activeToolAtom = atom<ToolId>('select');
export const toolPreviewAtom = atom<ToolPreviewInfo | null>(null);
export const noticesAtom = atom<readonly Notice[]>([]);

/** An alert kept in the inbox until the game resolves it or the player dismisses it. */
export interface InboxAlert {
  key: string;
  kind: Notice['kind'];
  message: string;
  date: string;
  /** Notice id of the latest version (newest first). */
  id: number;
  read: boolean;
}
/** The alerts inbox (top bar bell), newest first; at most INBOX_MAX. */
export const inboxAtom = atom<readonly InboxAlert[]>([]);
export const INBOX_MAX = 40;
export const mutedAtom = atom(false);
export const buildingChoiceAtom = atom<BuildingId>('park');
/** Footpath style picked in the road tool (0 = each road's default). */
export const pavementAtom = atom(0);
export const flyoverAtom = atom(false);
export const cityAtom = atom<CityInfo | null>(null);
export const inspectAtom = atom<InspectInfo | null>(null);
export const zoneInspectAtom = atom<ZoneInspectInfo | null>(null);
export const dayNightAtom = atom<DayNightMode>('cycle');
export const budgetAtom = atom<BudgetInfo | null>(null);

export const trafficViewAtom = atom(false);
export const happinessViewAtom = atom(false);
export const airViewAtom = atom(false);
/** Hour of day on the clock (0–24). */
export const clockAtom = atom(7);
/** Bumped when the world changes; the minimap repaints on it. */
export const worldVersionAtom = atom(0);
/** View rotation in quarter turns (0–3). */
export const rotationAtom = atom(0);

/** Who is playing: still checking, a guest (online = the save server answered), or logged in. */
export type AuthState =
  | { readonly status: 'checking' }
  | { readonly status: 'guest'; readonly online: boolean }
  | { readonly status: 'user'; readonly user: ApiUser };
export const authAtom = atom<AuthState>({ status: 'checking' });
/** The log in / sign up dialog, if open. */
export const authDialogAtom = atom<'login' | 'signup' | null>(null);
/** Sign-in methods the server offers besides email (from /api/auth/me). */
export const authProvidersAtom = atom<AuthProviders>({ github: false, emailCodes: false, turnstileSiteKey: null });
/** A message for the dialog to show when it opens (e.g. why a GitHub sign-in failed). */
export const authNoticeAtom = atom<string | null>(null);
/** Save state of the open city; null when it isn't saved at all (the demo). */
export const saveStatusAtom = atom<SaveStatus | null>(null);
