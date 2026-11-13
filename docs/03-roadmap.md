# 03 — Roadmap & Progress Tracker

Legend: ✅ done · 🚧 in progress · ⬜ not started

Each phase ends with a **Definition of Done (DoD)** that we verify before moving on.

---

## Phase 0 — Planning & Docs ✅

- [x] Vision, architecture, roadmap, UI and specs written
- [x] User sign-off: isometric view, rotation deferred, Jotai instead of Zustand, pnpm (name still open)

---

## Phase 1 — Engine Foundation 🚧 (built; awaiting 60 FPS check on real hardware)

Goal: an empty isometric world you can fly around smoothly.

- [x] Vite + TS + React + Pixi project scaffold, ESLint/Prettier, Vitest
- [x] `World` with typed-array layers (flat grass map for now)
- [x] Iso math (`iso.ts`) with unit tests (tile ↔ screen round-trip)
- [x] Procedural atlas v0: grass tile with variants plus grid line
- [x] Chunked ground renderer + viewport culling
- [x] Camera: drag-pan (middle/right mouse), WASD/arrow keys, edge-scroll, wheel zoom anchored at cursor, eased motion, zoom limits
- [x] Tile hover highlight (accurate diamond picking)
- [x] Fixed-timestep loop + debug overlay (FPS, draw calls, hovered tile) on `F3`

**DoD:** 256×256 flat map pans/zooms at 60 FPS and the hover highlight is pixel-accurate.

> Test it with `bun run dev`, then open `http://localhost:5173/?size=256`. Hover picking is covered by unit tests and was checked in a headless browser. FPS must be checked on a real GPU, because headless Chrome renders in software.

---

## Phase 2a — River Valley terrain, done perfectly 🚧 (looks approved on seed 42; awaiting 60 FPS check)  → [specs/terrain.md](specs/terrain.md)

We focus on **one** terrain and make it look great before adding presets or menus.

- [x] Seeded simplex noise + fBm utilities (no dependency)
- [x] River Valley generator: winding narrow river, tributary, lakes, cleanup, sand rims, forest clumps
- [x] Generator tests: deterministic, river crosses the map, no 1-tile specks, speed budget
- [x] Pixel-art ground for all 7 terrain types (bright palette from the user's reference)
- [x] Dual-grid terrain transitions: rounded marching-squares contours, no staircase edges, no seams
- [x] Shoreline surf band and animated water shimmer
- [x] Chunky outlined pines (cluster sprites, 3 densities × 6 variants), depth-sorted, with shadows
- [x] Decorations: rocks (meadows, forest edges, riverbanks), boulders, flowers, tall grass
- [x] Diorama soil slab along the map edge
- [x] Grid as a separate layer (works over every terrain)
- [x] `N` key: new random seed (seed shown in debug overlay and kept in the URL)
- [ ] 60 FPS confirmed on real hardware at 128×128

**DoD:** any seed produces a natural-looking river valley with no visual seams or hard tile edges, and it holds 60 FPS on 128×128.

## Phase 2b — More terrains + New Game screen ✅  → [specs/terrain.md](specs/terrain.md)

- [x] Presets: Plains, Coastal, Island, Lakes, Forested (River Valley unchanged, byte-identical)
- [x] **New Game screen:** preset cards, seed field + 🎲, map size, sliders (water, trees, rivers, coast), live minimap preview (< 10 ms at 128), "Start building"; options kept in the URL; "New city" in the top bar
- [x] Minimap painter (`render/minimap.ts`), shared by the HUD and the preview
- [x] Preset tests (4 new)

**DoD:** the player picks a preset, tweaks sliders, sees the preview update in under 100 ms and starts a game on that terrain.

---

## Phase 3 — Roads, Highways & Clearing ✅ (pending 60 FPS check)  → [specs/roads.md](specs/roads.md)

- [x] Toolbar + tool system (Select/Clear/Road/Highway, hotkeys, Esc/right-click cancel)
- [x] Road tool: click-drag L-shaped path (Shift = straight), ghost preview, cost label at cursor
- [x] Highway tool (wider, median, lane markings); roads and highways connect
- [x] Validation (no roads on water/rock; contiguous run from start); invalid tiles tinted red
- [x] Trees/rocks on a road path are auto-cleared at their clearing cost
- [x] 4-bit autotiling for both types: straight, corner, T, cross, dead end (16 masks each)
- [x] Clear tool: drag a rectangle to remove trees, rocks and roads, with live cost
- [x] Money: starting funds, costs, top-bar funds with flash, "not enough money" toast
- [x] Sim tests: paths, pricing, water cut-off, upgrades, insufficient funds, clearing
- [x] Bridges over water: straight, land to land, max 12 tiles, connect only at their ends
- [x] Placement juice: rippling pop flash, dust/leaf/grit/splash particles
- [x] Procedural sound effects (build, bridge, clear, error, tool) + mute (`M`, persisted)

**DoD:** drawing a road network feels instant and satisfying, pieces connect correctly in every configuration and clearing re-tiles the neighbours.

---

## Phase 4a — Building Catalog & Art ✅  → [specs/buildings.md](specs/buildings.md)

- [x] Building catalog (sim): 17 essential types across residential, commercial, industrial and civic, each with size, level, cost and capacity
- [x] Procedural building painter: iso boxes with lit and shaded faces; gable, hip, flat and sawtooth roofs; windows, balconies, awnings, signs, chimneys, water tanks, loading docks
- [x] 3 colour variants per building so neighbours don't match
- [x] World building layer + instances; footprint validation (land, no roads, no other buildings; trees auto-cleared)
- [x] Build tool (`E`) with a building picker (categories, live thumbnails, cost); ghost footprint preview
- [x] Clear tool removes whole buildings
- [x] Pop, dust and sound on placement; tests (59 total)

## View Rotation ✅  (D-032, D-033)

- [x] `ViewTransform` + `ViewWorld`: draw the map from any of 4 sides; sim stays in world space
- [x] Buildings in 4 orientations from one recipe (front details only when the front faces you)
- [x] Roads, bridges, terrain, trees, cars, people, previews, effects, badges and picking all rotation-aware
- [x] Controls: `,` / `.` and top-bar ⟲ ⟳ with a compass; camera keeps its centre; fade transition
- [x] Atlas pages (≤4096 px) for the bigger atlas; tests for transforms and view sync (85 total)

## Phase 4b — Zoning & Growth ✅  → [specs/buildings.md](specs/buildings.md)

- [x] Zone tools: R / C / I / Dezone (`1`–`4`), drag-rectangle, $5/tile; zone tint, full-strength zone view while zoning
- [x] Growth: zoned tiles within 3 tiles of a road develop and level up (house → walk-up → tower); 2×2 lots merge
- [x] Construction animation (foundation → scaffold, crane on 2×2 → building pops in)
- [x] Info panel (construction status, grown vs placed); R/C/I demand meter in the top bar
- [x] Growth tests (9 new, 94 total)

## Phase 4c — Simulation, Moving Cars & People ✅  → [specs/simulation.md](specs/simulation.md)

- [x] Calendar + speed controls (pause/1×/2×/3×, Space, [ ])
- [x] Road access per building, with warning badges
- [x] Population: homes fill over time, faster when jobs exist; jobs take workers from the workforce
- [x] Monthly budget: taxes vs road and civic upkeep, with a toast report
- [x] Rebalance roads ($20–$100 construction), model 13% seniors and 87% wage earners, add household living costs and four independent resident tax sliders, and book utility bills as public revenue
- [x] Road graph routing (BFS, cached, bridge-aware)
- [x] Cars (car, taxi, bus, truck), right-hand lanes, smooth turns, faster on highways
- [x] Pedestrians on pavements with a walk cycle
- [x] Agent renderer: pooled, culled, depth-sorted, zoom LOD
- [x] Top bar: date, population, workers/jobs, funds, speed; building info panel with Demolish
- [x] Sim tests (11 new, 70 total)
- [x] Car queuing (lane gaps, junction boxes), rush hours on the time-of-day clock, bus stops with shelters and dwelling buses (4 new tests)

**DoD (4a–4c):** zone next to roads, watch a small town grow, and see cars driving around it, all at 60 FPS.

---

## Phase 5 — HUD & Polish ✅  → [04-ui-ux.md](04-ui-ux.md)

- [x] Final toolbar with icons, tooltips and hotkeys, in three groups
- [x] Top bar: city name, date + clock, money, population, demand, speed controls, rotate, mute, New city
- [x] Minimap in HUD with click/drag-to-jump and a viewport quad
- [x] Toast notifications
- [x] Sound effects + ambient audio (wind, city hum, birds), with a mute toggle
- [x] Day/night tint on a time-of-day clock (`L` toggles)

---

## Phase 6 — Map Edge (Borderlands) ✅  → [specs/elevation.md](specs/elevation.md)

- [x] Borderlands: flat decorative land round the map (rivers and sea carried on), fading into fog, with a dashed border line (replaces the soil slab)
- [x] Zoom-out limited to keep the screen inside the map
- [x] ~~Hills, Raise/Lower/Level tools~~: built, then removed at the user's request to keep the game simple (D-051). Maps are flat; the renderer can still draw heights.

## Phase 7 — Core City ✅  → [specs/core.md](specs/core.md)

- [x] Slower time (6 s days), true 1×/2×/3×, day/night control (cycle / day / night) in the top bar
- [x] Density zones: Apartments and Offices (tools 1–5)
- [x] Utilities: power plant and water tower over the road network; ⚡/💧 badges and first-time hints
- [x] Substation-gated power corridors with road-following connectivity and coverage preview
- [x] Services: police, fire, clinic, school with coverage; occupancy and level-ups depend on it; fires
- [x] Budget panel (click the funds): tax rate, forecast, utility supply; civic upkeep
- [x] Civic panel tabs (Services / Utilities / Parks & Civic), coverage preview while placing
- [x] Tests (107) and docs

## Systems Foundation ✅  (D-058)

- [x] Simulation split into systems (`src/sim/systems/`) behind one `SimSystem` interface, run in order by `Simulation` (`src/sim/core/`)
- [x] `Game` drives the `Simulation` and only shows its outcome; no behaviour change (/demo is identical, all tests pass)
- [x] Core tests (3 new, 111 total)

## City Art Pass ✅  → [specs/city-art.md](specs/city-art.md)

- [x] Building variants that change form (massing, height, roof, facade, rooftop, lot); 6 per zoned building
- [x] Shop, café, hotel and market names per variant; industrial equipment
- [x] Civic art: power plants, water towers, 6 parks, police/fire/clinic/school details
- [x] Streets with real footpaths, kerbs, crossings and stop lines; street trees and lamps (traffic lights are the live ones from Phase 8)
- [x] Highways with barriers, lane markings, foot overbridges and sign gantries
- [x] Animated smoke from factory and power-plant stacks, steam from cooling towers
- [x] Pedestrians stay on footpaths (mitred route, cross at zebras, never on highways); lane offsets match the new roads (3 tests, 118 total)

## Phase 8 — Traffic Overhaul ✅  → [specs/traffic.md](specs/traffic.md)

- [x] Commute model: homes' workers to jobs over the road graph (fastest path, congestion-aware, distance decay); volume, congestion and commute time
- [x] Visible cars drive real commute trips, capped at 0.35 per road tile, spawn only with room, slow down on congested roads
- [x] Traffic lights replace junction boxes (alternating axes, don't block the junction); drawn as red/green poles
- [x] Traffic overlay (`T` / top-bar button) with legend; buildings fade in traffic view; commute time in the info panel
- [x] Gridlock regression test (48% stuck → 0–3% stopped) and commute tests (4 new, 115 total)

## Phase 9 — Citizen Needs ✅  → [specs/needs.md](specs/needs.md)

- [x] Needs system: jobs, shopping, safety, health, education, commute, clean air, parks (workers and customers for businesses); happiness as their weighted average
- [x] Happiness drives occupancy (replaces the per-service bonus) and gates level-ups; abandonment after 30 unhappy days, recovery after 15 better ones
- [x] Speech bubbles with need icons over complaining buildings; "Citizens say…" panel with Show me
- [x] Happiness view (`Y` / top-bar smiley) and city happiness %; info panel happiness and need scores; abandoned buildings look run-down
- [x] Tests (3 new, 121 total)

## Phase 10 — Saving & Accounts ✅  → [specs/saving.md](specs/saving.md)

- [x] Save format `sim/save.ts`: seed + terrain settings (the player's preset changes included), city state, RLE layers, compact buildings; validated parsing; tests (5)
- [x] Save server: Express 5 + Postgres (Docker), modular layout (D-062): auth (scrypt, httpOnly session cookie, rate limit) and saves (owner-scoped CRUD, 30-city cap); tests on PGlite (10)
- [x] Client stores: IndexedDB for guests, the HTTP API for accounts; `CitySaver` autosave (45 s, tab hidden, leaving), `Ctrl/⌘ S`
- [x] Start screen "Your cities" (continue, delete, move to account); log in / sign up dialog; account menu; save status in the top bar; `?city=` reopens on reload
- [x] A guest city moves into the account on its first save after logging in
- [x] Verified in Chrome: sign up → build → save → list → reopen → reload; guest → log in migration; no errors

## Phase 11 — Engine for Depth (in progress)  → [specs/engine.md](specs/engine.md)

- [x] 11.1 Headless harness (`pnpm sim:run`, `pnpm bench`), per-system timings (F3 + budgets), exact save → load continuation (D-065); baseline: a /demo day costs ~92 ms, 79% of it commute routing
- [ ] 11.2 City history ring buffer (saved) + Graphs panel
- [ ] 11.3 Cadence tiers + time-slicing: no sim frame over 16 ms on /demo
- [ ] 11.4 Fields engine (coarse grids, diffuse, decay, wind)
- [ ] 11.5 Road segment graph + Dijkstra + isochrones: `commute.day` under 25 ms on /demo (**met: 15.3 ms** with a daily flat graph, identical results; isochrones still to do)
- [ ] 11.6 Simulation in a Web Worker: main-thread sim cost under 1 ms per frame

## Feature Track (user order, D-067)

- [x] **A. Energy v2** → [specs/energy.md](specs/energy.md): coal, gas, wind (daily wind), solar (sun curve) and battery banks; demand follows the clock with an evening peak; hourly per-island balance; brownout notice; Energy Mix in the budget panel; deterministic tick clock (D-068); 4 energy tests
- [ ] **B. Water, sewage and drainage**: shore water pumps, treatment, sewage outlets and plants, river flow carries pollution downstream, storm drains and street flooding (master plan §12.2, §12.2b)
- [ ] **C. Health and education**: hospital (beds, ambulances), clinic, elementary and high school, university, library, research centre
- [ ] **G. City evolution** → [specs/evolution.md](specs/evolution.md) (D-085, D-086), user order:
  - [x] E0 Stages that lock buildings, with gates (population + working basics); old saves unlocked
  - [x] E1 Lifestyle tiers (Basic → Comfortable → Prosperous), hospital and university expectations, lifestyle tax, graduates → office demand
  - [x] E2 Garbage: landfill, recycling centre, incinerator; garbage need from the Village
  - [x] Info panel redesign, Move from the selected building, sticky "Citizens say"
  - [ ] E3 Incidents that work together: fires, theft and illness dispatched to fire, police and hospital, with burning buildings and theft markers on the map; trauma centre
  - [x] E4 Air quality index (AQI) per area and for the city, from industry, power, traffic and incinerators; AQI view (`O`), top-bar AQI, clean-air need reads it
  - [x] E5 Taxes collected by hand at the Town Hall (new cities): six-month chest, coin badge, collect buttons
  - [x] E6 Industry makes construction materials that new buildings and upgrades consume (new cities): imports at a price, warehouse storage, export of surplus
  - [x] E7 Research (D-090): Research Centre at Metropolis, automatic projects (cleaner coal, garbage trucks, modern construction, wider care, green industry, rapid transit)
  - [x] E7b Trains: rail track (Rail tool `Z`, overpasses over roads, bridges, diagonal and curved track), train stations, commuters switching from car to train; lines with double track, signalled push-pull trains (D-091); a line across /demo
  - [x] Bus stations (D-092): 3×3, Town stage, facing their street with a driveway, a fleet of four buses, 15% of nearby drives by bus
  - [x] Civic picker: Transport tab, sectioned Services and Utilities
  - [x] Citizens ask for transit (from Town) and a research centre (from Metropolis)
  - [ ] Power made understandable (a "how power works" explainer, power view on the map)
  - [ ] Server-run cities (D-085): the server ticks each open city, the browser sends commands
- [ ] **D + E. Transport** → [specs/transport.md](specs/transport.md) (D-069), steps T1–T7:
  - [x] T1 Road-type table (`sim/roadTypes.ts`) with every system reading it; **Avenue** (4 lanes, planted median, brick footpaths, median trees and lamps); upgrade in place paying the difference; road art split into `render/atlas/roads/` (one file per type)
  - [x] T2 Boulevard (6 lanes) and Expressway (8 lanes) as 2-tile one-way carriageways (`World.lane`), ramps (expressways join only ramps and highways), pedestrian streets (walkers only), pavement styles (concrete, brick, granite setts, promenade; `World.pave`), turnarounds at wide-road ends, one-way routing for commutes and cars, Road picker UI; avenue trees redesigned after user feedback
  - [ ] **Next (user requests):** Move tool (pick up a building and place it elsewhere); camera: rotate by dragging (middle mouse / Alt) with an animated quarter turn
  - [ ] T3 Flyovers, interchange prefabs, truss / cable-stayed / suspension bridges, tunnels
  - [ ] **Curved roads** (D-089, spec: transport.md "Curved roads"): C1 45° diagonal strips with smoothed vehicle paths → C2 rounded corners → C3 Curve drag mode and arcs for wide roads
  - [x] Smarter junction control, first part (D-088): give-way by default, lights only where the load needs them
  - [ ] Junction control, rest (T4): stop-sign art, adaptive lights, roundabouts, click to override
  - [ ] T4 Road segment graph + Dijkstra (fixes the 92 ms day), junction control, adaptive lights, isochrones
  - [ ] T5 Buses: stops, line tool, depots, line panel, mode choice, transit view
  - [ ] T6 Trams, metro, rail, ferries, transfers
  - [ ] T7 Parks and leisure: central park, water park, botanical garden, Wonderland, stadium
- [ ] **F. Research tree**: points from universities and research centres; energy, mobility and city branches

## Art Track (runs alongside the phases; D-066)

- [x] Split tile and building art into small single-purpose modules (ground, water edges, road pieces, bridge parts, furniture, building massing, roofs, facades, rooftop details), refactor first with no visual change
- [x] A theme system: palette and lighting as tokens (`theme/tokens.ts`, one `ArtTheme`); a theme picker is still to do
- [x] Modern 3D look for buildings, parks, trees and decor (D-072)
- [x] Clean, calm ground tiles: soft surfaces, no pixel speckle or outlines, ground colours as tokens (D-095)
- [x] Modern architecture kit (`atlas/modern/`: lofts, facet lighting, glass and fabric skins, vaults, wheels, coaster track) and one file per building (D-096)
- [x] Landmarks: Sky Tower, Sail Hotel, Observation Wheel, Theme Park (D-096)
- [x] Modern office tower, condo tower, hotel, shopping complex and train station (D-096)
- [ ] Modern restyle of the remaining buildings: homes, shops, offices, apartments, services, utilities and energy
- [ ] Restyle roads to match
- [x] Ambient life: swaying trees, night window lights, beacons, fountains, birds, cloud shadows (D-072)

## Later Phases

Planned in detail in [05-master-plan.md](05-master-plan.md) (accepted, D-063). Each phase still gets its own spec before code.

| Phase | Theme |
|---|---|
| 10 | Save/Load (in progress): Express + Postgres backend with email/password accounts, IndexedDB autosave, multiple cities (D-034, D-062) |
| 11 | Engine for depth: sim in a Web Worker, segment road graph, fields, history, headless harness |
| 12 | Land value and pollution: desirability, wealth tiers, decline and redevelopment, demand v2 |
| 13 | People: resident groups, life stages, migration, regional highway |
| 14 | Education and jobs: school tiers, university, wages |
| 15 | Services v2: travel-time reach, capacity, dispatch, fire spread, crime |
| 16 | Utilities v2: plant types, sewage, river pollution, garbage |
| 17 | Transport I: avenues, ramps, overpasses, mode choice, bus lines |
| 18 | Transport II: trams, metro, rail, freight |
| 19 | Economy: goods chain, specialised industry, trade, loans |
| 20 | Government: stages, districts, policies, approval |
| 21a | Weather and terrain-based disasters (tsunami, floods, wildfire, tornado …) |
| 21b | Living city: events, tourism, landmarks, seaport, airport |
| 22 | Polish and modes: Sandbox/Career, tutorial (onboarding tour done early, D-081), balance |
