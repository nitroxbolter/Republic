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

- **Company tax:** 0–100%, default 9%, levied on estimated commercial and industrial turnover. It never reduces a salary or pension directly. Higher rates lower business activity, employment and household purchasing power indirectly.
- **Resident taxes:** independent 0–100% rates on energy, water, housing and transport bills, initially 0%. Imported food costs $200 per month without tax. These bills and taxes are deducted from wages and pensions. Utility bills paid by supplied homes enter public revenue; utility maintenance remains a public expense.
- **Upkeep (monthly):** roads as before, plus each civic building's `upkeep` (park $1, town hall $50, the services and utilities in the tables above). Public services pay their fixed base per building. For the population-dependent portion, each occupied home is shared equally among working buildings of the same service whose coverage reaches it. Overlapping hospitals, police or fire stations therefore do not each charge for the same residents; a unit outside their reach gets no population load. Hospitals and trauma centres share the hospital load.
- **Budget panel:** opened by clicking the funds in the top bar. It shows the company tax, four resident tax sliders with their currency deductions, income policies, monthly expenses and separate company and resident tax totals.

## 6. Civic Panel

- **Tabs:** **Services** (police, fire, clinic, school), **Utilities** (power plant, water tower), **Parks & Civic** (park, town hall).
- **Cards:** each shows cost, upkeep, and coverage or capacity.
