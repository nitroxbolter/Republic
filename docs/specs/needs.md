# Spec: Citizen Needs & Happiness (Phase 9)

Status: **Implemented** (2026-11-01). Step 3 of the plan (D-057). Residents react to the city and say what's wrong.

## Needs (`sim/systems/needs.ts`, after every change and daily)

Complaint summaries include the same live values used by the needs simulation. For example,
“Not enough customers” shows road-accessible residents and the business capacity, and its
Show me action opens the affected building's inspection panel. (`sim/systems/needs.ts`, after every change and daily)

Commercial customers are citywide when the business has road access: residents can drive to
far-away offices and shops. The customer score uses the city's active residents and is reduced
by the commute traffic score. Commercial buildings also carry a separate traffic need, so
congested roads produce “Traffic is making it hard to reach customers” rather than incorrectly
reporting that there are no customers. (`sim/systems/needs.ts`, after every change and daily)

Every finished, connected zoned building scores each need it has from 0 (bad) to 1 (fine).

| Need | Who | Score |
|---|---|---|
| Jobs | homes | the city's job cover (jobs ÷ workforce, at most 1), × 0 if no job is reachable by road |
| Shopping | homes | shop and office jobs within 12 tiles ÷ 20, at most 1 |
| Safety | everyone | police coverage 0.6 + fire coverage 0.4 |
| Health | homes | clinic coverage |
| Education | homes | school coverage |
| Commute | homes | 1 up to 15 min, falling to 0 at 60 min (from the traffic system); 0.5 while unknown |
| Clean air & quiet | homes, shops, offices | 1 − pollution. Pollution comes from industry and power plants within 6 tiles (weighted by size and distance) and highway tiles within 2 |
| Parks | homes | parks (and the town hall) within 6 tiles ÷ 2, at most 1 |
| Affordability | homes | household purchasing power relative to the 9% tax baseline |
| Workers | job buildings | the city's worker share (workers ÷ jobs, at most 1) |
| Customers | shops, offices | residents in the accessible city × traffic × household purchasing power, at most 1 |

**Happiness** is the weighted average of a building's needs:

- **Homes:** the listed needs are normalized by their total weights; purchasing power adds a 0.06 affordability weight.
- **Shops and offices:** workers 0.35, safety 0.25, customers 0.25, clean air 0.15.
- **Industry:** workers 0.6, safety 0.4.

**City happiness** is the resident-weighted average over homes, shown in the top bar.

## Effects

- **Occupancy:** homes and jobs fill to `target × (0.55 + 0.45 × happiness)`. This replaces Phase 7's "+7.5% per covering service" rule (D-053), since services now count through the needs.
- **Levelling up:** as before (road, power, water, services), and also happiness of at least **0.5** for level 2 and **0.7** for level 3.
- **Abandonment:**
  - A building below **0.3** happiness for **30 days in a row** is abandoned: it empties, provides no homes or jobs, and looks run-down (darkened, desaturated).
  - It recovers after **15 days** at **0.45** or above.
  - Abandoned buildings never upgrade. Clearing one frees the lot (the zone goes too, as with any Clear).
- **New buildings** start at neutral happiness (0.75) until the first needs pass.

## Complaints ("people shouting")

- **What triggers one:** a building below 0.6 happiness complains about its **worst need**, the one with the biggest weighted shortfall. Abandoned buildings complain "This place is abandoned".
- **Speech bubbles:** up to 12 on screen at a time, over complaining buildings in view, each showing an icon for the need. Each bubble lasts about 3 s, then moves to another complaining building, so the screen stays readable. They're hidden below 0.5× zoom.
- **"Citizens say…" panel** (top left, shown when there are complaints):
  - the top 4 complaints with how many buildings share them, e.g. "We need a school nearby (12)";
  - a **Show me** button on each that moves the camera to the unhappiest building with that complaint.

| Complaint | Message |
|---|---|
| jobs | "There are no jobs for us" |
| shopping | "Nowhere to shop around here" |
| safety | "We don't feel safe: build police and fire stations" |
| health | "We need a clinic nearby" |
| education | "We need a school nearby" |
| commute | "The commute is terrible" |
| clean air | "Too much smoke and noise" |
| parks | "No parks to enjoy" |
| affordability | "Taxes reduced our purchasing power" |
| workers | "We can't find workers" |
| customers | "Not enough customers" |

## Showing happiness

- **Happiness view** (`Y`, or the smiley button in the top bar): building footprints tinted green (happy) → yellow → red (unhappy), with abandoned buildings dark. Buildings fade, as in the traffic view, and only one data view is on at a time.
- **Info panel:** a happiness bar plus each need as a small labelled score.

## Result

- **/demo** (seed 42): **87–88% city happiness** and no abandonment. The top complaint is "We don't feel safe" (about 80 buildings), from the edge blocks outside police and fire reach. "Show me" jumps there.
- **The jam test town:** 69% happiness. Complaints are safety and "not enough customers" (shops stranded in the job district). Four shops are abandoned after a few months.
- **Tests:** `tests/needs.test.ts` covers a serviced home against an unserved one, happiness raising occupancy, and abandonment and recovery.
