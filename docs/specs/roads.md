# Spec: Roads, Highways & Clearing

Status: **Phase 3 implemented** (roads, highways, bridges, clearing, build effects and sound).

## Tools

| Tool | Key | What it does |
|---|---|---|
| Select | `Q` | Inspect and pan (left-drag pans) |
| Clear | `B` | Drag a rectangle: removes trees, rocks/decorations and roads |
| Road | `R` | Drag to build a street |
| Highway | `H` | Drag to build a highway |

- Pressing a tool's key again, `Esc` or right-click with no drag returns to Select. Right-click or `Esc` during a drag cancels only the drag.
- With a tool active, **left-drag uses the tool** and **right/middle-drag pans**.
- A ghost preview follows the cursor before and during a drag. A **cost label** next to the cursor shows the price and tile count. It turns red when you can't afford it and flips sides near screen edges.
- If you can't afford it, nothing changes and a toast appears ("Not enough money…").

## Road Path

- The drag makes an **L-shaped path**: first along the dominant tile axis, then the other. Hold `Shift` for a straight line along the dominant axis.
- Any land except rock is valid; water is crossed by bridges (below). **Each tile is judged on its own:** rock, buildings and the map edge turn only their own tiles red, and the rest of the drag still builds (user request, 2026-11-01). A water crossing that can't be bridged (bent, too long, landing on rock, or crossing a bridge sideways) is red as a whole, so no bridge is left dangling.
- Trees and rocks on the path are **cleared automatically**, and their clearing cost is added to the price. (D-022. The Clear tool is for bulk clearing.)
- Existing roads of the same type are free and kept. A road never downgrades a highway. A highway upgrades a road.

## Bridges

- Roads and highways cross water as **bridges**, built automatically when a path crosses water. There's no separate tool.
- Rules (`sim/commands.ts` `bridgeRunValid`):
  - the bridge must **start and end on land**; a path that ends in water stops at the shore;
  - it must be **straight** (no bend over water), which `Shift` makes easy;
  - the span is at most **12 tiles** (`BALANCE.maxBridgeSpan`);
  - a road can't cross an existing bridge sideways.
- **Bridges connect only at their two ends** (`World.bridge` stores the axis). A road on the bank beside a span doesn't branch into it.
- Art (`roadArt.ts` `paintBridge`), built up back to front:
  1. a soft shadow on the water;
  2. a pair of concrete piers per span tile, with faint ripple rings at the waterline;
  3. a girder (deck thickness) with a light lip;
  4. the deck, using the same markings as the road so it meets the shore road flush;
  5. parapet walls with a lit top;
  6. a lamp post on the far parapet.
  
  The deck stays at ground level; height comes from everything hanging below it. Bridge frames are taller (`BRIDGE_HEADROOM` above for lamps, `BRIDGE_DROP` below for girder, piers and shadow).
- Clearing a bridge tile removes it, and the water shows again.

## Build Effects & Sound

- **Pop:** a white additive flash with a small scale overshoot ripples along newly built pieces in path order. The ripple is capped at 0.5 s, however long the road.
- **Particles** (`render/fx/Effects.ts`, pooled, capped at 1,500): dust on roads, a splash on bridges, leaves and wood chips from trees, grey grit from rocks.
- **Sound** (`game/audio.ts`): synthesised with Web Audio, no files:
  - a build thunk with rising ticks along the ripple;
  - a metallic ping for bridges;
  - a crunch for clearing;
  - a buzz for "not enough money";
  - a click on tool switch.
- `M` or the speaker button in the top bar mutes. The setting persists in localStorage.

## Clearing

- A drag rectangle selects tiles. Tiles with something on them show orange; empty ones show faint white.
- It clears trees, decorations and roads. Flowers and tall grass are free; trees and rocks cost (see below). Removing roads is free (no refund yet).

## Auto-Tiling

4-bit connection mask from the 4 neighbours (`sim/roads.ts` `roadMask`):

```
bit 0 NE (x, y−1)   bit 1 SE (x+1, y)   bit 2 SW (x, y+1)   bit 3 NW (x−1, y)
```

Roads and highways connect to each other. All 16 masks per type are painted procedurally (`render/atlas/roadArt.ts`), in tile space mapped onto the iso diamond.

| Piece | Street | Highway |
|---|---|---|
| Body | carriageway (half-width 0.26), kerb, paved footpath out to the tile edge | barriers, two lanes each way, jersey median |
| Markings | dashed yellow centre line | white edge lines, dashed lanes, yellow lines either side of the median |
| Junctions (3–4 arms) | zebra crossings on the footpath line, stop lines | markings stop at the junction box |
| Furniture (objects layer) | street trees, lamps, corner lamps | lamps, sign gantries, foot overbridges every 8 tiles |

See [city-art.md](city-art.md) for the cross-sections and furniture rules.

Dash positions line up across tile edges. The ghost preview auto-tiles as if the plan were already built.

## Costs (`src/shared/balance.ts`)

| Item | Cost |
|---|---|
| Starting funds | $40,000 |
| Road construction | $200 / tile |
| Avenue / boulevard construction | $350 / $500 per tile |
| Ramp / highway / expressway construction | $400 / $650 / $800 per tile |
| Pedestrian street construction | $200 / tile |
| Bridge construction (road / avenue / boulevard / ramp / highway / expressway) | $250 / $450 / $600 / $500 / $700 / $800 per water tile |
| Monthly road upkeep (road / avenue / boulevard / ramp / highway / expressway) | $100 / $400 / $800 / $300 / $1,200 / $2,000 per tile |
| Monthly pedestrian street upkeep | $100 / tile |
| Clear tree | $3 per tree (a tile holds 1–3) |
| Clear rocks / boulder | $6 / $15 |
| Clearing flowers / tall grass / roads | free (removed roads have no refund) |

## Code Map

- `sim/roads.ts`: road types, mask, L-path, rectangle selection
- `sim/commands.ts`: `planRoad`/`applyRoad`, `planClear`/`applyClear` (pure plan, then apply; D-014)
- `sim/City.ts`: funds
- `game/tools.ts`: tool ids, hotkeys, plan for the current drag, and ghost sprites
- `render/overlays/ToolPreview.ts`: pooled ghost sprites
- `ChunkRenderer.refresh()`: rebuilds only the roads and objects of touched chunks (+1 tile for neighbour masks)
- Tests: `tests/roads.test.ts`

## Later

- Tunnels; raised bridge decks with ramps (needs elevation, Phase 6)
- Highway on-ramps; avenues and one-way streets; rail
- Bulldoze refunds, undo/redo (commands make this straightforward)
