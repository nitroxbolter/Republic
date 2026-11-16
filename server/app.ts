import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { API_LIMITS } from '../src/shared/api.ts';
import type { Db } from './db/db.ts';
import { errorHandler, notFoundHandler } from './http/errors.ts';
import { loadUser, securityHeaders } from './http/middleware.ts';
import { DEV_GUEST_SECRET, type TrustProxy } from './config.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { AnalyticsRepository } from './modules/analytics/analytics.repository.ts';
import { analyticsRoutes } from './modules/analytics/analytics.routes.ts';
import { AnalyticsService } from './modules/analytics/analytics.service.ts';
import { AUTH_LIMITS, AuthLimiter, DAY } from './modules/auth/auth.limits.ts';
import { AuthService } from './modules/auth/auth.service.ts';
import type { HumanCheck } from './modules/auth/humanCheck.ts';
import type { Mailer } from './modules/email/mailer.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import type { GithubApi } from './modules/oauth/github.api.ts';
import { githubRoutes } from './modules/oauth/oauth.routes.ts';
import { OAuthService } from './modules/oauth/oauth.service.ts';
import { SavesRepository } from './modules/saves/saves.repository.ts';
import { savesRoutes } from './modules/saves/saves.routes.ts';
import { SavesService } from './modules/saves/saves.service.ts';
import { worldRoutes } from './modules/saves/world.routes.ts';
import { GuestsRepository } from './modules/guests/guests.repository.ts';
import { guestsRoutes } from './modules/guests/guests.routes.ts';
import { GuestsService, type GuestRules } from './modules/guests/guests.service.ts';
import { TourRepository } from './modules/tour/tour.repository.ts';
import { tourRoutes } from './modules/tour/tour.routes.ts';
import { TourService } from './modules/tour/tour.service.ts';

/** Assembles the save server (docs/specs/saving.md): services, then middleware and routers. */

export interface AppOptions {
  /** Send cookies with `Secure` (production, behind HTTPS). */
  readonly secureCookies: boolean;
  /** Serve the built client from this folder (production). */
  readonly staticDir?: string;
  /** Express `trust proxy` (config TRUST_PROXY). Default: loopback only. */
  readonly trustProxy?: TrustProxy;
  /** Login and signup limits (tests pass their own clock or rules). */
  readonly authLimits?: AuthLimiter;
  /** Sign in with GitHub, when configured (config GITHUB_*; tests pass a fake API). */
  readonly github?: {
    readonly clientId: string;
    readonly publicUrl: string;
    readonly api: GithubApi;
  };
  /**
   * Email codes for sign-up and password reset (D-084): the mailer and the server's daily email
   * budget. Without it, sign-up signs in at once and there is no reset.
   */
  readonly email?: { readonly mailer: Mailer; readonly dailyLimit: number };
  /** Bot check (Turnstile) for the forms that send email. */
  readonly human?: { readonly check: HumanCheck; readonly siteKey: string };
  /** Guest trial rules (config GUEST_*); tests may also pass a clock. */
  readonly guests?: GuestRules;
  readonly guestClock?: () => number;
}

export function createApp(db: Db, opts: AppOptions): express.Express & { auth: AuthService; guests: GuestsService } {
  const auth = new AuthService(db, opts.email?.mailer ?? null);
  const authLimits =
    opts.authLimits ??
    new AuthLimiter({
      ...AUTH_LIMITS,
      codeDaily: { max: opts.email?.dailyLimit ?? AUTH_LIMITS.codeDaily.max, windowMs: DAY },
    });
  const saves = new SavesService(new SavesRepository(db));
  const analytics = new AnalyticsService(new AnalyticsRepository(db));
  const tour = new TourService(new TourRepository(db));
  const guests = new GuestsService(
    new GuestsRepository(db),
    opts.guests ?? { secret: DEV_GUEST_SECRET, nudgeMinutes: 10, limitMinutes: 30 },
    opts.guestClock,
  );

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy ?? 'loopback');
  app.use(securityHeaders(opts.secureCookies));

  const api = express.Router();
  api.use(express.json({ limit: API_LIMITS.bodyBytes }));
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use('/health', healthRoutes(db));
  api.use(loadUser((token) => auth.userForToken(token)));
  if (opts.github)
    api.use(
      '/auth/github',
      githubRoutes(new OAuthService(db, auth), {
        ...opts.github,
        secureCookies: opts.secureCookies,
      }),
    );
  api.use(
    '/auth',
    authRoutes(auth, {
      secureCookies: opts.secureCookies,
      limits: authLimits,
      github: !!opts.github,
      human: opts.human,
    }),
  );
  api.use('/saves', savesRoutes(saves));
  api.use('/world', worldRoutes(saves));
  api.use('/tour', tourRoutes(tour));
  api.use('/guest', guestsRoutes(guests, opts.secureCookies));
  api.use('/events', analyticsRoutes(analytics));
  api.use(notFoundHandler);
  api.use(errorHandler);
  app.use('/api', api);

  // Production: serve the built client; every other path (/, /demo …) falls back to the app.
  // Hashed bundles never change, so they cache for a year; index.html is always revalidated.
  const dir = opts.staticDir;
  if (dir && existsSync(dir)) {
    app.use('/assets', express.static(join(dir, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false }));
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(dir, 'index.html'));
    });
  }
  return Object.assign(app, { auth, guests });
}
