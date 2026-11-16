# Saving & Accounts (Phase 10)

Players keep their cities. Guests save on their device; signing up keeps cities in an
account so they follow the player to any browser. Design decisions: D-034, D-062.

## Player Experience

- **Never lose a city.** Every city autosaves. A reload reopens the city you were playing.
- **Start screen** leads with *Your cities*: the last-played city as a big **Continue** card
  with a map preview (terrain plus roads, zones and buildings), then the others as smaller
  cards with previews. Delete asks first. When there are saved cities, *Found a new city* is
  folded into one button; a new city's default name never repeats one ("Island 2").
  (User report: after logging back in, the old screen led with "Found a new city" on the same
  seed, and starting it gave an empty copy of the island that looked like lost progress.)
- Previews are made lazily, one at a time with a frame's pause between, and cached until
  the save changes, so the start screen stays smooth with 30 cities.
- A loaded city opens with the camera over what the player built (roads and buildings).
- **Account button** (start screen header and top bar): *Log in* / *Sign up* dialog with
  email and password (8+ characters). Once logged in it shows the email and *Log out*.
  When the server sends email (D-084), sign-up continues to *Check your email*: a 6-digit
  code creates the account. *Forgot password?* under the log-in password emails a code that
  sets a new password and signs out other devices.
- **Guest → account:** a guest's cities live on this device. After logging in, the open
  city moves into the account on its next save, and the list offers *Upload* for the
  others. Nothing is lost by signing up later.
- **Save status** in the top bar: *Saved*, *Saving…*, *Unsaved changes* or *Save failed,
  retrying*. Click it (or press `Ctrl/⌘ S`) to save now.
- The `/demo` city is never saved.

## When It Saves

- Autosave every **45 real seconds** if anything changed (an edit, or a new in-game day).
- After a world edit or a simulation update that changes the world, a debounced save runs
  after 1 second. This closes the refresh window where a newly grown shop or apartment
  existed in memory but had not reached the 45-second autosave yet.
- When the tab is hidden or closed (page `visibilitychange`), and when leaving to the start screen.
- On `Ctrl/⌘ S` or the status button.
- A failed save keeps the city marked dirty and retries after 5 seconds.

## Strict Saving (D-071)

- **Verify before writing.** `verifySave` round-trips each snapshot through JSON and
  `parseSave`: every building must survive, every layer must decode to the map size, and
  every footprint must fit without overlap. A snapshot that fails is never stored.
- **Journal.** Every save first writes the snapshot synchronously to localStorage
  (`citybuilder:journal:<store>:<id>`, or `:new` for a city with no save yet). So does hiding or
  closing the tab. The entry is removed once the store (IndexedDB or the server) confirms.
- **Load the newest.** Opening a city compares the store copy with any journal entry by
  `savedAt` and uses the newer one. If the store can't be read, it uses the journal. A `:new`
  entry is restored into IndexedDB on the next visit and opened.
- **Lenient reads.** Counters are rounded instead of dropping a building; `buildingTiles` is
  a cross-check only and never fails a load.

## Save Format (`sim/save.ts`, version 1)

Building instances remain the authoritative saved records. Each save also contains a
`buildingTiles` JSON map whose `"x,y"` keys identify every occupied tile and whose values
refer to the building's index in `buildings`. This makes tile ownership explicit and
inspectable while keeping the map footprint deterministic and compact. On load, footprints
are rebuilt from the validated building records and the tile map is validated against map
bounds and building references. (`sim/save.ts`, version 1)

Only what can't be recomputed (D-034), plus the land itself (`ground`, `elev`; D-071) so a
generator change can't move it. Older saves regenerate terrain from its settings; road
access, utilities, coverage, commutes, needs and traffic are rebuilt on load.

```ts
interface SaveData {
  v: 1;                      // format version; migrate older ones on load
  gen: number;               // GENERATOR_VERSION the terrain came from
  name: string;
  terrain: TerrainSettings;  // preset, seed, size and sliders
  city: { funds; day; clock; taxRate };
  layers: { road; bridge; zone; cleared; lane?; pave?; ground?; elev? };   // RLE + base64, one byte per tile
  savedAt?: number;          // client time of the snapshot (newest copy wins on load)
  buildings: SavedBuilding[];  // [def, x, y, variant, flags, construction, fullDays, occupants, happiness %, moodDays]
}
```

- **Layers** are run-length encoded as `(value, run length as varint)` pairs, then base64.
  A 128×128 city's four layers come to a few KB.
- **cleared** is 1 where the tile has neither tree nor decor; on load those tiles are cleared
  after the terrain is regenerated (the generator is deterministic, so the rest matches).
- **flags**: bit 0 = grown, bit 1 = abandoned.
- Buildings with an unknown `def`, out-of-bounds footprint or overlapping tiles are skipped,
  so a catalog change can't make a save unloadable.
- The growth and fire random streams are reseeded with the day on load, so a reloaded
  city doesn't replay the same events.

Typical size: ~3 KB of layers plus ~45 bytes per building (a 2,000-building city ≈ 100 KB).

## Server (`server/`)

Express 5 + Postgres (D-062), run with Node's built-in TypeScript support (no build step).
`docker compose up -d` starts Postgres; `bun run dev` starts the server alongside Vite, which
proxies `/api` to it. Env: `PORT` (8787), `DATABASE_URL`, `NODE_ENV`.

```
server/
  index.ts       config → db → migrate → app → listen
  config.ts      env, validated with zod
  app.ts         middleware, routers, error handler, static files
  db/            Db interface + pg pool; ordered migrations
  http/          HttpError + error middleware; zod `parse`; session cookie, security headers; rateLimit
  modules/auth   password · auth.service · auth.schemas · auth.routes
  modules/saves  saves.repository (SQL) · saves.service (rules) · saves.schemas · saves.routes
  test/          PGlite database and a test server with a cookie-keeping client
```

| Route | Body / result |
|---|---|
| `POST /api/auth/signup` | `{ email, password }` → `{ user }` + session cookie |
| `POST /api/auth/login` | `{ email, password }` → `{ user }` + session cookie |
| `POST /api/auth/logout` | clears the session |
| `GET /api/auth/me` | `{ user }` or `{ user: null }` |
| `GET /api/saves` | `{ saves: SaveMeta[] }` (no data) |
| `GET /api/saves/:id` | `{ meta, data }` |
| `POST /api/saves` | `{ meta, data }` → `{ meta }` (new city) |
| `PUT /api/saves/:id` | `{ meta, data }` → `{ meta }` |
| `DELETE /api/saves/:id` | `204` |
| `PUT /api/saves/:id/sharing` | `{ isPublic }` → `{ meta }`; only the owner can publish or hide a city |
| `GET /api/world/cities` | `{ cities }`; public metadata only, no owner identity or funds |
| `GET /api/world/cities/:id` | `{ meta, data }` for an explicitly shared city only |
| `GET /api/tour` | `{ progress: { step, done } \| null }` (first-play tour, docs/04-ui-ux.md) |
| `PUT /api/tour` | `{ step, done }` → `204`; a finished tour stays finished |
| `POST /api/guest/heartbeat` | `{ guestId? }` → `{ kind: 'guest', guestId, state, playSeconds, nudgeMinutes, limitMinutes }` + `cb_guest` cookie, or `{ kind: 'member' }` when signed in (D-083) |

- Passwords: `scrypt` with a per-user salt, compared in constant time.
- Sessions: random 32-byte token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in
  production); only its SHA-256 is stored. 30-day expiry.
- Brute-force limits count **failures only** (D-073): 8 wrong passwords per email per address and 60 per address in 15 minutes; a successful login clears its email's count. Signup: 20 attempts per address per hour (invalid forms don't count). A 429 carries `Retry-After` and `retryAfter`, and the dialog counts down.
- **Sign in with GitHub** (D-077), when the server has `GITHUB_CLIENT_ID`/`SECRET`: `GET /api/auth/github?returnTo=/path` sets a 10-minute httpOnly state cookie and redirects to GitHub; `/api/auth/github/callback` checks the state (constant-time), swaps the code for the profile, and signs in. A linked GitHub account signs in as its user; otherwise a user with the same GitHub-*verified* email is linked; otherwise a new account is made (no password; GitHub's noreply address if no verified email). Failures return to the page with `?auth_error=…`, shown in the dialog. `returnTo` only accepts same-site paths. Callbacks are limited to 30 per address per 10 minutes. `/api/auth/me` reports `providers: { github }` so the client shows the button only when it works.
- `/api/health` returns 200 when Postgres answers (for load balancers). Deploying: [docs/deploy.md](../deploy.md).
- Bodies are validated with zod; save data must be an object with a numeric `v`. Request
  bodies up to 8 MB; at most 30 cities per account.
- Tables: `users`, `sessions`, `saves` (JSON text plus `name`, `population`, `funds`,
  `day`, `size`, `preset`, `seed` columns for the list), versioned by `schema_version`.
  One row per city; a save overwrites it (last write wins). The quota is checked in the
  same INSERT statement.
- In production (`bun run start`) the server also serves `dist/`, so one process runs the whole game.

## Client

- `SaveStore` interface (`list`, `load`, `create`, `update`, `remove`) with two
  implementations: `LocalSaveStore` (IndexedDB) and `CloudSaveStore` (the HTTP API).
- `CitySaver` owns autosave for the open city: which store and id it saves to, dirty
  tracking, and moving a local city into the account after login.
- The URL holds the open city as `?city=local:<id>` or `?city=cloud:<id>`.
- Account cities are private by default. Their owner can publish/unpublish them from the city list. The public world only returns opted-in cities; visits load a snapshot without the edit HUD or autosave. See [world.md](world.md).
