# Transport (feature track D + E, rebuilt as one layer)

User direction (2026-11-01): fix the transport layer once and for all. Roads that grow from
lanes to 6- and 8-lane boulevards and expressways, overhead bridges and huge crossings, public
transport, varied pavements, and a good UI. Master plan §4.4, §8, §9 are the starting point;
this spec supersedes them where they differ (D-069).

## Principles

1. **One table describes every road type** (`sim/roadTypes.ts`). Lanes, capacity, speed, cost,
   upkeep, noise, sidewalks, frontage and art all come from it. No system checks
   `=== RoadType.Highway`. A new road type is a table entry plus its own art file.
2. **Roads evolve in place.** Dragging a bigger type over a road upgrades it, and you pay the
   difference. Small streets become avenues as the city grows, without bulldozing.
3. **Wide roads are 2 tiles wide.** A tile is about 64 px across: enough for 4 lanes, not 8.
   Boulevards (6 lanes) and expressways (8 lanes) are dual carriageways: two parallel one-way
   tiles with a median between them, laid by one drag.
4. **Grade separation is how big cities move.** Flyovers carry a road over another without a
   junction; interchanges are prefabs.
5. **Transit wins on merit.** People choose walk, bike, bus, tram, metro, train or car by
   generalised cost (time + waiting × 2 + walking × 1.5 + fare). Better transit means fewer
   cars, less congestion, less noise, and higher land value.
6. **Deterministic and fast.** Everything runs on the tick clock (D-068) and the road segment
   graph; visible vehicles stay a sample (D-059).

## Transport overhaul (user direction 2026-11-05: "only focus on transportation mechanics")

Goal: traffic that flows, grade-separated crossings, and a metro that takes people out of cars.

| Step | Content | Status |
|---|---|---|
| **TX1** | Multi-lane traffic: each car has a lane and queues only behind its lane; it takes the lane with the most room on each segment (buses and trucks keep right); a junction only holds a car back when the lane it would take beyond is full. Frontage: buildings take access from roads with a pavement, falling back to a highway or expressway only when nothing else is in reach. Bus stops never on highways. | **done** |
| **TX2** | Flyovers: with **At crossings → Flyover** in the road picker, a street, avenue or highway dragged straight across another road (any type) rides over it on a raised deck (`World.over`, `World.overAxis`, saved), +$400 a crossing. The two roads never meet: route graphs give a flyover tile two nodes (ground and deck, `sim/roads.ts`), each straight through only; no junction or lights; the deck keeps its own traffic (`deckVolume`). Cars on the deck ride raised above it; the ground road under it draws straight. /demo's central highways cross on one. Not yet: wide roads on decks, multi-tile ramps. | **done** |
| **TX3** | Metro: underground lines (tunnels with surface station entrances) and elevated lines (a viaduct on pillars over streets), metro stations with a wider walk-in reach than train stations, mode choice like trains, visible metro trains on the viaduct. | planned |
| TX4 | Adaptive lights and roundabouts; transit share rising with congestion. | planned |

## The road hierarchy

| Type | Width | Lanes | Capacity / day | Speed | Frontage | Cost / tile | Notes |
|---|---|---|---|---|---|---|---|
| Street | 1 | 2 | 500 | 1× | yes | $200 | footpaths, street trees, lamps (current road) |
| **Avenue** | 1 | 4 | 1,100 | 1.25× | yes | $350 | tree-lined median, wide footpaths, bus-friendly |
| **Boulevard** | 2 | 6 | 2,600 | 1.4× | yes | $500 | dual carriageway, planted median, tram-ready |
| Highway | 1 | 4 | 1,500 | 2.2× | no | $650 | barriers, no buildings fronting it (current) |
| **Expressway** | 2 | 8 | 4,000 | 2.6× | no | $800 | dual carriageway, central barrier, ramps |
| **Pedestrian street** | 1 | 0 | walkers | — | yes | $200 | paved plaza street: no cars; boosts walking, shops and land value |

Ramp: $400 per tile. Bridges use type-specific construction prices from $250 (street) to
$800 (expressway) per water tile. Monthly maintenance is charged per tile: $100 street,
$400 avenue, $800 boulevard, $300 ramp, $1,200 highway, $2,000 expressway, and $100
pedestrian street. Bridge upkeep (in the same road-type order) is $500, $800, $1,100,
$900, $1,600, $2,000 and $500 per tile per month. Dual carriageways are charged per tile
on both sides.

- **Pavement styles** (cosmetic, per road, chosen in the road tool): concrete footpath,
  brick paving, granite setts (old town), tree-lined promenade. Streets and avenues only.
- **Upgrade in place:** Street → Avenue → Boulevard; Highway → Expressway. Cost = difference.
  Downgrading is allowed with the bulldozer only.
- **Frontage:** buildings can take access from streets, avenues, boulevards and pedestrian
  streets, never from highways or expressways (today highways still give access; old saves keep it).

## Bridges, flyovers and tunnels

| Structure | Rule | Span |
|---|---|---|
| Beam bridge (current) | straight, land to land | ≤ 6 tiles |
| Truss bridge | streets, avenues | 7–12 tiles |
| **Cable-stayed bridge** | avenue, boulevard, highway | 13–20 tiles; a landmark |
| **Suspension bridge** | boulevard, expressway | 21–32 tiles; a landmark, raises land value nearby |
| **Flyover** | carries a road over another road or rail with no junction | ramps 2 tiles each side |
| **Interchanges** | prefabs: diamond, cloverleaf, trumpet | stamped as one command |
| **Tunnel** | under water or blocks; portals only on the surface | ≤ 16 tiles |

Height is drawn by the renderer (maps stay flat, D-051). A `level` layer (0 ground, 1 flyover)
lets two roads share a tile without connecting.

## Curved roads (user request 2026-11-04, D-089)

Roads stay on the tile grid underneath (zoning, lots, access, routing, utilities and saves are
unchanged); what changes is how they are **laid** and **drawn**, so a city no longer looks like
graph paper.

**Laying them (road tool):**
- **Straight** (today): an L or, with Shift, one axis.
- **Diagonal**: dragging at about 45° lays a staircase of tiles (one step across for each step
  along). Any angle between snaps to the nearest of straight or 45°.
- **Curve**: a third drag mode (toggle in the road picker, or hold `C`): drag start → bend point
  → end, and the tool lays a staircase along a smooth arc (radius 2–6 tiles) between them. The
  ghost preview shows the smooth shape, not the staircase.
- Wide roads (boulevard, expressway) curve too: both carriageways follow the same arc.

**Drawing them (renderer):**
- Runs of staircase tiles are recognised as one **diagonal strip** and drawn as a straight road
  at 45°: one textured quad along the run, with the footpaths, lane markings and kerbs of the
  road type. The staircase tiles under it show grass in the triangles the strip doesn't cover.
- Right-angle bends between two straight runs are drawn as a **rounded corner** whose radius
  depends on the road type (street 0.6 tile, avenue 1, boulevard 1.5). Arcs laid with the Curve
  mode are drawn as one smooth band through the tile centres.
- Junctions, bridges and ramps stay as today.

**Driving them:** cars, buses and pedestrians follow a smoothed centreline (a Catmull-Rom
spline through the tile centres of their path, sampled once per route) instead of turning at
each tile corner, at the same lane offsets.

**Lots:** buildings and zones stay square on the grid. Along a diagonal the triangles between
the strip and the lots are grass with a street tree now and then.

**Cost:** recognising strips is done per chunk when roads change (no per-frame work), and each
strip is one quad, so a diagonal draws fewer sprites than a staircase.

**Steps:** C1 diagonal strips (recognise and draw staircases as 45° roads; cars follow the
smoothed path) → C2 rounded corners → C3 the Curve drag mode and arcs for wide roads.

## Junctions

Chosen automatically by load and overridable by clicking: none, stop signs, traffic lights
(current, D-059), adaptive lights (green time follows queues), roundabout (3×3).

**Built (2026-11-04, D-088):**
- A junction is where three or more *car* roads meet. Pedestrian streets never count, and a road
  running alongside a wide road doesn't open its median unless it joins it and carries cars.
- **Give way** (the default): the smaller road's cars wait at the line while a car is crossing
  the junction; the bigger road goes on. Where equal roads meet, everyone gives way.
- **Traffic lights** go up when the junction's daily load reaches 35% of its biggest road's
  capacity, and come down below 25% (the band stops them flickering). Re-chosen daily.
- Still to do: stop-sign and lights art for give-way junctions, adaptive lights, roundabouts,
  and clicking a junction to override.

## Public transport

| Mode | Runs on | Stop | Capacity / vehicle | Speed | Unlock |
|---|---|---|---|---|---|
| Bus | streets and up (shares traffic; bus lanes on avenues) | bus stop (on a road tile) | 60 | road | Village |
| Tram | avenues and boulevards (own track) | tram stop | 180 | 1.2× road, ignores jams | Town |
| Metro | underground; stations are the only surface footprint | station 2×2 | 900 | 3×, ignores traffic | City |
| Train | rail tiles, crossing the map edge | station 3×2 | 1,200 | 4× | City |
| Ferry | water, between piers | pier | 150 | 1.5× | coastal maps |

- **Line tool:** click stops in order; loop or out-and-back; colour and number; vehicles per line set the frequency.
- **Depots:** each mode needs a depot reachable from its lines.
- **Line panel:** riders per day, crowding, income versus cost, a sparkline; **Transit view** shows lines and ridership.
- **Fares and policy:** fare per mode; "Free transit" policy later.
- **Mode choice** per commuter group, by generalised cost. Shares feed back into road volume.

## Visible traffic

Cars, buses, trams, trucks and service vehicles are sampled from the flows (D-059). Vehicles
use the lane offsets of their road type (from the table), and multi-lane roads keep slow
vehicles to the outer lanes.

## Build steps

| Step | Content | Done when |
|---|---|---|
| **T1** | Road type table + refactor of every system to it; **Avenue**; upgrade in place; road art in one file per type | an avenue carries more traffic than a street, faster, in the commute model and on screen |
| T2 | 2-tile dual carriageways: **Boulevard (6)** and **Expressway (8)**, ramps; pedestrian street; pavement styles | an 8-lane expressway carries 4,000 a day with no jams |
| T3 | Flyovers (`level` layer), interchange prefabs, truss, cable-stayed and suspension bridges, tunnels | a cloverleaf removes the traffic lights where two expressways meet |
| T4 | Road segment graph + Dijkstra + isochrones; junction control and adaptive lights | `commute.day` under 25 ms on /demo |
| T5 | Buses: stops, line tool, depots, line panel, mode choice (walk/bike/car/bus), transit view | a good bus line takes 15%+ of cars off a corridor |
| T6 | Trams, metro, rail and train stations, ferries; transfers | a metro line cuts average commute in a 30k city by 20%+ |
| T7 | Parks and leisure variety (see below) | — |

## Parks and leisure (T7, requested alongside)

Small (1×1): pocket park, playground, plaza. Medium (2×2): sports field, community garden,
skate park. Large: **Central Park** (3×3, lake and paths), **Water park** (3×2, pools and
slides), **Botanical garden** (3×3), **Wonderland** amusement park (4×4, rides, ferris wheel
and coaster), **Stadium** (4×4). Bigger parks reach further, add land value and happiness,
and the big ones draw visitors (trips over the transport network). Each park is its own art module.
