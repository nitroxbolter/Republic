# Spec: Simulation — Time, Population, Jobs, Budget, Traffic

Status: **Implemented (first version).** Tuning numbers live in `src/shared/balance.ts` and `TRAFFIC` in `src/sim/traffic.ts`.

## Time

- Fixed-step sim at 10 ticks/s × speed. **1 day = 2 sim seconds**, **1 month = 30 days**.
- Speeds: **Pause / 1× / 2× / 3×** (the fastest step is a 4× multiplier). Controls: top-bar buttons, `Space` (pause/resume), `[` `]` (slower/faster).
- Cars and people move every frame, scaled by speed, so motion stays smooth at any speed.

## Road Access

- A building has access if a land road (bridges don't count) is within **3 tiles** of its footprint. The nearest one, front edges first, is its **entrance**: where its cars and people join the network.
- Without access, a building stays empty, shows a bobbing **orange road badge**, and its info panel says why.
- Rechecked after every build, clear or demolish.

## Population & Jobs (`sim/systems/population.ts`, once per day)

1. The available workforce is the adult population (87%, with the other 13% retired) less workers unavailable due to illness or imprisonment.
2. Homes can attract residents without jobs. Job coverage is one of the factors affecting occupancy.
3. Finished, connected buildings with the required utilities offer jobs according to their effective capacity. Hiring distributes up to the smaller of the available workforce and the offered jobs across those buildings. The distribution carries rounding remainders across buildings.
4. The top bar shows employed residents and total jobs. Unemployment is available workforce minus employed residents. Open positions are total jobs minus employed residents.

## Budget (monthly)

- The monthly close calculates actual receipts and operating costs. Cities with manual collection pay expenses from available funds and hold regular receipts in the Town Hall chest until collected.
- Construction material imports and exports change available funds daily. The report shows these flows separately from the closing debits and credits, and includes their monthly totals in the operating result for the period.

## Traffic (`sim/traffic.ts`)

- **Routing:** breadth-first search over connected road pieces (it uses `roadMask`, so bridges only connect at their ends). Routes are cached (up to 400 entries) and the cache is cleared when roads change. Agents whose path loses a road tile are removed.
- **Cars:**
  - Trips run between homes with residents and job or civic buildings, in either direction.
  - Spawn rate is about 1 trip per 140 residents per sim second, capped at **320** cars.
  - Mix: car, taxi, truck, and buses once the population is over 150.
  - Speed is 1.7 tiles/s, and 1.9× faster on highways.
  - **Right-hand traffic** with a 0.17-tile lane offset, easing from the old lane to the new one through turns.
- **People:** short strolls (3–8 tiles) along pavements near homes and shops, a 0.37-tile offset from the centre line, with a 2-frame walk cycle. Up to 1 person per 45 residents, capped at **180**.
- **Rendering** (`render/agents/AgentRenderer.ts`):
  - Pooled sprites; only on-screen agents are drawn.
  - Depth-sorted by x + y.
  - The layer sits under trees and buildings, so anything in front of a road correctly covers the cars behind it.
  - LOD: people are hidden below 0.6× zoom and all agents below 0.32×.
- **Art** (`render/atlas/agentArt.ts`): car, taxi (roof sign), bus and truck in 6 colours × 4 headings. Headlights or taillights show depending on which end faces the camera. Pedestrians come in 8 skin and shirt combinations.

## Rush Hours, Queuing & Buses (Phase 4c, second part)

- **Rush hours.** The time-of-day clock (one clock day = 90 sim seconds; docs/04-ui-ux.md) scales the car trip rate:
  - ×0.25 at night (00–05);
  - ramping to ×2 for the morning peak (07:30–09:00);
  - ×1 at midday;
  - ×2 for the evening peak (16:30–18:30);
  - easing to ×0.5 late evening.

  Morning trips go home → work 85% of the time and evening trips work → home. Pedestrians follow a softer curve (few at night).
- **Queuing.**
  - Cars keep a gap of 0.42 tiles (0.55 behind a bus or truck) to the car ahead in their lane, a lane being one direction of one road segment. That includes the last car in the lane they're about to enter.
  - **Junctions** (road tiles with 3–4 connections) have a box, entered halfway along the approach. Only one movement uses it at a time. The exception is straight-through traffic on the same axis, which shares it, so two opposing straight lanes flow together.
  - A car that has waited 4 s ignores the box (no gridlock). One that has waited 25 s gives up and leaves the map.
- **Bus stops.**
  - Placed automatically once the city has buses (150+ residents), on the road outside the biggest buildings (homes with 12+ residents, offices, shops, civic). The busiest go first, each at least 6 tiles from the next, up to 40 stops.
  - A stop is a small glass shelter on the pavement on the building's side. Stops are recomputed when buildings change.
  - Buses run between two stops at least 8 tiles apart. They pause 2 s at every stop they pass, and the cars behind them queue.

## Inspect

- With the **Select** tool, click a building to open its info panel:
  - name, category and level stars, description;
  - residents or workers with a fill bar;
  - road status, footprint, and a **Demolish** button.
- The building's footprint is outlined while the panel is open. `Esc` or × closes it.

## Performance Notes

- Boot (measured in a software-rendered headless browser): **atlas ≈ 200 ms, map ≈ 20 ms**. Shown in the debug overlay (`F3`), which is now hidden by default.
- Per frame:
  - agent update is O(agents) with a hard cap of about 500;
  - the route search runs only on a cache miss;
  - the daily simulation is O(buildings).
- Draw calls stay at about 4 per visible chunk.

## Later

- Commute timing (rush hours), car queuing at junctions, parking, buses with stops.
- Happiness, land value, services and pollution (Phases 7–9).
