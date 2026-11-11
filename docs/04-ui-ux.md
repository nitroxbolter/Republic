# 04 — UI / UX

## Look & Feel

- **Style:** modern "glass" HUD floating over the world. Panels are translucent dark with backdrop blur, soft shadows and rounded corners (12px). The world stays the hero, and the UI never covers it with big opaque bars.
- **World art:** clean, bright, slightly stylised isometric look, generated in code: lit 3D objects (D-072) on calm, soft ground (D-095). Ground is flat colour with a few low-contrast marks, so the city on top stays the focus.
- **Motion:** every interaction gives feedback within 1 frame. Panels animate in over 150–200 ms (ease-out). Placed objects "pop" (scale 0.85 → 1.05 → 1 with a dust puff).
- **Typography:** Inter (UI) plus a tabular-number font feature for money and population.

## Design Tokens (initial)

```css
--bg-panel: rgba(18, 22, 30, 0.72);
--bg-panel-hover: rgba(30, 36, 48, 0.85);
--border-panel: rgba(255, 255, 255, 0.08);
--text: #E8EDF5;   --text-dim: #9AA6B8;
--accent: #4FD1C5;  /* teal: primary actions, selection */
--zone-r: #4ADE80;  --zone-c: #60A5FA;  --zone-i: #FACC15;
--danger: #F87171;  --money: #A3E635;
--radius: 12px;     --blur: 14px;
```

## Screen Layout (in-game)

```
┌──────────────────────────────────────────────────────────────┐
│ [City name]  📅 Jan 2026   💰 $20,000   👥 0   ⏸ ▶ ▶▶ ▶▶▶  ⚙ │ ← top bar (floating)
│                                                              │
│                                                ┌──────────┐  │
│                    (world)                     │ minimap  │  │
│                                                └──────────┘  │
│                                                              │
│                ┌─────────────────────────────┐               │
│                │ 🛣  🟩R 🟦C 🟨I  🏭  🌳  🚜  🔍 │               │ ← toolbar (bottom-center)
│                └─────────────────────────────┘               │
└──────────────────────────────────────────────────────────────┘
```

- **Info panel** slides in from the right when you inspect a tile or building.
- **Minimap** sits bottom-right (see below). The controls hint is bottom-left and the toolbar bottom-centre.
- **Toolbar groups**, separated by thin dividers: *Select · Clear · Civic* | *Homes · Shops · Industry* | *Road · Highway*. Civic offers parks and the town hall (D-042); Clear also removes zones (D-051).
- **Tool options** (e.g. zone density, road type) pop up above the active toolbar button.

## Minimap (Phase 5)

- A small diamond-shaped map of the whole city, matching the current view rotation. It's painted from the world layers, one pixel per tile:
  - terrain colours, darker where there's forest;
  - zones tinted;
  - buildings in their category colour (orange while under construction);
  - roads dark.
- It repaints when the world changes (at most 4 times a second) and on rotation.
- A white quad shows the part of the map on screen and follows the camera every frame.
- **Click or drag** on the minimap to move the camera there (smooth pan).
- The same painter (`render/minimap.ts`) draws the New Game preview (Phase 2b).

## Time of Day & Day/Night (Phase 5)

- A **clock** separate from the calendar: one clock day is 90 sim seconds (it pauses and speeds up with the game). It's shown as `hh:mm` next to the date. The calendar keeps its fast 2-second days for the economy.
- **Day/night tint:** a multiply-blended layer over the world, under the HUD and the tool overlays. It goes clear by day, warm at dawn and dusk, and deep blue at night.
- `L` toggles the cycle (it stays clear daylight when off). The setting persists.
- The clock also drives rush hours (docs/specs/simulation.md).

## Ambient Audio (Phase 5)

- Procedural, like the effects, and quiet:
  - **wind:** low-passed brown noise, louder when zoomed out;
  - **city hum:** band-passed noise that scales with the cars on screen and fades when paused;
  - **birds:** occasional chirps by day when the view is mostly nature.
- Everything goes through the master gain, so `M` mutes it too.

## New Game Screen

Full-screen backdrop with a slowly panning generated map. A centered card holds:
1. City name input
2. Terrain preset cards (thumbnail plus name)
3. Map size: Small 64 / Medium 128 / Large 256
4. Seed input with a 🎲 randomize button
5. "Advanced" sliders: Water level, Tree density, River count, Coast sides
6. Live minimap preview (updates as you change settings, debounced)
7. **Start Building** button

## Controls

| Action | Mouse / Trackpad | Keyboard |
|---|---|---|
| Pan | Right/middle drag, two-finger drag, screen edge | WASD / arrows |
| Zoom | Wheel / pinch (anchored at cursor); zoom-out stops once the screen fills with map | `+` / `-` |
| Use tool | Left click / drag | — |
| Cancel tool / drag | Right click | `Esc` |
| Road / Zone R/C/I / Clear (removes zones too) | — | `R` / `1` `2` `3` / `B` |
| Inspect | — | `Q` |
| Pause / speed | Top-bar buttons | `Space` / `[` `]` |
| Inspect building | Click (Select tool) | `Esc` closes |
| Build | — | `E` |
| Mute | Speaker button | `M` |
| Day/night cycle on/off | — | `L` |
| Jump to a place | Click/drag the minimap | — |
| Rotate view | Top-bar ⟲ ⟳ (compass shows north) | `,` / `.` |
| Debug overlay | — | `F3` |

## Feedback Rules

- **Ghost preview** for every placement tool, tinted teal when valid and red when invalid.
- **Cost label** follows the cursor while dragging and turns red if it's unaffordable.
- **Hover highlight** is always visible over the tile under the cursor.
- **Never block the world:** errors show as short toasts or as cursor labels, never modals.

## Landing Page and Accounts

- Visitors who aren't signed in see the **landing page** first: a live-painted city diorama, a headline, and three ways in: *Create a free account*, *Play as guest*, *Log in* (plus *Tour a finished city*, the demo). If the save server is offline, only *Start playing* shows. Choosing guest is remembered on the device; logging out brings the landing page back.
- The **account dialog** has Log in / Sign up tabs, inline field checks after leaving a field, a show/hide toggle and Caps Lock warning on passwords, a strength meter and a confirm-password field on sign up, and a countdown when the server asks us to wait (429).
- Signed in, the top-right shows the account avatar; its menu shows the email, that cities are saved to the account, and Log out (which saves first).

## Layers and Overlays (D-098)

- **One slot for menus and sheets.** The clock, stage, alerts and account menus, the budget, and the phone More sheet share one `overlayAtom` (`src/app/overlay/overlay.ts`): opening one closes whichever was open, so two never stack. `useDismiss` closes a menu on a press outside it or on Escape; Escape is caught before the game sees it, so the first Escape closes the menu and the next one reaches the game (cancel tool, close inspect).
- **Contextual panels** follow the game, not the slot: the inspect panel (Select tool) and the pickers (Civic, Roads). On phones a modal sheet (budget, More) puts a dimmed layer over them; tapping it closes the sheet and never reaches the map.
- **Layer scale** (`tokens.css`, `--z-*`): hud < sheet < popover < toast < guide < modal < screen. Nothing invents its own number.
- **Toasts** stack at most three, fade on their own (milestones stay longer), and a tap dismisses one early. Ones worth keeping wait in the alerts inbox (the bell) until resolved or dismissed.

## Loading a City (D-099)

- Between choosing a city and seeing it, a full-screen loading screen (survey-paper grid, a block of towers rising as an indeterminate indicator) lists the real steps and ticks them off as `Game.create` reports them: *Fetching your saved city* (saved cities), *Shaping the terrain* / *Reading your saved city*, *Founding the city*, *Starting the graphics*, *Painting buildings, trees and traffic*, *Laying out the map*, *Entering the city*. No percentage: the steps take very different times on different machines, so a number would be made up.
- Each step is painted before its (synchronous) work starts: `Game.create` waits one frame between steps (`game/loading.ts`, with a short timeout for background tabs). This adds about a frame per step, not a fixed delay.
- The HUD only appears once the city is ready; the loading screen fades out over the first frames of the map. No black screen with floating controls.
- If a step fails, the screen says which one (the graphics step gets the WebGL advice), shows the error, and offers **Try again** and **Your cities**.

## Phones and Tablets (D-078, D-097)

- **Upright phones and tablets** (width ≤ 900 px, taller than 520 px), D-097. The city fills the screen:
  - a **slim top bar**: menu (☰), funds (short form, opens the budget), population, demand bars, pause and a speed button that steps 1×→2×→3×, and the alerts bell. A dot on ☰ means citizens are complaining.
  - the **More sheet** (☰) holds the rest: city name, date and clock, save status, jobs, happiness, AQI, stage, what each zone's demand means and why, the next stage's checklist, map views (happiness, air, traffic, minimap), day/night, rotate, sound, the tour, your cities, and the account.
  - a **thumb dock** of five: Select, Clear, Civic, Zones, Roads. Zones opens a row of the five zone types above it, which stays open while zoning. 56 px tall buttons.
  - **bottom sheets**: pickers and the inspect panel rise from the dock and scroll inside; the budget and More sheets are modal with a dimmed map behind. On tablets (641–900 px) the dock and sheets keep a comfortable width.
  - the **minimap** starts hidden on phones (on tablets, shown) and is toggled in the More sheet; the choice is remembered. "Citizens say" starts folded on phones.
  - the touch Build/Cancel bar sits under the top bar; toasts just below it.
- **Landscape tablets** (901–1100 px wide): the same slim top bar (centred) and sheets, with the wide toolbar at the left and the minimap.
- **Landscape phones** (height ≤ 520 px), D-078: the same slim top bar (centred, 40 px), More and budget sheets; the compact toolbar bottom-left (scrolling sideways, with a fade on the narrowest phones), a smaller minimap bottom-right, side panels between the top bar and the bottom row.
- **Both phone layouts**: pickers show only picture, name and price in rows that scroll sideways; panels are nearly opaque instead of blurred (a backdrop blur over a canvas that redraws every frame is expensive on phone GPUs). Everything respects the notch and home-indicator safe areas.
- **Touch:** one finger builds with the active tool, or pans when no tool takes the drag; a tap inspects. Two fingers pinch to zoom and drag to pan, and cancel a half-done build drag. Edge scrolling is mouse-only. A short touch hint replaces the keyboard list and fades after a few seconds.
- **Start screen and dialogs** scroll on small screens instead of clipping, and keep clear of the account buttons.
- Review sizes with the dev pages: `/src/dev/device.html?w=390&h=844&src=/` (any size, for portrait phones below headless Chrome's 500 px minimum) and `/src/dev/press.html?keys=KeyE` (the demo city with hotkeys pressed, to see pickers).


## Onboarding Tour (D-081)

- **What it is.** A first-play tour (`src/app/tour/`): welcome → look around → pick Roads → draw a road → pick Homes → paint a zone → power and water → demand bars → speed → goodbye. Action steps wait for the player to actually do it (tool picked; world changed and money spent with that tool; power and water supply above zero), show a tick, then move on. Every step can be skipped; the × ends the tour.
- **When it shows.** By itself on a new city until finished or skipped; on an opened city only to carry on a tour left midway; never on the demo. The **?** button in the top bar replays it.
- **Where progress lives.** The step id and a done flag (`{ step, done }`), saved on every step: on the device for everyone (`citybuilder.tour`), and in the account for signed-in players (`/api/tour`, table `tour_progress`). Ids, not positions, so steps can be reordered. A guest who signs up has their progress copied into the account.
- **Desktop.** The card sits above or below the control it means, with an arrow and a pulsing ring around the control; steps about the map sit top centre. Mouse wording (right-drag, wheel, Shift, keys).
- **Phones** (`max-height: 520px` or width ≤ 640 px). The card docks (on the right on landscape phones, under the top bar on upright ones), clear of the toolbar, pickers and minimap; the − button folds it into a pill showing the step. On upright phones the "pick Homes" step points at Zones until its row is open. Touch wording (drag then tap Build, pinch, two fingers). The ring still marks the control, and a sideways-scrolling toolbar scrolls it into view. Bigger tap targets on coarse pointers.

## Guest Trial (D-082, D-083)

- **The server keeps the clock.** While a guest plays with the tab visible, the client sends `POST /api/guest/heartbeat` every 30 s. The server credits the time since the last beat (up to 60 s; a gap over 90 s is a break) and answers `ok`, `nudge` or `gate`. The client never reports its own time.
- **Who a guest is.** A random id in an httpOnly cookie (`cb_guest`, 400 days), copied to `citybuilder.guestId` so either can restore the other. A keyed fingerprint (HMAC of the network (IPv4, or IPv6 /64) + device class + OS + browser) means a "new" guest on the same device and network within 30 days carries on the used time. Raw addresses and User-Agents are never stored; guests unseen for 90 days are deleted.
- **After 10 minutes** (`GUEST_NUDGE_MINUTES`): a reminder in the auth dialog's style, top right ("Only in this browser… Save my city / Later"). Closing it is remembered on the device.
- **After 30 minutes** (`GUEST_LIMIT_MINUTES`): play pauses (Space and speed keys too) behind a two-part card: the player's city on survey paper (name, residents, treasury, minutes, a "Not backed up" stamp) and the way in (Create free account, Continue with GitHub when enabled, Log in). Signing in lifts it and moves the city into the account. On narrow screens the city shrinks to a strip on top; landscape phones keep both halves side by side, tighter.
- **Offline.** If beats fail for 5 minutes of visible play, the same card says "Reconnecting…" with Try again, so blocking the API doesn't skip the trial. It lifts on the next good beat.
- **Development.** Off unless `VITE_GUEST_TRIAL=on`, so working without Postgres isn't interrupted. Always on in production builds.
- **Limits of this.** The game runs in the browser, so someone who edits the client code can remove the card. The trial is meant to stop clearing cookies, private windows and blocking requests, not a determined hacker.
