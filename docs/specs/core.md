# Spec: Core City (Phase 7): Time, Density, Services, Utilities, Budget

Status: **Implemented.** Goal: the essential city-building loop, kept simple to understand.

## 1. Time & Speed

- **Pacing:** 1 in-game day = **6 s** at 1× (was 2 s). A month is 30 days, so 3 minutes.
- **Speeds:** Pause, **1×, 2×, 3×** (true multipliers; the fastest used to be 4×).
- **Time of day:** one clock day = **4 minutes** at 1×.
- **Day/night control** (clock button in the top bar, or `L` to step through):
  - **Cycle:** day and night follow the clock.
  - **Always day.**
  - **Always night.**

  The choice persists. Rush hours always follow the clock.

## 2. Density: Houses vs Apartments, Shops vs Offices

Five zone tools, keys `1`–`5`:

| Tool | Zone | Grows | Colour |
|---|---|---|---|
| Homes | R low | cottage, family house → townhouses | light green |
| Apartments | R high | walk-up → apartment block / condo tower (2×2) | dark green |
| Shops | C low | corner shop, café → supermarket (2×2) | light blue |
| Offices | C high | small office → hotel / office tower (2×2) | dark blue |
| Industry | I | workshop → warehouse → factory | yellow |

- **Data:** `World.zone` adds `ResidentialHigh = 4` and `CommercialHigh = 5`. The catalog gives every zoned building a `density`.
- **Growth:**
  - A new lot starts at the lowest level that density has in 1×1, so high density goes straight to walk-ups and small offices.
  - Upgrades stay within the density.
  - R demand drives both residential densities, and C demand both commercial ones.

## 3. Utilities: Power & Water (no pipes or lines)

- **Delivery:** a **Power Plant** (2×2, 4,000 power) and a **Water Tower** (1×1, 2,500 water) supply every building connected to them **through the road network**: the same road "island" as their entrance.
- **Demand:** each building needs power and water equal to its capacity (residents or jobs). Parks need none.
- **Allocation:** on each island, demand is filled in building order until capacity runs out. Buildings left over are **unpowered** or **dry**.
- **Effect:** a building without power or water has no residents or workers. It shows a ⚡ or 💧 badge, and its info panel says what's missing.
- **Hint:** the first time homes lack power or water, a toast says what to build.

## 4. Services: Police, Fire, Clinic, School

| Building | Size | Cost | Upkeep/mo | Covers |
|---|---|---|---|---|
| Police Station | 1×1 | $750 | $60 | radius 14 |
| Fire Station | 1×1 | $750 | $60 | radius 14 |
| Clinic | 1×1 | $900 | $80 | radius 12 |
| School | 2×2 | $1,500 | $80 | radius 14 |

- **Coverage:** a service works only with road access. It covers tiles within its radius of the footprint centre (a circle).
- **Coverage score:** each building counts the services covering it (0–4).
  - **Occupancy:** homes and jobs fill to `target × (0.7 + 0.075 × score)`, so 70% with no services and 100% with all four.
  - **Levelling up:** level 2 needs a score of 1 or more. Level 3 (towers, big offices, factories) needs all 4.
- **Fires:** once the city has 200 residents, a finished building outside fire coverage has a small daily chance (0.03%) of burning down. The lot is cleared but the zone stays, so it regrows. A toast names the building and suggests a fire station.
- **Placing a service:** shows its coverage area under the cursor.

## 5. Budget & Taxes

- **Tax rate:** 5–100%, default 9%.
  - Income = (residents × $3 + workers × $2) × rate ÷ 9%.
  - Taxes change household spending relative to disposable income at the base rate. The household-spending factor flows through commercial sales, commercial hiring, industrial production, employment and housing demand; there is no separate tax subtraction from every zoning bar.
- **Upkeep (monthly):** roads as before, plus each civic building's `upkeep` (park $1, town hall $50, the services and utilities in the tables above).
- **Budget panel:** opened by clicking the funds in the top bar. It shows the tax slider, last month's income, expenses by group (roads, services, utilities, parks) and the net result.

## 6. Civic Panel

- **Tabs:** **Services** (police, fire, clinic, school), **Utilities** (power plant, water tower), **Parks & Civic** (park, town hall).
- **Cards:** each shows cost, upkeep, and coverage or capacity.
