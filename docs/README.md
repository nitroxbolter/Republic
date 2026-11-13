# Project Docs — Start Here

This folder is the single source of truth for the project. Before starting any
work session, read **Current Status** below, then the relevant spec.

## Current Status

| | |
|---|---|
| **Current phase** | City evolution (specs/evolution.md): E0 stages ✅, E1 lifestyle ✅, E2 garbage ✅ |
| **Next phase** | E3 incidents (fire, theft, illness working together), then AQI, Town Hall tax collection, industry materials; server-run cities after (D-085) |
| **Last updated** | 2026-11-12 |

## Run It

```bash
bun install
docker compose up -d   # Postgres for the save server (accounts and cloud saves)
bun run dev          # http://localhost:5173 opens the New Game screen; /demo opens a grown city
                  # (?seed=N&size=64|128|256&preset=coastal&funds=N skips it)
                  # bun run dev runs Vite and the save server (:8787); without Postgres the game still runs, saving on the device
bun run sim:run --scenario demo --years 1   # headless sim: history CSV + per-system timings
bun run bench        # the same on /demo with the budget report
bun run test         # unit tests (server tests use in-process PGlite: no Docker needed)
bun run typecheck && bun run lint
# Windows: execute Compilar.bat para reconstruir e substituir Iniciar.exe
```

## Index

| Doc | What it covers |
|---|---|
| [01-vision.md](01-vision.md) | What we're building, design pillars, scope boundaries |
| [02-architecture.md](02-architecture.md) | Tech stack, folder layout, data model, rendering & performance strategy |
| [03-roadmap.md](03-roadmap.md) | All phases with task checklists — **the progress tracker** |
| [04-ui-ux.md](04-ui-ux.md) | Visual language, HUD layout, controls, "feel" rules |
| [05-master-plan.md](05-master-plan.md) | Plan for every system after saving: people, land value, transport, services, economy, government, Phases 11–22 |
| [specs/terrain.md](specs/terrain.md) | Terrain types, generator, new-game terrain picker |
| [specs/roads.md](specs/roads.md) | Road tool, auto-tiling, bulldozing, costs |
| [specs/buildings.md](specs/buildings.md) | Building catalog, footprints, placement; zoning and growth (planned) |
| [specs/simulation.md](specs/simulation.md) | Time, population, jobs, budget, traffic and pedestrians |
| [specs/elevation.md](specs/elevation.md) | Heights, sloped rendering, terraforming, borderlands |
| [specs/core.md](specs/core.md) | Time, density, services, utilities, budget (Phase 7) |
| [specs/demo.md](specs/demo.md) | The `/demo` showcase city |
| [specs/traffic.md](specs/traffic.md) | Commute model, visible traffic, lights, traffic view |
| [specs/needs.md](specs/needs.md) | Citizen needs, happiness, complaints, abandonment |
| [specs/saving.md](specs/saving.md) | Save format, accounts, save server, autosave |
| [specs/analytics.md](specs/analytics.md) | Anonymous usage events: visits, cities started, sources |
| [05-master-plan.md](05-master-plan.md) | The plan for Phases 11–22: people, land value, transport, economy, government, disasters |
| [specs/engine.md](specs/engine.md) | Phase 11: harness, timings, determinism, time-slicing, fields, road graph, Worker |
| [specs/energy.md](specs/energy.md) | Power plants, day/night demand, batteries, the tick clock |
| [specs/transport.md](specs/transport.md) | Road hierarchy, wide roads, flyovers, bridges, public transport, parks |
| [specs/evolution.md](specs/evolution.md) | City stages and unlocks, lifestyle tiers, hospital, university, garbage |
| [deploy.md](deploy.md) | Docker image, environment settings, production checklist |
| [decisions.md](decisions.md) | Decision log (why we chose X over Y) |
| [progress-log.md](progress-log.md) | Dated log of what got done each session |

## Working Agreement

1. **Docs first.** A feature gets a spec (or a spec update) before code.
2. **One phase at a time.** We finish and verify a phase before starting the next.
3. **Tick the boxes.** When a task lands, check it off in `03-roadmap.md` and add a line to `progress-log.md`.
4. **Record decisions.** Any non-obvious choice goes in `decisions.md` with the reason.
5. **Performance is a feature.** 60 FPS on a 128×128 map is a requirement in every phase, not a later polish step.
