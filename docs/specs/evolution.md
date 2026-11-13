# Spec: City Evolution (stages, lifestyle, garbage, hospitals, universities, trains)

Status: **E0 stages, E1 lifestyle and E2 garbage implemented** (2026-11-04). Trauma centre,
research centre and trains are planned steps (below). Decisions: D-085, D-086.
User direction (2026-11-03): "as the city grows, people need to upgrade their lifestyle if the
city is good; they must demand universities, better health care; add trains."
Starts from master plan §5 (people), §10 (services) and §9 (rail). It is a small first step
toward them: one lifestyle number per home instead of full resident groups.

## Why

Today a city at year 10 asks for the same things as a city at year 1. Evolution makes growth
create **new, visible demands**: a good city lifts its residents' lifestyle, and better-off
residents expect more (a hospital, then a university). Meeting those expectations pays back in
household purchasing power and office demand. Neglecting them stalls the climb.

## E0: City stages (`sim/stages.ts`)

The city climbs stages as its population grows. A stage never goes back down, and each one
unlocks buildings and brings a new problem (D-086).

| Stage | Population | Unlocks | New problem |
|---|---|---|---|
| **Hamlet** | 0 | roads, zones, coal plant, wind turbine, water tower, substation, park, town hall, police, fire, clinic | power, water, first jobs |
| **Village** | 150 | school, **landfill**, riverside market, central park | **garbage** starts piling up |
| **Town** | 2,500 | **hospital**, **recycling centre**, gas plant, solar farm, battery bank, botanical garden, shopping complex | homes become *Comfortable* and want a hospital |
| **City** | 10,000 | **university**, **incinerator**, **trauma centre** | homes become *Prosperous* and want a university |
| **Metropolis** | 30,000 | research centre (automatic research, E7) | — |

- **Locking** is a `City` setting (`locked`): on for new player cities, off for `/demo`, tests,
  the harness and **cities saved before stages existed** (user call: existing players aren't
  disturbed). `applyPlace` refuses a locked building (`reason: 'locked'`).

### Stage gates (`sim/progression.ts`)

A locked city climbs **one stage at a time**, and only when it meets every requirement of the
next one: the population, and the basics of where it is now. Growth alone isn't progress.

| To reach | Needs (share of occupied homes) |
|---|---|
| Village | 150 residents; power and water 90% |
| Town | 2,500; power and water 90%; police, fire, clinic and school 75% each; garbage collected 90% |
| City | 10,000; all of the above; hospital 75% |
| Metropolis | 30,000; all of the above; university 75% |

The top bar shows the next stage's checklist with progress bars, so the player always knows
what to build next. Unlocked cities follow their population only.
- **The build picker** shows locked buildings greyed out with "Unlocks at Town (2,500 people)".
- **Top bar:** the stage name next to the population, with progress to the next stage in its tooltip.
- **Stage up:** a celebration toast with what's new ("Village! New: police, fire, clinic,
  school, landfill. Garbage now needs collecting.").
- Saved as `city.stage` (absent in older saves: it catches up from the population on the first day).

## E1: Lifestyle (`sim/systems/lifestyle.ts`, daily)

Every home has a **lifestyle tier**:

| Tier | Name | New expectation | Tax per resident |
|---|---|---|---|
| 0 | Basic | (the Phase 9 needs) | × 1.0 |
| 1 | Comfortable | **Hospital** within reach | × 1.5 |
| 2 | Prosperous | **University** within reach | × 2.2 |

### Moving up and down

- **Up one tier** after **30 days in a row** with happiness ≥ **0.7**, power and water, and:
  - to Comfortable: the city is at least a **Town** (2,500 people, when the hospital unlocks);
  - to Prosperous: the city is at least a **City** (10,000, when the university unlocks), and both
    a **hospital** and a **school** reach the home.
- (Moving up needs happiness ≥ **0.7**, the same line as level 3, so the two rules agree.)
- **Down one tier** after **30 days in a row** with happiness < **0.45**.
- Streaks reset when the condition breaks. Abandoned and unconnected homes keep their tier and
  stop counting. New homes start Basic. When an upgrade merges homes, the new building takes the
  lowest tier among them (people bring their lifestyle; nobody gets a free upgrade).
- The 0.7 → 0.45 gap stops a home flipping back and forth when its new expectation drops its
  happiness by one weight's worth.

### Needs by tier

Each tier has its own weights (each column sums to 1). Garbage adds 0.08 for every home from
the Village on (E2), and happiness is the weighted average **over the needs a building has**,
so adding a need shrinks the others' share to fit.

| Need | Basic | Comfortable | Prosperous |
|---|---|---|---|
| jobs | 0.20 | 0.18 | 0.16 |
| safety | 0.15 | 0.14 | 0.13 |
| commute | 0.13 | 0.12 | 0.11 |
| shopping | 0.12 | 0.11 | 0.10 |
| clean air | 0.12 | 0.11 | 0.10 |
| health (clinic) | 0.10 | 0.08 | 0.06 |
| education (school) | 0.10 | 0.08 | 0.06 |
| parks | 0.08 | 0.08 | 0.08 |
| **hospital** | — | 0.10 | 0.10 |
| **university** | — | — | 0.10 |

A hospital also counts as clinic coverage.

### Transit and research expectations (user request, 2026-11-04)

Two more expectations arrive when they make sense, weighed into happiness and asked for like
the hospital and university:

| Need | Who expects it | Met by | Weight | Request |
|---|---|---|---|---|
| **transit** | from the Town stage (when bus stations unlock): Comfortable and Prosperous homes, and apartments | a bus station within 10 tiles or a train station within 8 | 0.08 | "We need a bus or train station nearby" |
| **research** | from the Metropolis stage (when it unlocks): Prosperous homes, for their graduates | a research centre anywhere in the city | 0.06 | "Our graduates need a research centre to work in" |

On /demo (a City) this puts transit among the top requests (218 homes after 60 days) and city
happiness at 85%.

### Requests ("We'd love a university")

The Phase 9 rule only complains below 0.6 happiness, but people who are doing well ask for
things too. A home that isn't complaining **asks for an expectation it has** (hospital,
university, transit, research, in that order) when that need scores below 0.5. Requests go in the same "Citizens say…" panel and speech bubbles:

| Kind | Message |
|---|---|
| hospital | "Our families need a proper hospital" |
| university | "Our kids want to go to university" |

### New buildings (Civic → Services)

| Building | Size | Cost | Upkeep / month | Jobs | Reach | Notes |
|---|---|---|---|---|---|---|
| **Hospital** (Town) | 3×2 | $14,000 | $320 | 140 | 24 tiles | also counts as a clinic |
| **University** (City) | 3×3 | $22,000 | $420 | 160 | 32 tiles | campus with a quad and a clock tower |

Reach is a circle, like other services (core.md §4), until isochrones land (engine 11.5).

### What the university gives back

- **Graduates:** residents of Comfortable or Prosperous homes reached by a university, × 0.12.
- **Office demand** gains `graduates × 0.6` wanted office jobs. The demand tooltip says
  "Graduates want about N office jobs."

### Level 3 rule

Level 3 still needs police, fire, health and education. The new hospital and university
coverage bits are not part of the "all four services" check.

### Showing it

- **Info panel** (homes): lifestyle tier with a progress note ("Moving up: 12 / 30 days").
- **Top bar population tooltip / Budget panel:** residents by tier.
- **Toasts:** the first time any home reaches Comfortable or Prosperous ("Residents are
  moving up! Comfortable homes will want a hospital.").

### Saving

The building tuple gains optional trailing fields `lifestyle, lifeDays, garbage, filled` after
`stored, condition, repairDays`. `city` gains `stage` and `locked`. Older saves load as Basic,
with empty bins, unlocked (save version stays 1).

### Performance

One pass over the buildings per day (no searches), plus two more coverage bits. It costs well
under 0.5 ms a day on /demo.

## E2: Garbage (`sim/systems/garbage.ts`, daily, from Village)

- **Every active building makes garbage** each day: 0.02 per resident, 0.01 per shop or office
  worker, 0.03 per industrial worker (tons). It piles up on the building (`garbage`).
- **Collection:** each working garbage facility has a daily truck capacity and a reach (tiles,
  and the same road island as the building, like utilities). Each day it empties the buildings
  in reach, nearest first, until today's capacity runs out.

| Building | Stage | Size | Cost | Upkeep | Trucks / day | Reach | Notes |
|---|---|---|---|---|---|---|---|
| **Landfill** | Village | 3×3 | $3,000 | $60 | 120 t | 22 | fills up (60,000 t: about 18 months at full trucks); full landfills stop taking garbage; smells (pollution 0.5) |
| **Recycling centre** | Town | 2×2 | $9,000 | $200 | 150 t | 24 | never fills; 40% of what it takes back as income ($0.5/t) |
| **Incinerator** | City | 2×2 | $16,000 | $260 | 300 t | 28 | never fills; heavy smoke (pollution 0.8) |

- **Need "garbage"** (every zoned building, from Village): 1 with an empty bin, falling to 0 when
  the pile reaches 6 days of its output. A pile stops growing at 30 days of output. Weight 0.08 for homes, 0.1 for shops, offices and industry.
- Complaint: "Garbage is piling up on our street". The info panel shows a building's pile and,
  for facilities, the tons collected today and (landfills) how full it is.
- Budget: recycling income appears under income.
- Later: visible garbage bags at high zoom, garbage trucks sampled from collection, sickness.

## E3: Incidents (`sim/systems/incidents.ts`; D-097)

Fires, thefts and illness happen to buildings, and the fire, police and health services answer
them **over the roads**. Reach, road layout and traffic decide whether help arrives in time,
and a gap in one service shows up as another's load. It replaces the old fire roll, which
deleted uncovered buildings on the spot.

**Everything is sim state.** Incidents and responders live in `City.incidents`, advance on the
fixed tick (60 ticks a day) and roll on the saved fire stream, so a city plays the same on every
machine and on the server (D-085). The renderer only draws them.

### Hazard (daily roll, once the city has 200 residents)

Each finished, occupied zoned building rolls once a day. Chance = base × size × modifiers:

| Incident | Base | Raised by | Lowered by |
|---|---|---|---|
| **Fire** | 0.0004 | industry ×2, abandoned ×3, level 3 ×1.3 | fire coverage ×0.35 |
| **Theft** (homes, shops) | 0.0005 | unemployment (×1 + 2 × jobless share), shops ×1.5, Prosperous ×1.3 | police coverage ×0.35 |
| **Illness** (homes) | 0.0004 | bad air (×1 + (AQI − 50) / 100 over 50), uncollected garbage ×1.5 | clinic coverage ×0.5 |

Size is √(capacity ÷ 10), clamped to 0.6–3, so a tower has more going on than a cottage. At
most 6 of each kind are active at once, so a big city never floods.

### Response

When an incident starts, the city sends a vehicle from the responder with the **fastest road
route** to the building's entrance:

| Responder | Answers | Vehicles | Notes |
|---|---|---|---|
| Fire Station | fires | 2 fire trucks | |
| Police Station | thefts | 2 patrol cars | |
| Clinic | illness | 1 ambulance | not injuries |
| Hospital | illness, injuries | 3 ambulances | |
| **Trauma Centre** (new, City stage) | illness, injuries | 6 ambulances, 1.5× faster | counts as a hospital |

- Travel time sums each road tile at emergency speed (2× a car, times the road type's speed),
  slowed by that tile's congestion, so **traffic delays help**. Only stations with a vehicle
  free and a route within 80 road tiles are asked; the 3 nearest are routed and the fastest goes.
- A vehicle drives out, works at the scene (fire 1 day, police and ambulance a third of a day)
  and drives back; only then is it free again. An incident with no free vehicle waits and asks
  again every few ticks.

### Outcomes

| Incident | Help in time | Too late or never |
|---|---|---|
| **Fire** | Out after the truck has worked 1 day; the building stays | After 1.5 days unanswered it **spreads** to one touching building; after 3 days the building **burns down** (the lot is cleared, the zone regrows) |
| **Theft** | The police car arrives within 1 day: caught | **Robbed**: for 30 days its safety need is halved and it shows a theft marker |
| **Illness** | The ambulance arrives within 1.5 days: treated | **Untreated**: for 30 days its health need is halved |
| **Injury** (a fire in an occupied building, half the time) | A hospital or trauma-centre ambulance within 1.5 days | As untreated illness. Clinics can't take injuries, so a fire with no hospital nearby hurts people |

Robbed and untreated homes complain in their own words ("We were robbed and no police came",
"Nobody came when we were sick") when that need is their worst.

### On the map and in the HUD

- **Burning buildings:** flickering flames over the footprint and a column of dark smoke,
  growing as the fire goes on; dust and a toast if it burns down.
- **Markers:** a theft marker over a building being robbed or recently robbed, and a red cross
  over a patient waiting for an ambulance (the badges above buildings).
- **Vehicles:** fire trucks, patrol cars and ambulances with flashing light bars, driving their
  route out and back; on flyover decks they ride raised like other cars.
- **Alerts:** fires that no truck can reach; buildings robbed or patients missed (at most one
  of each kind a month). Successes stay quiet.
- **Info panel:** a building shows its incident and the vehicle on its way; a responder shows
  its vehicles out and this month's calls answered in time and too late.

**Saved** as `city.incidents` (absent: none). Vehicles out aren't saved: after a load, active
incidents ask for help again. Robbed and untreated days are saved on the building.

**Cost:** one roll per building a day, and at most 3 route searches per new incident (a few a
day): well under 1 ms a day.

## E4: Air quality (`sim/systems/air.ts`)

The air is a coarse field: one cell per 4×4 tiles (32×32 on a 128 map), recomputed every day
and after edits from today's sources, with no memory, so saves need nothing new.

**Sources** (emission per day, on each footprint tile):

| Source | Emission |
|---|---|
| Workshop / warehouse / factory | 0.25 / 0.35 / 0.7, × (0.4 + 0.6 × how full it is) |
| Coal plant / gas plant / incinerator | 2.4 / 1.2 / 2.0 |
| Landfill | 0.5 (dust and smell) |
| Road traffic | 0.05 per 1,000 commuters a day on the tile |

Wind, solar, batteries, homes, shops, offices and parks emit nothing.

**Spread:** emissions are summed per cell, then blurred twice with a 3×3 box (smoke drifts
about 2 cells, 8 tiles, so a source's own block stays dirtiest), on top of a clean background.

Calibrated on test layouts and /demo: a full block of six factories reads 103; a coal plant's
own block 84, the next 61, two away 38; /demo's residents average 63 (Moderate), its
16-plant coal district 457 (Hazardous).

**AQI** (the familiar 0–500 scale): `AQI = 15 + 260 × concentration`, capped at 500.

| AQI | Label | Colour |
|---|---|---|
| 0–50 | Good | green |
| 51–100 | Moderate | yellow |
| 101–150 | Unhealthy for some | orange |
| 151–200 | Unhealthy | red |
| 201–300 | Very unhealthy | purple |
| 301+ | Hazardous | maroon |

**Effects:** the clean-air need now reads the AQI where the building stands: 1 up to AQI 50,
falling to 0 at AQI 200, minus highway noise as before. It replaces the old 6-tile radius
check. Bad air also makes illness more likely (E3).

**Showing it:**
- **Top bar:** the city AQI (residents' average) with its label and colour; click it, or press
  `O`, for the AQI view.
- **AQI view:** every land tile tinted by its cell's AQI; buildings fade as in the other views.
- **Info panel:** each building's AQI.
- Complaint text for the air need: "The air is making us sick" when AQI is over 150,
  otherwise "Too much smoke and noise".

**Cost:** a few hundred sources and two blur passes over 1,024 cells: about 0.07 ms a day.

## E5: Taxes at the Town Hall

In new player cities (`City.collectsTaxes`, set with `locked`; saved cities and /demo keep
automatic taxes, so nobody is disturbed), taxes no longer land in the funds by themselves:

- **At month end** upkeep is paid from the funds as before, but the month's taxes (and
  recycling sales) go into the **Town Hall's chest** (`City.uncollected`).
- **Collect** with the button on the Town Hall's info panel or in the budget panel. The funds
  jump, with a coin sound.
- **No Town Hall, no collecting:** the money waits, and the budget panel says to build one
  (it's unlocked from the start).
- **The chest holds 6 months of taxes.** Above that the extra is lost, and the month-end toast
  warns from 3 months on ("Your Town Hall is filling up: collect $X").
- A gold coin badge bobs over the Town Hall while there is money to collect.
- Saved as `city.uncollected` and `city.collectsTaxes` (absent: 0 and automatic).

## E6: Construction materials (`sim/systems/materials.ts`)

In new player cities (`City.needsMaterials`, with `locked`; saved cities and /demo build
freely), every zoned building that grows or upgrades needs **materials**: tons equal to 1% of
its price (a cottage 1.2 t, an apartment block 24 t, an office tower 65 t). The city keeps one
stock (`City.materials`).

- **Industry makes them:** 0.15 t a day per industrial worker (a full workshop 1.5 t, warehouse
  6 t, factory 18 t).
- **Imports fill gaps, at a price:** when the stock can't cover today's construction, up to
  6 t a day is bought in at $25 a ton. A new town without industry still grows, slowly and at
  a cost; industry makes it fast and free.
- **Storage:** 300 t, plus 400 t for each warehouse. Anything over is exported at $6 a ton.
- **Construction waits** when there's not enough: new lots and upgrades only start when their
  materials are in stock (an upgrade checks *before* it clears the old buildings).
- **Showing it:** the budget panel's Materials line (stock / storage, made, imported, used and
  exported today); the R/C/O demand tooltip notes when growth is waiting for materials; a
  toast at most once a month: "Construction is waiting for materials: zone industry".
- Saved as `city.materials` and `city.needsMaterials` (absent: 0 and building freely). New
  cities start with 60 t in the yard.
- Checked on a fresh town over 120 days: with an industrial zone it grows exactly as fast as one
  that builds freely (its yard fills to 300 t); without industry it imports a little (34 t) and
  never stalls at that size. Materials bite in bigger cities short of industry.

## E7: Research (`sim/research.ts`)

User choices (D-090): the **Research Centre** unlocks at **Metropolis** (30,000), and research
runs **automatically** through a fixed order; there is nothing to pick.

- **Research Centre** (Civic → Services, 2×2, $30,000, $500/month, 80 jobs).
- **Points per day:** each working Research Centre 3 (×1.5 when a university reaches it), each
  working University 1. Points carry over between projects.
- **The order** (each finished project is permanent, with a milestone toast):

| # | Project | Points | Effect |
|---|---|---|---|
| 1 | Cleaner coal | 90 | coal and gas plants make 40% less smoke |
| 2 | Efficient garbage trucks | 120 | every garbage facility collects 30% more a day |
| 3 | Modern construction | 150 | buildings need 30% fewer materials |
| 4 | Wider care | 200 | clinics and hospitals reach 25% further |
| 5 | Green industry | 250 | industry makes 40% less smoke |
| 6 | Rapid transit | 300 | unlocks rail track and train stations (E7b) |

- **Showing it:** the stage menu shows the project under way with its progress and points a
  day, and the finished ones; the Research Centre's info panel shows the same.
- Saved as `city.research` (`points`, `done`: how many projects are finished).

## E7b: Trains (`sim/rail.ts`; user choice D-090: rail, stations and commuting)

**Unlock:** rail track and train stations need the Rapid transit project in cities that lock
by stage; unlocked cities (/demo, old saves) can build them any time.

**Track** (`World.rail`, one byte per tile, saved as a layer):
- The **Rail** tool (in the road picker, key `Z`) drags like a road: an L, or one axis with Shift.
  $60 a tile on land, $150 over water (straight spans only, at most 12 tiles, like bridges).
- Track joins track in all four directions (corners, junctions). Where it crosses a road at a
  right angle it becomes a **level crossing** (both stay); it can't run along a road tile.
- Clearing removes track like roads. Upkeep $0.8 a tile a month.

**Stations** (Civic → Services, 2×2, $8,000, $150/month, 20 jobs): placed with track within 1
tile of the footprint (the platform) and, like everything, a road within reach. Stations on the
same connected track form a **line network**.

**Commuting by train (in the commute model):**
- A home or job is **served** by the nearest station within 8 tiles of its entrance; walking
  costs 1.5 minutes a tile.
- Between two stations on the same track: 3 minutes waiting plus 0.3 minutes a tile of track
  (rail time from a breadth-first search over the track from each station, once per day).
- For each home group and job, the trip by train is walk + wait + ride + walk. When it's faster
  than the drive, that flow goes **by train**: it puts nothing on the roads (so less congestion
  and less smog, E4), and counts as riders at both stations. Job attraction uses the faster of
  the two times, so good rail draws commuters further.
- Reported: train riders a day (`commute.report.trainRiders`) and per station.

**Showing it:** track drawn as ballast, sleepers and two rails, autotiled like roads (straight,
corner, T, cross), and as a crossing with barriers over roads; stations as a platform canopy
building; **visible trains** (an engine and carriages) run back and forth between the stations
with the most riders, sampled like cars; the station's info panel shows riders a day; the
traffic view keeps showing roads only.

**Done when** a line between a suburb and downtown takes 15%+ of car commutes off the roads.
Built (2026-11-04): in the test layout (`tests/rail.test.ts`) the line carries 53% of commutes
(113 of 214) and the roads carry fewer cars than before it opened. /demo has a line across its
northern blocks with five stations: about 485 riders a day (3%, a compact downtown where driving
is usually quick) and six visible trains. With no stations the commute model's results are
byte-identical to before.

**Rebuilt (D-091):** track and roads never meet at grade: track crosses a road only at right
angles on a raised **overpass** (cars pass under, trains ride over). Track is **double**, each
direction on its own side. Stations form **lines** (longest station-to-station run, then
branches); each line runs 1–4 push-pull trains (one per 250 riders) that accelerate, brake to a
stop at every platform, wait 3 s, and change ends at a terminus once the other track is clear;
a train never closes within 3 tiles of the one ahead on its track. Track can be laid diagonally
(a 45° staircase drawn as one diagonal line) and single turns bend as arcs; trains follow the
drawn curves. Stations have generated names, face their track, and their info panel shows each
line as a strip of stops with riders.

## Bus stations (D-092)

A 3×3 **Bus Station** (Civic → Transport, Town stage, $12,000, $220/month) faces the street it's
built against: a driveway turns off the street through IN and OUT openings into three bays with
canopies and parked buses, in front of a glass terminal. Each station keeps a fleet of four
buses on the road: one leaves every 5 sim seconds while fewer are out, waits in its bay, runs a
round trip over the roads to a stop across town (stopping on the way) and comes back. Homes
within 10 tiles send 15% of their drives by bus, which takes those cars off the roads; the info
panel shows riders a day and buses out. /demo has one south-west of downtown.

## Planned steps (user requests, 2026-11-04)

Each gets its spec section before code.

- **E3 Incidents:** built, see "E3: Incidents" above.
- **E4 Air quality index (AQI):** built, see "E4: Air quality" below.
- **E5 Taxes collected at the Town Hall:** built, see "E5: Taxes at the Town Hall" below.
- **E6 Industry makes construction materials:** built, see "E6: Construction materials" below.
- **Shops and industry ahead of workers:** to decide: whether zones may grow beyond demand,
  with businesses that can't find workers complaining and, in time, abandoning.
- **E7 Research and trains:** research built, see "E7: Research" below; trains are E7b (below).
- **Power made understandable:** a short "how power works" explainer and a power view on the map.
- **Server-run cities (D-085):** the server ticks each open city with `src/sim`; the browser
  sends commands and renders state. Its own spec and phase.

## Trains (planned, its own step)

Rail is the first mode that ignores road traffic. It needs a rail tile layer, a rail tool,
stations and visible trains, so it gets its own spec section and session:

- **Rail track** tool (1 tile, $60/tile; bridges over water like roads, no junctions with roads
  except level crossings with barriers).
- **Train station** (3×2) on a track. Homes and jobs within 8 tiles of a station can commute by train.
- **Mode choice (first version):** a commute whose home and job both have a station on the same
  rail network takes the train when it's faster. Train time = walk to station + rail distance ÷ 4 + 3 min wait.
  Those trips leave the road volume.
- **Outside connection:** track reaching the map edge brings migrants (+ residential demand).
- Visible trains: 3–5 carriage sprites sampled from riders, on the agent renderer.

Done when a line between a suburb and downtown takes 15%+ of car commutes off the roads.
