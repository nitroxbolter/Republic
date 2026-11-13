import type {
  ApiErrorBody,
  ApiUser,
  AuthResponse,
  CodePurpose,
  CodeSentResponse,
  HumanProof,
  MeResponse,
  SaveListResponse,
  SaveLoadResponse,
  SaveMeta,
  SaveWriteRequest,
  SaveWriteResponse,
  SignupResponse,
  GuestHeartbeatResponse,
  TourProgress,
  TourResponse,
  TrackRequest,
} from '../shared/api';
import { appPath } from '../app/basePath';

/** Typed client for the save server (docs/specs/saving.md, "Server"). */

export class ApiError extends Error {
  /** HTTP status, or 0 when the server couldn't be reached. */
  readonly status: number;
  /** 429: seconds until another attempt is allowed. */
  readonly retryAfter: number | null;

  constructor(status: number, message: string, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Seconds to wait from a 429's body, or its Retry-After header. */
function retryAfterOf(res: Response, body: unknown): number | null {
  if (isErrorBody(body) && typeof body.retryAfter === 'number') return body.retryAfter;
  const header = Number(res.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header : null;
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  return typeof v === 'object' && v !== null && 'error' in v && typeof v.error === 'string';
}


/**
 * Small bodies go out with `keepalive`, so a save started as the tab closes still arrives
 * (browsers cap keepalive bodies at 64 KB).
 */
const KEEPALIVE_MAX = 60_000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const text = body === undefined ? undefined : JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(appPath(`api${path}`), {
      method,
      headers: text === undefined ? undefined : { 'content-type': 'application/json' },
      body: text,
      credentials: 'same-origin',
      keepalive: text !== undefined && text.length < KEEPALIVE_MAX,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server");
  }
  if (res.status === 204) return undefined as T; // only used with T = void
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, isErrorBody(json) ? json.error : `Server error (${res.status})`, res.status === 429 ? retryAfterOf(res, json) : null);
  // Our own server's responses, typed by src/shared/api.ts. Save data is validated separately (parseSave).
  return json as T;
}

export const api = {
  me: () => request<MeResponse>('GET', '/auth/me'),
  signup: (email: string, password: string, human: HumanProof = {}) => request<SignupResponse>('POST', '/auth/signup', { email, password, ...human }),
  verifySignup: (email: string, code: string): Promise<ApiUser> =>
    request<AuthResponse>('POST', '/auth/signup/verify', { email, code }).then((r) => r.user),
  forgotPassword: (email: string, human: HumanProof = {}) => request<CodeSentResponse>('POST', '/auth/password/forgot', { email, ...human }),
  resetPassword: (email: string, code: string, password: string): Promise<ApiUser> =>
    request<AuthResponse>('POST', '/auth/password/reset', { email, code, password }).then((r) => r.user),
  resendCode: (purpose: CodePurpose, email: string) => request<CodeSentResponse>('POST', '/auth/code/resend', { email, purpose }),
  login: (email: string, password: string): Promise<ApiUser> =>
    request<AuthResponse>('POST', '/auth/login', { email, password }).then((r) => r.user),
  logout: () => request<void>('POST', '/auth/logout'),

  listSaves: () => request<SaveListResponse>('GET', '/saves').then((r) => r.saves),
  loadSave: (id: number) => request<SaveLoadResponse>('GET', `/saves/${id}`),
  createSave: (body: SaveWriteRequest): Promise<SaveMeta> => request<SaveWriteResponse>('POST', '/saves', body).then((r) => r.meta),
  updateSave: (id: number, body: SaveWriteRequest): Promise<SaveMeta> =>
    request<SaveWriteResponse>('PUT', `/saves/${id}`, body).then((r) => r.meta),
  deleteSave: (id: number) => request<void>('DELETE', `/saves/${id}`),

  getTour: () => request<TourResponse>('GET', '/tour').then((r) => r.progress),
  putTour: (body: TourProgress) => request<void>('PUT', '/tour', body),

  guestHeartbeat: (guestId: string | null) => request<GuestHeartbeatResponse>('POST', '/guest/heartbeat', guestId ? { guestId } : {}),

  track: (body: TrackRequest) => request<void>('POST', '/events', body),
};
