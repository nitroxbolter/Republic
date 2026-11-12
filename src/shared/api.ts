/**
 * Shapes of the save server's HTTP API (docs/specs/saving.md), shared by the client
 * (src/save/) and the server (server/). Keep this file free of imports.
 */

export const API_LIMITS = {
  passwordMin: 8,
  passwordMax: 200,
  cityNameMax: 64,
  savesPerUser: 1,
  /** Digits in an emailed sign-up or reset code. */
  codeLength: 6,
  /** Request body limit; a huge 256×256 city is well under 2 MB. */
  bodyBytes: 8 * 1024 * 1024,
} as const;

export interface ApiUser {
  readonly id: number;
  readonly email: string;
}

/** A city in a list: everything but its data. */
export interface SaveMeta {
  readonly id: number;
  readonly name: string;
  readonly population: number;
  readonly funds: number;
  readonly day: number;
  readonly size: number;
  readonly preset: string;
  readonly seed: number;
  /** ms since the epoch. */
  readonly updatedAt: number;
}

/** What the client sends with a save; the server adds id and updatedAt. */
export type SaveMetaInput = Omit<SaveMeta, 'id' | 'updatedAt'>;

export interface AuthResponse {
  readonly user: ApiUser;
}
/** Sign-in methods the server has configured. */
export interface AuthProviders {
  readonly github: boolean;
  /** Sign-up confirms the email with a code, and "Forgot password" works (D-084). */
  readonly emailCodes: boolean;
  /** Cloudflare Turnstile site key for the bot check, when the server has one. */
  readonly turnstileSiteKey: string | null;
}

/** Sign-up either signs in at once, or (with email codes on) waits for the emailed code. */
export type SignupResponse = { readonly kind: 'user'; readonly user: ApiUser } | { readonly kind: 'verify'; readonly email: string };

/** Bot defences sent with forms that email a code (D-084). */
export interface HumanProof {
  /** The local username/password server requires confirmation on sign-up. */
  readonly confirmPassword?: string;
  /** Turnstile token. */
  readonly captcha?: string;
  /** Honeypot: a hidden field people never fill in. */
  readonly website?: string;
}
export type CodePurpose = 'signup' | 'reset';

/** 202 from password/forgot and code/resend: a code is on its way (if the account exists). */
export interface CodeSentResponse {
  readonly email: string;
}

export interface MeResponse {
  readonly user: ApiUser | null;
  readonly providers: AuthProviders;
}
export interface SaveListResponse {
  readonly saves: readonly SaveMeta[];
}
export interface SaveWriteRequest {
  readonly meta: SaveMetaInput;
  readonly data: unknown;
}
export interface SaveWriteResponse {
  readonly meta: SaveMeta;
}
export interface SaveLoadResponse {
  readonly meta: SaveMeta;
  readonly data: unknown;
}
export interface ApiErrorBody {
  readonly error: string;
  /** 429 only: seconds until the client may try again. */
  readonly retryAfter?: number;
}

/** Usage events (docs/specs/analytics.md). */
export const EVENT_KINDS = ['visit', 'city_start'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Small event details: flat strings, numbers and booleans only. */
export type EventProps = Readonly<Record<string, string | number | boolean>>;

export interface TrackRequest {
  readonly kind: EventKind;
  /** Random ID kept in the browser, for unique visitors. */
  readonly visitor: string;
  readonly path: string;
  /** Host of the referring page, e.g. "t.co". */
  readonly referrer?: string;
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  readonly timezone?: string;
  /** Browser language, e.g. "en-IN". */
  readonly language?: string;
  /** "1440x900". */
  readonly screen?: string;
  readonly props?: EventProps;
}

/** How far a player got through the first-play tour (docs/04-ui-ux.md, "Onboarding tour"). */
export interface TourProgress {
  /** Id of the last step reached (ids, not positions, so steps can be reordered). */
  readonly step: string;
  /** Finished or skipped: the tour no longer starts by itself. */
  readonly done: boolean;
}
export interface TourResponse {
  /** null: never started. */
  readonly progress: TourProgress | null;
}

/** Guest trial (D-083): the server measures play time and says when to ask for an account. */
export type GuestState = 'ok' | 'nudge' | 'gate';
export interface GuestHeartbeatRequest {
  /** The device's copy of the guest id, used when the cookie was cleared. */
  readonly guestId?: string;
}
export type GuestHeartbeatResponse =
  | { readonly kind: 'member' }
  | {
      readonly kind: 'guest';
      readonly guestId: string;
      readonly state: GuestState;
      readonly playSeconds: number;
      readonly nudgeMinutes: number;
      readonly limitMinutes: number;
    };
