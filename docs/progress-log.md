# Progress Log

Newest first. One entry per work session.

## 2026-11-11: UI/UX pass: phones, overlays, loading (D-097, D-098, D-099)
- **Unblocked startup.** `HEAD` (incidents work) crashed every city on start and failed typecheck: the new Trauma Centre had no art, the three emergency vehicles had no sizes, and `Game.showDay` read the removed `DayOutcome.burned`. Added a trauma-centre recipe (hospital family), liveries and sizes for fire trucks, ambulances and police cars, and `Game.showBurned()` reading `incidents.takeEvents()` (only `burned` is shown; the other incident events are still unused).
- **Phones and upright tablets (D-097):** slim top bar + More sheet, five-button dock with a zone row, bottom sheets for pickers/inspect/budget, opt-in minimap on phones. Landscape phones share the slim bar (it had overflowed). Rotate prompt removed; manifest orientation `any`. Opaque panels instead of backdrop blur on small/touch screens.
- **Overlays (D-098):** `src/app/overlay/overlay.ts` (`overlayAtom`, `useOverlay`, `useDismiss`); Clock, StageChip, AlertsButton, AccountButton and BudgetPanel use it; `budgetOpenAtom` removed; z-index layer tokens; dismissible toasts.
- **Loading (D-099):** `game/loading.ts` stages; `LoadingScreen` with real steps, fade-out handoff, error + retry; HUD mounts only when ready; old `.fade-in` curtain and render-failed card removed.
- **Desktop/tablet:** the full top bar (~1500 px) overflowed at 1280 and 1440: its groups now fold up to 1600 px; windows up to 1100 px use the slim bar; 56 px tool buttons at ≤1100 px.
- Checked in headless Chrome at 375×812, 390×844, 768×1024, 844×390, 1024×768, 1280×800, 1440×900 (loading, play, More sheet, zone row, Civic picker, budget, tour). 336 tests pass; typecheck and lint clean.
- **Not done:** swipe-to-close on sheets; incident toasts/alerts (fires started, thefts, patients) beyond "burned down".

## 2026-11-05: Art Track: modern architecture and landmarks (D-096)
- Recipes split one file per building (`buildings/recipes/<category>/<id>.ts`).
- Modern kit `atlas/modern/`: `facets.ts` (facets lit by their normals, depth-sorted), `plans.ts` (superellipse, chamfered, trefoil, sail, rotate), `loft.ts` (lofts, prisms, sweeps, plan shadows), `skins.ts` (curtain glass with floor lines, mullions and night-light marks; bands; fabric), `parts.ts` (spires, slabs, light rings, halos), `vault.ts`, `wheel.ts`, `coaster.ts`.
- New landmarks in Parks & Places (`atlas/landmarks/`, one module each): Sky Tower (3×3, Metropolis), Sail Hotel (3×3, City), Observation Wheel (3×3, City), Theme Park (4×4, City; castle, rides). /demo places one of each round downtown (test added).
- Modern zoned towers (`atlas/towers/`): office tower (twist, obelisk, bullet, twin slabs, stepped, slant), condo tower (wave balconies, twisting stack, twin sky-pool towers), hotel (crescent, blade, cantilevered stack). Shopping complex and train station restyled (glass vaults, LED name bands, wave roofs).
- Checked in the art gallery (all rotations) and on /demo. Atlas 380 → 540 ms, 6 → 7 pages; 60 FPS idle and panning. 266 tests pass; typecheck and lint clean.
- **Next (Art Track):** modern restyle of homes, shops, small offices, apartments, services, utilities and energy; then roads.

## 2026-11-05: Art Track: cleaner ground tiles (D-095)
- Ground art moved from `atlas/groundArt.ts` to `atlas/nature/ground/` (`marks.ts` shared soft marks, `land.ts` grass/dry grass/sand/dirt/rock, `water.ts` deep/shallow, `index.ts` paintGround). Colours are `THEME.ground` tokens; `GROUND_BASE` (underlay, minimap) derives from them; the unused `INK` set is gone.
- Restyle: no more 1px speckle noise or dark grass outlines; softer modern bases; anti-aliased tufts, grains, ripples, pebbles and cracks at low contrast; water glints shimmer smoothly; surf band fades out from the shore.
- Checked in headless Chrome on a fresh coastal map (near, far, grid on) and /demo. 265 tests pass; typecheck and lint clean.
- **Next (Art Track):** roads restyle; theme picker.

## 2026-11-05: Transport overhaul TX2: flyovers (D-094)
- Map layers `over`/`overAxis` (saved); route-graph helpers in `sim/roads.ts` (deck nodes n + tile, straight-through only); commute Dijkstra and the cars' BFS on the two-level graph; deck traffic counted apart; no junctions on flyovers; road links use the deck's type along the deck.
- Road tool: At crossings → Junction / Flyover in the road picker; planner turns right-angle crossings into decks (+$400); clearing removes decks; deck ghost in the preview.
- Art: raised deck with piers and parapets drawn with the objects; ground road straight under it; cars on the deck lifted into the raised layer. /demo: the central highways cross on a flyover.
- Tests (`tests/flyover.test.ts`, 5): deck placement, no turning between levels, no lights and deck traffic, clearing, saving. 265 pass.

## 2026-11-05: Transport overhaul TX1: multi-lane traffic and street frontage
- `systems/traffic.ts`: cars carry a lane; lane queues keyed per lane; lane choice by room on every segment (buses and trucks outer); junction exits judged by the lane the car would take; lane changes eased. Test: a busy boulevard uses 2+ lanes (it used one queue per direction before).
- `systems/access.ts`: entrances prefer roads with a pavement; highways and expressways only as a fallback. Test: a home between a highway and a street uses the street.
- /demo one year: 44 ms/day (commute 30 ms, up from 15: more distinct street entrances); 260 tests pass.

## 2026-11-05: Alerts inbox
- Notices worth keeping carry a key and go to a top-bar alerts inbox (bell with an unread count): problems stay until the game resolves them (taxes collected, power back, materials arriving, water and power needs met, zones growing again) or the player dismisses them; a newer alert with the same key replaces the older; milestones, fires and abandonment stay until dismissed. Toasts are unchanged. Cleared per city.

## 2026-11-05: Water by reach; bus stops off highways; police, fire and clinic from the start (D-093)
- `systems/utilities.ts`: water towers serve buildings within 14 tiles (nearest tower with water left), replacing road-island pooling; reach preview, card stat, info panel and the no-water alert updated. /demo: towers on a 12-tile grid plus every downtown block (37, no dry buildings). Test towns given towers within reach.
- `systems/traffic.ts`: bus stops only on roads with a pavement; test that a highway gets none (fails on the old code).
- Stages: police, fire and clinic available from the Hamlet; Village at 150 people.
- 258 tests pass.

## 2026-11-04 (later): Citizens ask for transport and a research centre
- Needs `transit` (from Town: Comfortable/Prosperous homes and apartments; met by a bus station within 10 tiles or a train station within 8; weight 0.08) and `research` (from Metropolis: Prosperous homes; met by any research centre; weight 0.06). Content homes ask for any unmet expectation (hospital, university, transit, research). Labels, hints, colours and bubble icons (a bus, a flask). Tests: who expects transit and what meets it; research at Metropolis. /demo: 85% happiness, transit second among requests. 257 tests pass.

## 2026-11-04 (later): Trains rebuilt, curved track, bus stations, Civic picker (D-089, D-091, D-092)
- Rail: overpasses instead of level crossings (deck drawn with the objects, shade on the road, trains raised over it); any road type passes under at right angles. Double track art. Diagonal laying (`railDragPath`), staircases drawn as 45° chords and single turns as arcs (`railCornerShape`, `paintTrackCurve`), trains following the drawn track (`pointOnTrack`).
- Trains: `systems/trains.ts` rebuilt on lines (`railLines`): 1–4 push-pull trains per line by riders, acceleration and braking to every platform, signalled terminus turnarounds, moving-block headway; each direction on its own track. Tests: no overlap over 4,000 frames, whole train on the track through 6,000, one line through every station.
- Stations: generated names, custom art facing the track (platform, canopy, hall, clock tower), info panel with riders, trains and a strip of stops per line.
- Bus stations: catalog, Town unlock, road-facing variant and driveway art, fleets in the traffic system, bus share in the commute model, info panel; one in /demo (4 buses out, ~258 riders). Tests (`tests/bus.test.ts`, 3).
- Civic picker: a Transport tab; Services in Safety / Health / Education & research, Utilities in Power / Water / Garbage, small sections side by side; the picker sits above the side panels and scrolls instead of growing past the top bar.
- 255 tests pass.

## 2026-11-04 (later): E7b Trains
- Sim: `World.rail` layer (saved), `sim/rail.ts` (track masks, platforms, station-to-station minutes by BFS, serving station within 8 tiles, track paths), `planRail` / `applyRail` (right-angle level crossings with single-width roads, straight bridges over water, Rapid transit research in locked cities), track upkeep $0.8/tile. Buildings, zones and moves stay off track; a station needs track beside it ("A station needs rail track right beside it").
- Commute model: per home group and job, walk + 3 min wait + 0.3 min/tile + walk; when faster than driving the flow goes by train (nothing on the roads), counts riders per station and station pair; job attraction uses the faster mode. `commute.report.trainRiders`. No stations: byte-identical history.
- Visible trains: `systems/trains.ts` runs one train (engine + 3 carriages) per busy station pair, shuttling with a stop at each platform; drawn by the agent renderer. Art: track, crossing and bridge pieces (`render/atlas/rail.ts`), locomotive and carriage (`agentArt.ts`), station recipe.
- HUD: Rail card in the road picker (`Z`), station riders in the info panel, station lock label "Rapid transit" in the Civic picker, research-aware lock messages. /demo: a line with five stations.
- Also: budget panel no longer runs over the toolbar; materials storage shows before the first day; empty maps read AQI 15, not 0; collecting at a Town Hall off the road says so.
- Tests (`tests/rail.test.ts`, 7): crossings and no running along roads, bridges, station placement and network, research gate, save, the suburb–downtown line takes 53% of commutes, trains run and turn round. 247 pass.

## 2026-11-04 (later): E7 Research (D-090)
- `sim/research.ts`: Research Centre (Metropolis, 2×2) makes 3 points a day (4.5 with a university in reach), universities 1; projects finish automatically in order: cleaner coal (−40% fossil smoke), efficient garbage trucks (+30% collection), modern construction (−30% materials), wider care (+25% clinic and hospital reach), green industry (−40% industry smoke), rapid transit (unlocks trains, E7b). Effects reach air, garbage, materials and coverage through `techEffects`; nothing changes for cities without research.
- HUD: research progress, points a day and finished projects in the stage menu; a milestone toast with a chime when a project finishes. Saved as `city.research`. Tests: points and order, effects, save. 240 pass.

## 2026-11-04 (later): E6 Construction materials
- `systems/materials.ts`: industry makes 0.15 t per worker a day; every grown building and upgrade needs 1% of its price in tons; up to 6 t a day imported at $25/t when short; storage 300 t + 400 t per warehouse, surplus exported at $6/t. Upgrades check materials before clearing the old buildings. Only in new cities (`City.needsMaterials`); others build freely and replay identically.
- HUD: Construction materials in the budget panel (stock, today's made / imported / used, waiting constructions); a monthly toast when construction waits. Tests: production, storage and export; imports and the daily cap; stalled upgrades keep their buildings (and do upgrade with materials); save round trip. 237 pass.

## 2026-11-04 (later): E5 Taxes at the Town Hall
- New player cities (`City.collectsTaxes`) pay upkeep at month end but bank taxes in the Town Hall's chest (`City.uncollected`, six months at most; the month toast warns from three and says what was lost). `collectTaxes` needs a working Town Hall. Saved and old cities collect automatically.
- HUD: "Collect $X" on the Town Hall's info panel and a chest section in the budget panel; a gold coin badge over the Town Hall while money waits; a coin sound. Tests: chest and collection, six-month cap, automatic cities unchanged, save round trip. 233 pass.

## 2026-11-04 (later): E4 Air quality (AQI)
- `systems/air.ts`: a 4×4-tile field rebuilt daily and after edits from industry (by how busy), coal and gas plants, incinerators, landfills and road traffic; two 3×3 blur passes; AQI = 15 + 260 × concentration (0–500) with the six usual bands. No memory, so nothing new to save.
- The clean-air need reads the AQI where a building stands (1 up to 50, 0 at 200) less highway noise, replacing the 6-tile radius check; "The air is making us sick" above AQI 150, with the AQI in the complaint.
- HUD: top-bar AQI (residents' average) toggles the AQI view (`O`); info panel shows each building's AQI.
- Calibration: six-factory block 103, coal plant's block 84; /demo residents 63 (Moderate), coal district 457. 0.07 ms a day. Tests: bands and score, a factory district dirty nearby and clean far away. 230 pass.

## 2026-11-04 (later): Lights only where traffic needs them (D-088)
- `systems/traffic.ts`: per-junction control, give way or lights, re-chosen daily from the commute load (on at 35% of capacity, off below 25%); the bigger road has priority at give-way junctions, equal roads all give way; a per-frame "junction in use" mark. Test: a quiet crossroads has no lights, gets them when busy, keeps them through small dips. /demo: 69 of 101 junctions lit. 228 tests pass.

## 2026-11-04 (later): Commute model 4× faster (engine 11.5, first part)
- `systems/commute.ts`: the road graph is built once per day (CSR adjacency with one-way and median rules, entry minutes at today's congestion); Dijkstra on typed arrays with a reused heap and stamp arrays; jobs as flat arrays; visible-car trips pick the top 4 instead of sorting every reached job.
- /demo, one year: `commute.day` 64.8 → 15.3 ms (max 21), a sim day 81.8 → 32.1 ms. The monthly history CSV is byte-identical before and after. 227 tests pass.

## 2026-11-04 (later): Bug fixes: power wear, black map, lights on wide roads; demo substations (D-087)
- Power: plant wear now uses grid load (demand ÷ all plants' full output). /demo after 90 days: 0 unpowered homes (was 819), commute times for 818/819 homes (was 0–190). Over 2 years /demo now ends at 88% happiness (was 62–69%) with 4,706 Comfortable and 18,962 Prosperous residents. The long-failing `transport.test.ts` corridor test was a real overload (one plant for ~7,000 demand); it now has three plants.
- Renderer: `preference: ['webgl', 'webgpu']`; a "Your browser can't draw the city" card when neither exists. Checked in headless Chrome without GL (card) and with SwiftShader (map draws).
- Roads: medians open only for side roads that join and carry cars; traffic lights only where 3+ car roads meet.
- /demo: 24 substations on a 12-tile grid and power plants for the evening peak plus 40%.
- Tests: plant wear (fails on the old rule), lights beside wide roads (fails on the old rule), moves during growth keep footprints consistent. 227 pass.
- Not reproduced yet: "new buildings are built over a moved building" (asked the user for steps).
- Cost note: with every home powered the commute model routes the whole city: `commute.day` ~64 ms on /demo (engine step 11.5 is the fix).

## 2026-11-04: City evolution: stages, lifestyle, hospital, university, garbage (D-085, D-086)
- Spec [specs/evolution.md](specs/evolution.md). Decisions: the server will run each city (D-085, features first); stages lock buildings and garbage starts at Village (D-086).
- Sim: `sim/stages.ts` (Hamlet → Village 500 → Town 2,500 → City 10,000 → Metropolis 30,000, unlock table), `sim/progression.ts` (stage gates: population plus the basics of the current stage), `systems/lifestyle.ts` (Basic → Comfortable → Prosperous; better-off homes expect a hospital, then a university, and pay 1.5× / 2.2× tax), `systems/garbage.ts` (daily garbage, collection by landfill / recycling centre / incinerator over road islands; landfills fill; recycling sells). Needs gained hospital, university and garbage, tier weights, and requests from content homes. University graduates add office demand. Hospitals count as clinics; level 3 still needs the four basic services.
- New buildings: Hospital (3×2), University (3×3), Landfill (3×3, own painter), Recycling Centre and Incinerator (2×2). `/demo` gained a downtown campus and a recycling centre per services block, and opens at its real stage.
- Saving: `city.stage` and `city.locked`; buildings carry lifestyle, streak, garbage and landfill fill (optional tail, save v1). Cities saved before stages load unlocked (user call: current players aren't disturbed).
- HUD: stage chip with the next-stage checklist and lifestyle mix; locked cards in the Civic picker; milestone toasts; info panel redesigned (actions at the top, one alert with the fix, stats grid, needs worst first with hints, what a facility provides, details folded; scrolls on desktop, where it used to run off screen); Move lives in the info panel and on `P` (the toolbar Move tool is gone) and returns to Select with the building still selected; "Citizens say" is a sticky toggle with a count badge that remembers open/closed.
- Refactor: the info-panel data moved out of `Game.ts` into `game/inspect.ts` (1,236 → ~1,150 lines).
- Harness: history samples gained stage, comfortable, prosperous and uncollected garbage; `sim:run` prints them. New systems cost ~0.1 ms a day on /demo.
- Tests: `tests/evolution.test.ts` (10). 223 pass; pre-existing failure untouched: `transport.test.ts` avenue corridor.
- Found, not fixed: only ~190 of 822 /demo homes get a commute time, so 487 score 0 on jobs (likely the same root cause as the transport test); Pixi `validateRenderable` crash in headless Chrome on `main` too (black map).

## 2026-11-03: Email codes for sign-up, password reset, and anti-bombing limits (D-084)
- Server: `server/modules/email/mailer.ts` (Brevo, console for development), `auth/emailCodes.ts` (hashed codes, migration 6 `email_codes`), `auth/humanCheck.ts` (Turnstile), new routes `signup/verify`, `password/forgot`, `password/reset`, `code/resend`; send limits per inbox, per address and per day in `auth.limits.ts`. Config `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_DAILY_LIMIT`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (docker-compose, `.env.example`, deploy.md "Email codes").
- Client: the auth dialog continues to a code step after sign-up, offers "Forgot password?" on log in, with resend countdowns; honeypot and Turnstile on forms that send email.
- Tests: `server/modules/auth/emailCodes.test.ts` (account only after the right code, hash-only storage, tries and expiry, resend replaces, honeypot, Turnstile, per-inbox cooldown/hour/day caps, per-address cap, daily budget 503, reset without account discovery, sessions ended on reset, GitHub-only accounts, purposes kept apart, mailer off). Pre-existing failure untouched: `transport.test.ts` avenue corridor.

## 2026-11-03: Server-side guest trial and a new gate (D-083)
- `server/modules/guests/` (schemas → routes → service → repository, plus `fingerprint.ts`), migration 5 (`guests`: id, keyed fingerprint, play seconds, last seen, claimed by). `POST /api/guest/heartbeat`; hourly prune of guests unseen for 90 days. Config `GUEST_SECRET` (required in production), `GUEST_NUDGE_MINUTES`, `GUEST_LIMIT_MINUTES`; passed through docker-compose, in `.env.example` and deploy.md.
- Client: heartbeats every 30 s while visible, id copied to localStorage, 5-minute offline grace then a "Reconnecting…" pause; off in dev unless `VITE_GUEST_TRIAL=on`.
- Gate redesigned (user: "not good"): the auth dialog's drafting-table look; the player's city on survey paper with a stamp beside the pitch, perks, Create account / GitHub / Log in. Matching nudge.
- Tests: `server/modules/guests/guests.test.ts` (cookie and new guest, server-side counting with breaks ignored, nudge then gate, cleared cookies keep used time, localStorage id fallback, members exempt, bad ids, nothing personal stored, IPv6 /64, fingerprint per device and secret). Screenshots at 1440×900 and 844×390 with a mocked server.

## 2026-11-03: Onboarding tour and guest sign-in prompts (D-081, D-082)
- Tour (`src/app/tour/`): ten steps; action steps finish when the player does them (Roads picked, road built, Homes picked, zone painted, power and water supplied). Desktop popover anchored to its control with a ring; landscape phones get a docked card that folds into a pill, with touch wording. **?** in the top bar replays it.
- Progress `{ step, done }` saved per step: device for guests, plus `server/modules/tour/` (migration 4, `tour_progress`, `GET/PUT /api/tour`) for signed-in players; guest progress is copied in on sign-up; a reload mid-tour resumes.
- Guest prompts (`src/app/account/GuestLimit.tsx`): reminder at 10 minutes, pause-until-sign-in at 30 (`GUEST_LIMITS`).
- Tests: `server/modules/tour/tour.test.ts` (session needed, remembers the step, done stays done, private per user, bad bodies). Checked by headless screenshots at 1440×900 (welcome → road built → next step, saved step id) and 844×390 touch (resume, docked card, fold, gate). Pre-existing failure untouched: `transport.test.ts` avenue corridor.

## 2026-11-03: Touch building and compact pickers (D-080)
- Touch drags wait for a Build / Cancel bar (`Game.confirmDraft`, `ToolPreviewInfo.awaitingConfirm`, `CostLabel` confirm bar); the touch hint says so.
- Landscape-phone pickers are a single sideways-scrolling row (picture, name, price), about a third of their old height. Checked at 693×310 with the Road and Civic pickers open.

## 2026-11-03: Landing pitch moves to the open-world vision (D-079)
- Landing hero ("Build the city. Then let it live."), new "Not just a city. A living world." section with four pillars marked *In development*, the city-builder steps retitled "Playable today", and an FAQ entry saying the AI agents aren't in yet.
- Same pitch in the page title, meta/OG/Twitter descriptions, JSON-LD, the crawlable boot text, the web manifest and the README intro.

## 2026-11-03: Mobile and landscape (D-078)
- Touch: pinch to zoom, two-finger pan, tap to inspect, no edge scroll from fingers, no stuck hover after a tap (`src/game/input/InputController.ts`).
- Rotate prompt for upright phones with full screen + landscape lock where supported (`src/app/mobile/`); manifest `orientation: landscape`; `viewport-fit=cover` and safe-area insets.
- Compact HUD for landscape phones, touch hint, folded citizens panel; start screen, login dialog and landing page fixed for small screens.
- Checked by screenshots at 568×320, 667×375, 844×390 and 932×430 (game, pickers), 390×844 (rotate prompt, landing), and the start screen and dialog in landscape.

## 2026-11-02: Sign in with GitHub (D-077)
- `server/modules/oauth/` (GitHub API client, repository, service, routes), migration 3 (`oauth_accounts`, nullable `pass_hash`), config `PUBLIC_URL` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (passed through docker-compose from `.env`). `/api/auth/me` now returns the available providers.
- Dialog: "Continue with GitHub" / "Sign up with GitHub" above the email form when enabled; failed sign-ins come back with a message in the dialog; players return to the page they were on.
- Tests: `server/modules/oauth/oauth.test.ts` (redirect and state cookie, new account, repeat sign-in, linking by verified email, noreply fallback with no password, forged/missing state, failed exchange, open-redirect attempts, disabled mode). The test client now keeps several cookies and doesn't follow redirects.

## 2026-11-02: Usage analytics (D-076)
- `events` table (migration 2) and `server/modules/analytics/` (schemas → routes → service → repository, plus a small User-Agent reader). The client (`src/app/analytics.ts`) sends a `visit` per page load and a `city_start` when a city goes into play (new, opened, demo; with preset, size and whether custom funds were used).
- Anonymous: random visitor ID in localStorage, no IPs, no raw User-Agents, Do Not Track respected. Rate-limited to 120 events per address per 10 minutes.
- Tests: `server/modules/analytics/analytics.test.ts` (stored fields, account link, validation, the rate limit, User-Agent parsing). Queries for the VPS in [deploy.md](deploy.md), "Usage numbers".

## 2026-11-01: The game is called Openpolis (D-001)
- Name chosen and domain registered: **Openpolis**, openpolis.space. Browser title, landing wordmark and footer, sign-up heading, package name, Docker image and docs use it. Added a favicon, page description, canonical URL and Open Graph tags.
- Internal identifiers keep the old `citybuilder` names (browser storage keys, IndexedDB, Postgres) so existing cities and accounts keep working.
- Bun replaces pnpm and Node (D-074): `bun.lock`, `bun run …` scripts, the server and headless sim run on bun, Docker image on `oven/bun`. Verified: checks, tests, build, `sim:run`, the server under bun, and the image end to end.
- SEO: keyword title and description, canonical URL, Open Graph/Twitter cards with a 1200×630 share image rendered from the game's art (`public/og.png`, from `/src/dev/og.html`), `VideoGame` + `WebSite` structured data, a crawlable static copy of the landing content inside `#root` (replaced by React on load), `robots.txt`, `sitemap.xml`, web manifest and icons, and an FAQ section on the landing page.
- `README.md` (with day and night screenshots in `docs/images/`) and `CONTRIBUTING.md`.

## 2026-11-01: Backend hardening and the account flow (D-073)
- Rate limits count failures only (per email and per address), clear on success, and send `Retry-After`; `TRUST_PROXY` so a deployed server sees real client addresses.
- Security headers, `/api/health`, asset caching (`/assets` immutable, `index.html` no-cache), hourly session pruning, `Dockerfile` + `docker compose --profile app`, [deploy.md](deploy.md).
- Account UI: new log in / sign up dialog (tabs, confirm password, show/hide, Caps Lock warning, strength meter, inline validation, error banner, 429 countdown); Log in + Sign up on the start screen; account menu with avatar and email.
- Landing page redesigned (user: it looked generic): a drafting-table theme (ink, survey grid, paper type, road-sign amber), the diorama labelled like a planning map, numbered steps instead of emoji cards. App fonts are now Bricolage Grotesque (display), IBM Plex Sans (text) and IBM Plex Mono (labels), replacing Inter. The auth dialog follows the same palette.
- VPS deploy: `docker compose --profile app` runs Postgres and the app, both bound to localhost (Docker's published ports skip the firewall); HTTPS from the operator's own reverse proxy ([deploy.md](deploy.md)). `.env.example` added.
- Guest landing page (`src/app/screens/landing/`): shown on the menu to visitors who aren't signed in and haven't chosen to play as a guest. Hero diorama painted live with the game's own art, sign up / log in / play as guest / tour the demo, feature cards, responsive to phone widths. Choosing guest is remembered (`citybuilder.guest`); logging out shows the landing page again. Dev preview of the dialog: `/src/dev/auth.html?mode=signup`.
- Tests: `server/modules/auth/auth.limits.test.ts` (limiter, success never limited, per-email lock with Retry-After, invalid forms free, health and headers). Verified the Docker image end to end against local Postgres.

## 2026-11-01: Art pass, near-3D tiles and a living city (D-072)
- Split all building, park and nature art into folders per family (`render/atlas/theme`, `core`, `nature`, `buildings`, `civic`, `ambient`) and restyled them with one light model: graded lit and shaded walls, occlusion, rim light, cast shadows, sky-reflecting glass, layered roofs with eave shadows, detailed rooftops.
- New trees: five species with lit leaf clumps, mixed woods with autumn and blossom accents; 10 forest looks per density. New rocks, flowers and grass. Parks rebuilt: lawns, rounded hedges, benches, lamps, raised flower beds, fountains; each of the six park layouts is its own file.
- Living city: swaying trees, lit windows at night (correctly hidden behind nearer buildings, dark when unpowered), blinking beacons, fountain spray, bird flocks, drifting cloud shadows.
- Dev review pages: `/src/dev/art.html`, `/src/dev/night.html`, `/src/dev/atlas.html`.
- Checks: typecheck, lint and build pass. Tests 160/161: the failing one is the pre-existing `transport.test.ts` avenue corridor (fails on the untouched baseline too). Verified by headless screenshots of the demo by day and night, and the gallery in all four rotations.
- **Open:** 60 FPS check on real hardware at 128×128 with sway and night lights on (headless Chrome can't measure it). Roads and ground weren't restyled in this pass.
- **Next:** simulation upgrade (user direction): an evolving population that asks for better parks, big hospitals, universities, sewage plants and sewage dumps.

## 2026-11-01: Strict saving (D-071)
- Fixed the progress-loss bug: a city with a charged battery bank couldn't be opened ("bad building tile"). Fractional counters are rounded on parse; the tile map is a non-fatal cross-check.
- `verifySave` checks every snapshot before it's stored; a bad one never overwrites a good save.
- Synchronous localStorage journal (`src/save/journal.ts`) written before every save and on tab hide/close; loading takes the newest of store and journal (`src/save/loadCity.ts`); unsaved new cities are restored on the next visit; failed saves retry in 5 s.
- Saves now include the terrain and elevation layers.
- Tests: `tests/save.test.ts` (strict saving), `tests/journal.test.ts`. Pre-existing failure untouched: `transport.test.ts` avenue corridor.

## 2026-11-01: Advanced power coverage and plant maintenance
- Power plants now expose type-specific coverage radii in the Build preview and picker.
- Generation is condition-aware: sustained high consumption wears plants down, derates output, and can trigger a repair period.
- Plant condition and repair state appear in the inspection panel, can be repaired for a type-specific cost, and persist in saves.
- The Energy Mix panel reports plants awaiting repair. Existing road-island delivery and battery behavior remain intact.
- Selecting an existing clinic, school, fire station or police station now shows its colour-coded coverage radius; placement previews continue to show the same reach.
- Added substations with blue coverage previews. Once a substation exists, plants and
  buildings must share its road island and reach to participate in the power network;
  cities without substations retain legacy delivery.
- Save data now includes an explicit JSON `buildingTiles` map for every occupied tile,
  while building tuples remain the authoritative source for restoring runtime state.
  Maintenance condition and repair fields are also accepted during JSON parsing.
- Added dynamic wealth-aware evolution: private villas, luxury apartments, creative offices
  and tech campuses join the daily upgrade paths. Luxury development requires investor
  confidence from occupied housing, happiness and job coverage; each new building has
  deterministic procedural variants and inspector badges.
- Autosaves now also trigger one second after world changes, instead of relying only on the
  45-second timer. This prevents newly grown shops, houses and offices from being lost when
  the player refreshes immediately after development.
- Customer demand now allows road-accessible businesses to attract residents from across the
  city. Commercial happiness separates customer availability from traffic quality, so heavy
  congestion produces a traffic complaint with average travel-time diagnostics.
- Power warnings now expose actionable diagnostics in the inspection panel, including
  substation coverage and live demand, supply and shortfall values.
- Power generation is now pooled citywide once substations exist: plants can be on different
  road islands, while each consumer still needs road access and substation coverage.

## 2026-11-01: Parks and shopping landmarks
- Added four placeable civic landmarks to the Parks & Places picker: Central Park, Botanical Garden, Shopping Complex and Riverside Market.
- Each landmark has deterministic procedural isometric art with distinct paths, water, planting, glasshouses, market stalls, storefronts and plaza details. Existing park, town hall, service and utility behavior is unchanged.
- Shopping landmarks remain civic buildings so they do not alter commercial zoning demand; their capacity still contributes jobs through the existing population model.
- Verified: 154 tests and lint pass. Typecheck was attempted but the environment permission prompt blocked that command.


## 2026-11-01: Transport T2, wide roads, ramps, pedestrian streets, paving
- **Wide roads:** Boulevard (6 lanes) and Expressway (8 lanes) are two parallel one-way carriageways laid by one straight drag (`World.lane` holds each tile's direction). `roadMask` follows the rules in one place: carriageways join end to end, open into each other at crossings and at their ends (turnarounds), and never sideways otherwise; expressways join only expressways, highways and **ramps**. `stepAllowed` keeps the commute model and visible cars from going against the flow; the trip home is routed fresh on one-way roads.
- **Pedestrian streets:** paved, car-free, walkable; cars never route through them.
- **Paving:** concrete, brick, granite setts, promenade, per tile (`World.pave`), picked in the road tool; each road type has a default.
- **UI:** one Roads button opens a Road picker with cross-section icons, lanes, price and hotkeys (K R V U J H X) and paving chips.
- **Art (D-066):** one file per road type in `render/atlas/roads/` (+ `paving.ts`, `oneway.ts`, furniture modules). The avenue trees were redesigned after user feedback ("they don't look good"): the city's own clustered-canopy trees at half size, one per tile in grates, alternating with clipped hedges and lamps.
- Saves gain optional `lane` and `pave` layers.
- Mid-session the dev build briefly rendered nothing (the road list gained types before their art existed); fixed, and the Fast Refresh warnings were cleared by moving `useCities` and `uniqueCityName` out of component files.
- Verified: 5 new rule tests (one-way rows, crossings, turnarounds, expressway access, pedestrian routing, saves); a road scene built with the real sim and art modules in Chrome; the Road picker in the game UI. 152 tests; typecheck and lint clean.

## 2026-11-01: Workers vs jobs fix (Demand v2), transport spec, T1 avenues
- **"Jobs but people asking for jobs" (user report):** the blue bubbles were factories saying "We can't find workers" (804 workers for 1,515 jobs), and the red bags were homes with nowhere to shop. Industry demand ignored jobs that shops, offices and civic buildings already filled. **Demand v2 (D-070):** four bars (Homes, Shops, Offices, Industry); offices and industry share `open jobs = workforce × 1.05 − all jobs`; shops follow residents. /demo after a year: +1,059 people, +725 workers, power and water shortages 78/121 → 0, commercial no longer stuck at −100%.
- **Transport spec** (specs/transport.md, D-069): one road-type table; Street, Avenue, Boulevard (6 lanes, 2 tiles), Highway, Expressway (8 lanes, 2 tiles), pedestrian street; pavement styles; flyovers, interchanges, cable-stayed and suspension bridges, tunnels; buses, trams, metro, rail, ferries with mode choice; parks and leisure variety. Steps T1–T7.
- **T1:** `sim/roadTypes.ts` holds every road's lanes, capacity, speed, footpath, costs, upkeep, noise and rank; commands (upgrade in place, paying the difference), commute, traffic (lanes, speeds, pedestrians), budget and needs read it, so no system checks a specific type. New **Avenue** (hotkey V): 4 lanes, planted median with shrubs, brick-paved footpaths, plane trees and double-headed median lamps as standing sprites. Road art is now `render/atlas/roads/` (kit, street, highway, avenue, avenueFurniture), with street and highway moved unchanged.
- Fixed a Fast Refresh warning (`uniqueCityName` moved out of the component file).
- Verified: tests for the road table (bigger roads carry more, faster), an avenue corridor jams under 60% of a street's congestion and commutes faster, and upgrade pricing; a road scene composed from the real art modules in Chrome. 147 tests; typecheck and lint clean.

## 2026-11-01: Spinning wind turbines; "why don't my offices grow?"
- **Turbine blades spin.** They were baked into the static texture. Now `render/atlas/energy/rotor.ts` is the one blade drawing, used by a new fx layer (`render/fx/Rotors.ts`) that spins them at the day's wind × game speed (still when paused) and by picker thumbnails as a still (`paintBuilding(..., { stillParts: true })`). Art declares hub points (`CivicArt.rotors`), like smoke sources. Verified in Chrome: frames half a second apart differ.
- **Offices never growing (user report):** diagnosed on the user's real save (River Valley, 1,166 people): 18 empty office lots and 16 shop lots, all next to roads, but commercial demand −10%, while residential (+0.33) and industry (+0.69) had no empty land left. Growth only fills a zone when its bar is above zero, and nothing told the player.
  - Demand bar tooltips now explain each bar in a sentence (`explainDemand`).
  - A notice after 10 days of lots waiting on demand, at most once a month per zone kind.
  - The zone tool's preview says "no demand yet" while painting a zone with no demand.
  - Test: offices waiting on negative commercial demand are counted and explained.
- **Found a balance flaw:** shops and offices share one commercial bar, and office towers add so many jobs that the /demo city sits at −100% commercial forever. The fix is Demand v2's split into Shops and Offices bars (master plan §6.4), pending the user's go-ahead because it changes /demo.
- 145 tests; typecheck and lint clean.

## 2026-11-01: Feature track A, Energy v2 (D-067, D-068)
- User direction: focus on the master plan's features (public transport, hospitals, universities, research, proper traffic, drainage, sewage, more advanced water and power). Set the order A–F (D-067) and added drainage (§12.2b) and research (§12.4) to the master plan.
- **Deterministic clock (D-068):** `City.ticks` and `Simulation.tick()` replace frame-time clock advance. Hours and days come from fixed ticks, so every machine plays a city the same way. The game, the harness (`runDays`) and the tests all use it.
- **Energy:** Coal (renamed), new Gas Power Plant, Wind Turbine, Solar Farm and Battery Bank. Hourly per-island balance in `sim/systems/energy.ts`: wind and sun are pure functions of seed, day and hour; demand follows an evening-peak curve; batteries charge on surplus and cover shortfalls (charge saved per building, an optional 11th save field). Edits and days re-balance at the current hour without moving charge.
- **UI:** Energy Mix in the budget panel (a stacked meter by source, demand marker, battery %); a brownout notice once per clock day that explains the fix; refreshed after every edit (it used to wait for the next day: a bug found in the browser test).
- **Art (D-066 applied):** each new building has its own painter file in `render/atlas/energy/` (`gasPlant`, `windTurbine`, `solarFarm`, `batteryBank`), sharing colour tokens in `energy/tones.ts`; the shared lot helpers moved out of `civicArt.ts` into `lot.ts`.
- Gas counts as a lighter polluter (0.4 vs coal 0.8) in the clean-air need.
- Verified: 4 new energy tests (solar browns out at night, batteries carry the evening, steady plants cover every hour, wind varies by day); the determinism test now runs through ticks with solar, wind and batteries; /demo hashes unchanged on three seeds; in Chrome all five plants place and draw, and the panel shows the live mix. 144 tests; typecheck, lint and build are clean.

## 2026-11-01: Phase 11.1 harness, timings and exact save continuation
- Started the master plan (05-master-plan.md). Phase 11 is split into six measured steps (specs/engine.md, D-065).
- **Timings:** every sim hook is timed (`SystemTimings`); F3 shows the five slowest against their budgets.
- **Harness:** `pnpm sim:run` runs the real sim on Node with no rendering or build step, writing monthly CSV plus a timing table; `pnpm bench` adds the budget report. For this, the sim's 14 constructor parameter properties became plain fields, and ESLint now keeps sim, shared, scripts and server to erasable syntax.
- **Baseline:** a /demo day costs ~92 ms in a single tick (5–6 dropped frames per in-game day). `commute.day` is 72.5 ms (79%) and `needs.day` 12 ms; everything else is under 0.5 ms. 11.3 and 11.5 target exactly these.
- **Determinism:** saves now carry the random stream states, commute volume and commute minutes; `loadSimulation` restores them, so a reloaded city plays out exactly as the running one. The test fails without the new block (checked).
- `tsx` was tried and dropped: it needs esbuild's native build script, which pnpm's guard blocks. The failed install left `tsx`/`esbuild` in the lockfile (committed in 85dcb70) and broke the user's running dev server (missing `refresh-runtime.js`). Restored the clean lockfile from d0d0993 and reinstalled.
- The F3 overlay moved below the top bar (they overlapped).
- User direction recorded (D-066): split tile art into clean single-purpose components with a modern, 3D, themeable look; added to the roadmap as an Art Track.
- 140 tests pass; typecheck (client, server, scripts), lint and build are clean.

## 2026-11-01: Roads continue past rock (D-064)
- User report: on the Island map, a highway dragged across a grey rock outcrop failed for everything after the rock. `planRoad` now judges each tile on its own. Rock, buildings and the map edge block only their own tiles. A water crossing is checked as a whole (straight, within span, buildable land at both ends, not crossing a bridge sideways), so bridges never dangle.
- `/demo` keeps the old rule through `leadingRun`. Its roads, bridges and buildings hash the same as before on three seeds.
- Tests: 2 new (rock gap, building gap, bridge onto rock) and 4 updated to the new rule; 138 pass.

## 2026-11-01: Saving fix: "my island progress wasn't shown after logging in again"
- Nothing was lost: both of the user's Island saves were in Postgres with their roads. But after logging in, the start screen led with "Found a new city", preselected with the same seed, so starting Island again gave an empty copy that looked like lost progress. The small, picture-less city card didn't help.
- Fix: a **Continue** card for the last-played city with a live map preview, previews on every city card (lazy, queued, cached), *Found a new city* folded away when you have cities, unique default names, and the camera centred on roads and buildings when a city loads.
- Verified in Chrome: play Island → log out → log in → Continue → the road is there.

## 2026-11-01: Master plan for the simulation
- Wrote [05-master-plan.md](05-master-plan.md): how the city should evolve after Phase 10. It covers resident groups, land value and building lifecycle, economy and goods, roads/bridges/outside connections, transit with mode choice, travel-time services with dispatch, utilities v2, government, performance and save v2. It also lays out Phases 11–22.
- Roadmap "Later Phases" now follows it. No code changed.
- The user answered §16 (D-063): resident groups, a regional highway on every map, ramps, stages, road wear as an option, Worker first, and realistic terrain-based disasters (added as §11.5).
- **Next:** finish Phase 10 (saving), then write the Phase 11 spec.
## 2026-11-01: Phase 10 saving & accounts
- **Save format** (`sim/save.ts`): the terrain settings (preset, seed, size and every slider the player changed), city state, RLE+base64 road/bridge/zone/cleared layers, and buildings as 10-number tuples. A grown demo city round-trips exactly. Parsing validates untrusted JSON and drops unknown buildings rather than failing. Growth and fire random streams now mix in the day, so a reloaded city doesn't replay day 0.
- **Server**: the user switched storage to **Postgres in Docker** and asked for a cleanly structured backend (D-062). Express 5, modules (`auth`, `saves`) split into routes → service → repository, one `HttpError` handler, zod validation, scrypt passwords, hashed session tokens in httpOnly cookies, rate-limited login, owner-scoped saves with a 30-city cap. Tests run on PGlite, so no Docker is needed for `pnpm test`.
- **Client**: IndexedDB store for guests and an HTTP store for accounts behind one `SaveStore` interface; `CitySaver` autosaves every 45 s (also when the tab is hidden and when leaving); `Ctrl/⌘ S`; save status in the top bar; log in / sign up dialog; account menu; "Your cities" on the start screen (continue, delete, move to account); `?city=` reopens a city on reload.
- New cities aren't saved until the player builds something, so rerolling maps (N) doesn't fill the list.
- Verified in Chrome (Playwright): sign up → build a road → save → list → reopen → reload, and guest save → sign up → the city moves into the account. No errors besides the missing favicon (it was never there). 136 tests pass; typecheck and lint are clean.
- **Open:** a favicon; centring the camera on roads when a city has no buildings yet.

## 2026-11-01: Phase 9 — Citizen needs (step 3 of the plan)
- User decision: abandonment included.
- **New `systems/needs.ts`:** ten needs, weighted happiness, complaints, city happiness, and abandonment streaks (abandoned and recovered buildings go into the day outcome).
- **Happiness feeds the sim:** it replaces the service occupancy bonus (55–100%), and level 2 needs 0.5 happiness, level 3 needs 0.7.
- **The demo** now covers its industrial corner with a service block.
- **UI:**
  - Bubble icons (`atlas/bubbleArt.ts`) and a rotating bubble overlay (`overlays/Bubbles.ts`).
  - "Citizens say…" panel with Show me, and a happiness % that toggles the happiness view (`Y`).
  - The data overlay is now generic: traffic or happiness, one at a time.
  - Info panel happiness and needs; a dark tint for abandoned buildings.
- **Checked:** the demo at 87–88% happiness, the panel, bubbles, the happiness view and Show me in the browser; no errors. Tests: 121.

## 2026-11-01: City art pass (buildings, streets, people, smoke)
- User request: make buildings, parks, utilities, roads and highways look far better, with real variety, footpaths and overhead bridges. Later: animated smoke from factories and power plants. Spec: `docs/specs/city-art.md`, decision D-060.
- **Buildings (`buildingRecipes.ts` + `buildingArt.ts`):**
  - 6 variants per zoned building that change form: podiums, setbacks, pyramid tops, heights; brick, siding, ribbon, grid and finned glass facades; helipads, spires, antennas, roof gardens, pools and solar panels; garages, trees and planters.
  - Named shops (Bakery, Books, Deli, Florist, Pharmacy), cafés (Diner, Pizza, Noodles, Bar, Gelato), hotels (Inn, Grand, Suites, Plaza, Resort) and markets.
  - Industry gets silos, tanks and twin stacks.
  - Shared iso helpers moved to `isoPaint.ts`.
- **Civic (`civicArt.ts`):**
  - cooling-tower, gas and twin-tower power plants; globe, classic and reservoir water towers;
  - 6 parks (fountain, playground, pond, court, gazebo garden, picnic grove);
  - patrol cars, fire doors and a hose tower, red crosses, a school playing field;
  - a domed town hall.
- **Streets (`roadArt.ts`, new `streetArt.ts`):** paved footpaths with kerbs, zebra crossings on the footpath line, and stop lines. Street trees and lamps go in the objects layer. Highways get barriers, two lanes each way, lamps, sign gantries, and foot overbridges every 8 tiles.
- **Agents:** pedestrians follow a mitred footpath route (they cross at zebras) and never walk on highways. Cars use lane 0.13, and highways have inner and outer lanes.
- **Smoke (`render/fx/Smoke.ts`):** pooled plumes from stack tops taken from the art; steam from cooling towers.
- Worked alongside the Phase 8 traffic session in the same tree: kept its live traffic lights and dropped my static ones.
- Checked in headless Chrome: the demo at several zooms and after rotation, plus variant sheets. Typecheck and lint clean, 118 tests.

## 2026-11-01: Phase 8 — Traffic overhaul (step 2 of the plan)
- Reproduced the user's gridlock headlessly (`tests/support/jamTown.ts`): 318 cars, 48% stuck.
- **New `systems/commute.ts`:**
  - Dijkstra from each group of homes, with congestion-aware tile times and distance-decayed job attraction.
  - Flow is pushed down the shortest-path tree, then smoothed.
  - Outputs volume and congestion per road tile, commute minutes per home, and weighted trips.
- **Traffic:**
  - Cars drive commute trips.
  - Capped at 0.35 per road tile, spawning only with room.
  - The congestion speed factor slows cars down.
  - Traffic lights (5 s phases, offset per junction, don't-block-the-junction) replace the junction boxes.
- **Visuals:**
  - Traffic-light poles (red/green).
  - `T` overlay of roads coloured by congestion, with buildings faded, plus a legend (commuters, average commute, jammed tiles).
  - Commute time in the info panel.
- Fixed: duplicate toast ids when dev mode mounts the game twice.
- Result: 0–3% stopped and 37 cars on the same town; the connector shows as congested and a highway relieves it. Tests: 115.
- Shared the working tree with the city-art session (simcity-web-5e). Their lane offsets and pedestrian paths in `traffic.ts` were kept alongside this work.

## 2026-11-01: Systems foundation (step 1 of the plan, D-057)
- Decisions: order is foundation → traffic → needs → backend (D-057); no free starter utilities (D-056); "systems as services" means in-game modules (D-058); the product name is still open (D-001).
- Split `population.ts` and `services.ts` into `systems/` modules (access, utilities, coverage, fire, population, budget); moved growth and traffic there.
- New `SimSystem` interface and `Simulation` core that runs the systems in order. `Game` no longer orchestrates the sim itself.
- No behaviour change: /demo builds the same city (about 26,000 residents, about 1.9 s), and the full play loop passes in the browser.
- Tests: 111 (3 new core tests: the edit pipeline, the day outcome and month-end budget, determinism).

## 2026-11-01: Phase 7 — Core city
- **Time:** days last 6 s, speeds are true 1×/2×/3×, and the clock opens a day/night menu (cycle / always day / always night, with `L` stepping through).
- **Density (D-054):** zone tools 1–5 for Homes, Apartments, Shops, Offices and Industry, with darker tints for high density. Growth is density-aware.
- **Utilities (D-052):** power plant (4,000) and water tower (2,500) pooled per road island, ⚡/💧 badges, one-time hints, utility supply in the budget panel.
- **Services (D-053):**
  - Police, fire, clinic and school, with coverage circles previewed while placing.
  - Occupancy is 70% + 7.5% per covering service; level-ups require services.
  - Fires break out outside fire coverage.
- **Budget:** tax slider (0–20%) that moves demand, a forecast with a cost breakdown, and per-building upkeep.
- **UI:** the Civic panel has Services / Utilities / Parks & Civic tabs; the info panel shows power, water, services and upkeep.
- Fixed while testing: the day/night menu opened under the budget panel, and it now closes on an outside click.
- `/demo` (D-055): a seeded planned city of about 26,000 residents, ready in about 1.9 s (`sim/demo.ts`, spec `docs/specs/demo.md`). Fixed while building it: road islands cut off by the river need their own utilities.
- Tests: 108. Verified in the browser: a full loop (road → services → utilities → four zone types → 476 residents at 3×), the budget panel, day/night menu and info panel. No errors.

## 2026-10-31: Simplify: flat maps, no terrain tools, no Dezone
- User decision (D-051): removed the hills (generator, presets, slider, URL param), the Raise/Lower/Level tools and `sim/terraform.ts`. The borderlands ring is flat.
- Dezone removed: Clear now also removes zones (and a bulldozed grown building doesn't regrow).
- Kept: the sloped-mesh renderer, which draws a flat world at no extra cost; the zoning-UX hints; the zoom limit; development funds of $700M (D-049).
- Tests: 105 (terraform and hills tests dropped; new tests for flat presets and Clear removing zones). Checked in the browser: flat Forested map, the trimmed toolbar, Clear over zoned tiles, no errors.

## 2026-10-31: Phase 6 — Elevation, terraforming & borderlands
- **Decisions this session:** borderlands with hills for the map edge; Phase 6 next; the Build tool now places civic buildings only (D-042); nothing committed yet.
- **Heights** (D-043): `World.elevation` with the one-level-per-tile rule, plus `surfaceHeight`, `cornerHeight`, `isFlat` and `smoothElevation` (`sim/terrain/elevation.ts`). The generator has a Hills slider and per-preset hills; River Valley's terrain stays byte-identical.
- **Rendering** (D-044):
  - Ground, roads, zone lots, the grid, hover and previews are sloped meshes from `render/ground/TileMesh.ts`, with a custom shader for hill light and fog. Water still animates.
  - Objects, agents, badges and effects are lifted onto the terrain (`render/view/lift.ts`).
  - Picking uses fixed-point iteration.
  - The minimap is hill-shaded.
- **Terraforming:** Raise, Lower and Level (`5`/`6`/`7`) at $15 per tile-level. Neighbours ripple to keep the rule, and water, roads and buildings are locked. Ripple tiles show fainter in the preview.
- **Building rules:** buildings and 2×2 merges need flat footprints.
- **Borderlands** (D-045): an extended render-only world with rivers and sea carried on, hills rising to rocky mountains, fog, a fogged underlay (no lattice when zoomed out) and a dashed border line. The soil slab is gone.
- Tests: 109 total (7 new: elevation, terraform, borderlands).
- Verified in headless Chromium: hills on every preset; terraform preview cost, a road over a raised hill, a lowered dip; borderlands on Forested and Coastal; a town growing on hills; rotation. No console errors.
- Follow-up (user feedback): the mountain ring looked smudgy, so it's simplified to low land fading into fog (D-046).
- Follow-up (user feedback): hill shading removed, since it showed as dark patches; the furthest zoom-out now keeps the screen inside the map (0.4× for 128×128 on a 1440×900 view) (D-047).
- Follow-up (user feedback): homes UX (D-048). Build is renamed Civic with zone shortcuts; zone tiles out of road reach are amber in the preview and grey once zoned; cost-label note and toast.
- Gotcha: the module-level shader cache must be released per atlas, not globally. React's dev double-mount destroys the first game while the second is already running, and a global release broke the second game's meshes ("Mesh shader has no glProgram").

## 2026-10-31: Finishing the open items (Phases 5, 4c extras, 2b)
- **Phase 5:**
  - The toolbar is grouped.
  - New minimap (`render/minimap.ts` and `hud/Minimap.tsx`): view-rotation aware, repaints at most 4 times a second, live viewport quad, click or drag to glide there.
  - Time-of-day clock in the top bar (D-039), with a day/night multiply tint that `L` toggles.
  - Procedural ambience: wind by zoom, city hum by cars on screen, birds by day.
- **Phase 4c extras:**
  - Rush-hour trip curve, with morning trips outbound and evening trips home.
  - Lane-gap queuing plus junction boxes, with patience so nothing deadlocks (D-040).
  - Automatic bus stops with glass shelters; buses run stop to stop and dwell (D-041).
- **Phase 2b:**
  - `generate.ts` (was `riverValley.ts`) is now preset and slider driven, and River Valley stays byte-identical (hash test).
  - Five new presets that use dry grass, dirt and rock.
  - New Game screen with live preview and URL options (D-038), and New city in the top bar.
- Tests: 102 total (8 new: traffic 4, presets 4).
- Verified in headless Chromium:
  - New Game → Coastal "Bayport" → reload keeps the city → New city returns.
  - Minimap jump, a night tint at 01:50, bus stops by the shops, all six preset previews.
  - No console errors.
- Still open: the 60 FPS check on real hardware (Phases 1, 2a, 3). Headless Chrome renders in software, so it can't measure this.

## 2026-10-31: Zoning & growth (Phase 4b)
- Agreed the save/backend plan before starting, to build later: Express + SQLite, email/password accounts, saves hold the seed plus what changed (D-034).
- **Zoning:** `sim/zones.ts`; `planZone`/`applyZone` (rezoning or dezoning removes grown buildings; roads and placed buildings clear the zone). Four tools on `1`–`4`, with zone-coloured previews and a "Residential $150 · 30 tiles" cost label.
- **Growth** (`sim/growth.ts`, daily, seeded RNG):
  - R/C/I demand from built capacity: homes need jobs, jobs follow homes.
  - New level-1 lots on empty zoned tiles with road access.
  - A 4-day construction stage.
  - Level-ups in place or as 2×2 merges, gated by occupancy, days and city size.
  - `chooseBuilding()` picks from the catalog.
- **Road access** now reaches 3 tiles (`findEntrance`: nearest ring first, then fewest straight steps, front first), so 3-deep zones develop.
- **Rendering:** zoned-lot layer per chunk (soft, full strength in zone view); procedural foundation and scaffold sites with a tower crane on 2×2 (`constructionArt.ts`); multi-rect `refreshWorld` so a day's changes rebuild each chunk once.
- **UI:** zone buttons in their colours, R/C/I demand meter, info panel shows construction days left and grown vs placed.
- **Tuning:** first try grew about 100 buildings in the first minute. Halved lot and upgrade rates and raised the level gates to 150 and 1,000 residents.
- Verified in headless Chromium: zoned both sides of two roads on seed 42; sites, then houses, then walk-ups and merged warehouses; 584 residents by June Y1 at 3×; rotation fine; no console errors.

## 2026-10-31: View rotation
- The user asked to see the other side of the map. Built 4-way rotation (D-032, D-033), replacing deferral D-003.
- `ViewTransform` (world ↔ view math) and `ViewWorld` (rotated copy of the tile layers, re-synced after edits). The existing chunk, road, bridge and terrain renderers work on it unchanged.
- The building painter is now rotation-aware: recipes in local space, rotated layout, camera-facing walls only, front details only when the front faces you, view-depth ordering for ground props. All 17 buildings were checked on a 4-rotation contact sheet.
- Overlays, effects, agents, previews (rotated road masks, swapped bridge axes, rotated ghosts) and picking all convert through `viewRef`.
- Controls: `,` / `.` plus top-bar rotate buttons with a compass. The camera keeps its centre and the view fades in.
- `AtlasBuilder` now emits pages of up to 4096 px. Boot is atlas ≈ 286 ms, map ≈ 18 ms.
- Tests: 15 new for transforms and view sync (85 total).
- Verified in the browser: built a town, rotated through all 4 sides with traffic running, and placed a building in a rotated view (it landed under the cursor).
- Gotcha: the first scripted test failed because the input started before a cold dev-server load finished. It was not a game bug.

## 2026-10-31: Simulation, cars and people (Phase 4c)
- **Dynamics:** calendar (1 day = 2 s), speed controls, road access per building, population that grows toward a job-dependent target, jobs filling from the workforce, and a monthly budget (taxes vs upkeep) with a toast.
- **Traffic:** cached, bridge-aware BFS routing. Cars, taxis, buses and trucks drive on the right with smooth lane changes through turns and run faster on highways. Pedestrians stroll the pavements with a walk cycle. Density follows population (caps: 320 cars, 180 people).
- **Rendering:** pooled, screen-culled, depth-sorted agent layer with zoom LOD. Procedural vehicle art (4 kinds × 6 colours × 4 headings, head and tail lights) and people (8 variants × 2 frames).
- **UI:** top bar (date, population, workers/jobs, funds, speed, mute); click-to-inspect info panel with occupancy bar, road status and Demolish; orange "no road" badges; debug overlay hidden by default with boot timings and agent counts.
- **Optimisation:** measured boot (atlas ≈ 200 ms, map ≈ 20 ms) and found no hotspot worth restructuring. Agents are capped, culled and LOD'd; routes are cached; the daily sim is O(buildings).
- Verified in the browser: built a street, ran at 3× for a month (population 419, 247/524 jobs, January budget +$1,689), saw cars, buses and pedestrians, inspected buildings, and saw the no-road badge. 70 tests.
- Fixed: city name wrapping in the top bar.

## 2026-10-31: Phase 4a building catalog and art
- Plan agreed: 4a catalog and art → 4b zoning and growth → 4c moving cars.
- **17 buildings**:
  - Homes: Cottage, Family House, Townhouses, Walk-up, Apartment Block, Condo Tower
  - Shops & Offices: Corner Shop, Café, Small Office, Supermarket, Hotel, Office Tower
  - Industry: Workshop, Warehouse, Factory
  - Civic: Park, Town Hall
- Procedural painter: lit and shaded walls; gable, hip, flat and sawtooth roofs; punched, band, curtain-wall, shopfront, townhouse and industrial facades; awnings, signs (sheared text), balconies, water tank, AC units, canopy, lit crown, loading docks, smokestack, parking lot with cars. 3 colour variants each.
- `World.building` and `World.buildings`. `planPlace`/`applyPlace` with footprint checks and auto-clearing. Clear removes whole buildings, and roads can't pass through buildings. 9 new tests (59 total).
- Build tool (`E`) with a picker (category tabs, live thumbnails painted by the same code, cost and size), a ghost preview, a cost or "can't build here" label, plus pop, dust and sound.
- Added `?funds=` URL option for testing. Gave parks a hedge and paved edge (they blended into the grass).
- Verified in the browser: placed all 17 types, no console errors.

## 2026-10-31: Bridges, build effects and sound (Phase 3 complete)
- **Bridges:** a new `World.bridge` layer. Paths crossing water become straight, land-to-land bridges (max 12 tiles) at $60 or $160 per tile. They connect only at their ends, and clearing removes them. 8 new tests (50 total).
- Bridge art: deck markings, rails and posts, a dark side face, pillars, and a shadow on the water. The first version looked too much like road, so it was made more distinct.
- **Effects:** a rippling additive pop flash and pooled particles (dust, splash, leaves and chips, rock grit) with a 1,500 cap and capped ripple time.
- **Sound:** procedural Web Audio (build thunk and ticks, bridge ping, clear crunch, error buzz, tool click). `M` and a speaker button mute it; the setting persists.
- Verified in the browser: bridge preview and pricing, build pop and dust, leaf burst on clear, no console errors. (Sound can't be checked headless.)
- The user asked for more realistic bridges. Rebuilt them in taller frames with piers and ripples, a girder, parapet walls, lamp posts and a soft shadow. Toned down the first pass's shadow (it read as a slab on the sand) and the ripples (they looked like white squares).

## 2026-10-31: Phase 3 roads, highways and clearing
- Seed 42 (the approved River Valley) is now the default map.
- Sim: `RoadType` (road/highway), `roadMask`, L-path (`Shift` = straight), rectangle selection, `City` funds, and pure `planRoad`/`applyRoad`/`planClear`/`applyClear`. 14 new tests, 42 total.
- Art: 16 auto-tiled pieces each for street (sidewalks, dashed centre line, zebra crossings at junctions) and highway (guard rails, lanes, median).
- Game: tool system (`Q` select, `B` clear, `R` road, `H` highway, `Esc`/right-click cancel). Left-drag uses the tool, right-drag pans. Live ghost preview and cost label. Chunk refresh rebuilds only roads and objects.
- UI: toolbar with icons, tooltips and hotkeys; top bar with funds (flashes on spend); cost label that flips near screen edges; error toasts.
- Verified in the browser: build road, highway and L-paths; clear a forest (preview plus cost); funds update; no console errors.
- **Open:** placement juice and bridges (Phase 3 leftovers), 60 FPS check on real hardware, product name.

## 2026-10-31: Phase 2a River Valley terrain
- Narrowed Phase 2 to **one terrain done perfectly** (River Valley), as the user asked. Presets and the New Game screen moved to 2b.
- Generator: own simplex noise, winding river plus tributary, lakes, cleanup, sand rims, forest clumps, decorations. 28 tests pass.
- The user shared a reference image (pixel-art map). We matched its style: bright palette, narrow winding river with a surf edge, chunky outlined pines, rocks and flowers. Dropped the dirt and rock ground patches for this terrain.
- Rendering switched to a **dual grid**, because the first overlay approach left staircase edges. Fixed hairline seams with two-pass drawing (bases, then overlays).
- Added a soil slab along the map edge, the `N` key for a new seed (kept in the URL), and the seed in the debug overlay.
- The user approved **seed 42** ("looks perfect"). It's now the reference map.
- Added rocks where natural (rocky meadows, forest edges, riverbanks) plus a mossy boulder pile. Decor uses its own random stream, so seed 42's layout is unchanged.
- **Open:** 60 FPS check on real hardware. Product name (D-001). Whether to switch to a top-down camera like the reference (currently isometric).

## 2026-10-31: Phase 1 engine foundation
- Scaffolded Vite + TS + React 18 + PixiJS 8 + Jotai 3, with ESLint (rule: `src/sim` can't import render/UI/game), Prettier, Vitest. Switched to **pnpm**.
- Built the `World` (typed-array layers), iso math plus tests, the procedural atlas (`AtlasBuilder`, drawn at 2× with mipmaps), the chunked ground renderer (16×16 render groups plus culling), the eased camera (cursor-anchored zoom, 1:1 drag, WASD, edge scroll, trackpad pinch/pan), the hover highlight, the fixed-timestep loop, the F3 debug overlay and the G grid toggle.
- Verified in headless Chrome: renders, hover, zoom, grid, drag, culling (draw calls ≈ visible chunks), no console errors.
- Fixes found while testing: grass variants differed too much (checkerboard look), so base colours were evened out. Zoomed far out, a diamond seam pattern showed through, so a map-shaped grass layer now sits under the tiles.
- Gotcha: adding `packageManager` to package.json made pnpm 12 try to download a native binary and fail, so it is not pinned.
- **Open:** confirm 60 FPS at `?size=256` on real hardware. Product name (D-001).
- **Next:** Phase 2, terrain generator and New Game screen.

## 2026-10-31 — Phase 0: Planning
- Created docs: vision, architecture, roadmap, UI/UX, specs (terrain, roads, buildings), decision log.
- Open decisions D-001 (name), D-002 (iso vs top-down) and D-003 (rotation) need sign-off.
- **Next:** Phase 1, engine foundation (scaffold, iso grid, camera, picking, debug overlay).
