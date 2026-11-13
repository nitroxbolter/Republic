# Spec: Buildings, Zoning & Growth

Status: **4a done** (catalog, art, Build tool), **4b done** (zoning and growth), 4c done (cars).

Try every building with plenty of money: `http://localhost:5173/?funds=100000`.

## Dynamic wealth and evolution

Residential and office buildings evolve through the existing daily growth pipeline. Each
definition may declare an audience tier (`everyday`, `comfortable`, or `luxury`) and an
investor value. Luxury homes, premium apartments, and landmark offices become eligible
when investor confidence reaches 72%; confidence is derived from occupied housing,
resident happiness, and job coverage. This keeps high-end development aspirational without
adding a second placement system.

The renderer gives each evolution tier a distinct procedural recipe, while each instance's
stable variant keeps its facade deterministic across reloads and rotations.

## Two Ways Buildings Appear

1. **Grown (zoned).** The player paints R/C/I zones and matching buildings appear and level up over time (Phase 4b).
2. **Placed.** The player puts a building down directly with the **Build** tool. In 4a every catalog building can be placed, so we can see and tune them all. Once growth exists, zoned types may become growth-only.

## Catalog (`src/sim/buildings/catalog.ts`)

All art is original and generated in code (`src/render/atlas/buildings/`), with several variants each (see specs/city-art.md).

### Residential

| Id | Name | Size | Level | Floors | Residents | Look |
|---|---|---|---|---|---|---|
| `cottage` | Cottage | 1×1 | 1 | 1 | 3 | small gable-roof house, chimney, picket garden |
| `family_house` | Family House | 1×1 | 1 | 2 | 5 | two storeys, hip roof, porch |
| `townhouses` | Townhouses | 1×1 | 2 | 3 | 12 | narrow row of 3, coloured doors, flat roof |
| `walkup` | Walk-up Apartments | 1×1 | 2 | 4 | 24 | brick, balconies, roof parapet |
| `apartment_block` | Apartment Block | 2×2 | 3 | 8 | 120 | balconies, rooftop water tank |
| `condo_tower` | Condo Tower | 2×2 | 3 | 15 | 260 | glass tower, terraces, rooftop crown |
| `villa` | Private Villa | 2×2 | 2 | 2 | 8 | landscaped garden, pool, garage |
| `luxury_apartments` | Luxury Apartments | 2×2 | 3 | 13 | 180 | premium terraces, pool and rooftop garden |

### Commercial

| Id | Name | Size | Level | Floors | Jobs | Look |
|---|---|---|---|---|---|---|
| `corner_shop` | Corner Shop | 1×1 | 1 | 2 | 6 | striped awning, shop sign |
| `cafe` | Café | 1×1 | 1 | 1 | 8 | awning, outdoor tables |
| `small_office` | Small Office | 1×1 | 2 | 5 | 40 | glass window bands |
| `supermarket` | Supermarket | 2×2 | 2 | 1 | 60 | wide low box, big sign, parking lot |
| `hotel` | Hotel | 2×2 | 3 | 11 | 90 | tower, rooftop HOTEL sign, entrance canopy |
| `office_tower` | Office Tower | 2×2 | 3 | 18 | 400 | glass curtain wall, lit crown |

### Industrial

| Id | Name | Size | Level | Floors | Jobs | Look |
|---|---|---|---|---|---|---|
| `workshop` | Workshop | 1×1 | 1 | 1 | 10 | garage door, sawtooth roof |
| `warehouse` | Warehouse | 2×2 | 2 | 2 | 40 | big box, loading docks, crates |
| `factory` | Factory | 2×2 | 3 | 3 | 120 | sawtooth roof, smokestack |

### Civic

| Id | Name | Size | Look |
|---|---|---|---|
| `park` | Park | 1×1 | lawn, trees, path, bench, fountain |
| `town_hall` | Town Hall | 2×2 | columns, pediment, clock dome, plaza |

More civic buildings (police, fire, school, hospital, power, water) come with services in Phases 7–8.

### Landmarks (D-096)

Placeable showpieces in **Parks & Places**. They count as parks for happiness, employ people, and the luxury ones lift investor confidence.

| Id | Name | Size | Unlocks | Look |
|---|---|---|---|---|
| `observation_wheel` | Observation Wheel | 3×3 | City | giant wheel of glass pods, A-frame legs, LED rim, glass boarding hall |
| `theme_park` | Theme Park | 4×4 | City | fairy-tale castle, looping coaster, carousel, drop tower, small wheel, lagoon, entrance arch |
| `sail_hotel` | Sail Hotel | 3×3 | City | sail-shaped tower on a lagoon island, V exoskeleton and mast, helipad |
| `sky_tower` | Sky Tower | 3×3 | Metropolis | supertall on a three-winged plan, setbacks spiralling up to a needle spire |

## Placement Rules (`planPlace` / `applyPlace` in `sim/commands.ts`)

- The footprint must be fully on the map and on land (no water or rock), with no road and no other building.
- Trees and decorations in the footprint are cleared automatically at their clearing cost.
- Cost = building cost + clearing.
- The cursor sits on the footprint's centre tile (for 2×2, the tile above-left of centre).
- The **Clear** tool removes the whole building if any of its tiles is selected (free for now).

## Data

- `World.building[i]` holds the building instance id covering tile `i` (−1 if none).
- `World.buildings: Map<id, { id, def, x, y }>`, where `(x, y)` is the footprint's top (north) tile.

## Rendering

- A building is **one sprite**, in a frame tall enough for its floors and roof.
- It's drawn in the chunk that owns its **front tile** `(x + w − 1, y + h − 1)` and sorted with trees by that tile's diagonal, so buildings and trees overlap correctly.
- Painter (`buildings/index.ts`) reads recipes from `buildings/recipes/<category>/<id>.ts`, one file per building. Each recipe building is a stack of lit iso boxes (warm SW face, cool shaded SE face; D-072). Parks, the town hall and utilities have their own painters (`civic/`).
- Modern forms (D-096) use the modern kit in `atlas/modern/`: lofted solids from plan shapes (`loft.ts`, `plans.ts`) that taper, twist, curve and lean, lit facet by facet (`facets.ts`); skins for curtain glass, bands and fabric (`skins.ts`); spires, slabs and light rings (`parts.ts`); glass vaults, observation wheels and coaster track. Landmarks live in `atlas/landmarks/` and the modern zoned towers (office tower, condo tower, hotel) in `atlas/towers/`, one module each.
- Each zoned building has 6 variants that change form, not only colour. See [city-art.md](city-art.md) for massing, facades, roofs, rooftop and lot details.

## Zoning (Phase 4b)

- **Tools:** Zone R (`1`), Zone C (`2`), Zone I (`3`). To remove a zone, use **Clear** (`B`); there's no Dezone tool (D-051). Drag a rectangle to apply, the same way Clear works. While a zone tool is active the zone layer is shown at full strength ("zone view"). The rest of the time it shows as a soft tint.
- **Data:** `World.zone[i]` holds a `ZoneType` (`sim/zones.ts`): 0 none, 1 R, 2 C, 3 I.
- **What can be zoned:** land that isn't rock and has no road. A tile can also be zoned if it holds a *grown* building of another zone. Rezoning it removes that building. Placed buildings and roads block zoning.
- **Cost:** $5 per tile (`BALANCE.zoneCost`). Tiles that already have this zone are free and left unchanged.
- **Interactions with other tools:**
  - Building a road over a zoned tile removes its zone.
  - Placing a building with the Build tool clears the zone under its footprint. Placed buildings never grow or level up.
  - Clear (bulldoze) removes everything on the tile, including the zone.

## Zoning Feedback (UX)

- **The Build tool is now "Civic"** (it only places parks and the town hall, D-042). Its panel says where houses come from and has one-click **Zone homes / Shops / Industry** buttons.
- **While dragging a zone,** tiles that no road reaches (more than 3 tiles from a road) preview in **amber**, and the cost label adds "N tiles need a road nearby".
- **After zoning,** a toast says how many tiles won't grow. Those lots stay **grey** until a road comes within reach, then turn their zone colour. Building or clearing a road refreshes lots up to 3 tiles away.
- **Vacant-lot diagnosis:** the demand tips and More sheet count empty lots by their current reason: road beyond 3 tiles, no demand for that density, insufficient construction materials, no eligible building type, or waiting for the daily construction limit. Clicking an empty zoned tile with Select shows its own reason and a concrete next step. The reason refreshes as the city changes; construction sites are no longer called empty lots.

## Growth (Phase 4b, `sim/growth.ts`, once per day)

1. **Construction:** every site under construction counts down 1 day. The sequence is foundation, then scaffold, then the finished building, which pops in. A site takes **4 days** (`BALANCE.constructionDays`). Buildings under construction have no residents or jobs.
2. **Demand** (−1 … 1 per zone, shown as R/C/I bars in the top bar). It's worked out from the capacity of finished buildings:
   - jobs wanted: commercial = housing × 0.6 × 0.3 + 6, industrial = housing × 0.6 × 0.7 + 20;
   - housing wanted = all jobs ÷ 0.6 × 1.15 + 40;
   - demand = (wanted − built) ÷ max(wanted, floor).

   So homes need jobs to keep growing, and jobs follow homes. A new town gets about 40 homes' worth of R, plus a shop and a workshop, before the cycle takes over.
3. **New lots:** for each zone with demand > 0, up to ⌈demand × 2⌉ empty zoned tiles start a level-1 1×1 building of that zone. Tiles are picked at random from those with road access. Trees and rocks on the lot are cleared for free.
4. **Level up:** a grown, finished building that has been at least **80% occupied for 20 days** can upgrade when its zone has demand and the city is big enough (level 2 from 150 residents, level 3 from 1,000). At most ⌈demand × 1⌉ upgrade per zone per day. An upgrade rebuilds the lot as a construction site, keeping its occupants for when it finishes.
   - **In place:** a 1×1 becomes a 1×1 of the next level, or a 2×2 becomes a 2×2 of the next level.
   - **Merge:** a 2×2 square of the same zone, holding only empty lots and finished grown 1×1 buildings no higher than this one's level, becomes a 2×2 of the next level.
   - Level paths:
     - R: cottage/family house → townhouses/walk-up → apartment block/condo tower (merge).
     - C: corner shop/café → small office, or supermarket (merge) → hotel/office tower (merge or in place).
     - I: workshop → warehouse (merge) → factory (in place).
   - `chooseBuilding(zone, level, size, rng)` picks from the catalog.
5. Growth uses a seeded RNG, so the same actions on the same map grow the same town.

Pacing (a 48×48 test town with 720 zoned tiles, at 1×): about one new lot per second at first, level 2 within the first month (1 real minute), level 3 by month 3. Growth levels off once the land is used up, about 9,000 residents by month 7. All the numbers live in `BALANCE` (`src/shared/balance.ts`).

## Road Access (changed in 4b)

A building has access if a land road is within **3 tiles** of its footprint (`BALANCE.roadAccessRange`). Nearer roads win; at the same distance, the front edge is checked first. Before 4b a road had to touch the footprint. The range lets zones three tiles deep develop.
