import { BALANCE } from '../../shared/balance';
import { BUILDINGS } from '../buildings/catalog';
import type { City } from '../City';
import type { World } from '../World';
import type { IncidentEvent } from './incidents';
import { isWorking } from './utilities';

/** Cohorts are aggregate counts, so cities with many residents remain cheap to simulate. */
export function demographics(population: number) {
  const children = Math.round(population * 0.2);
  const youth = Math.round(population * 0.15);
  const seniors = Math.round(population * 0.13);
  return { children, youth, adults: Math.max(0, population - children - youth - seniors), seniors };
}

export function residentCount(world: World): number {
  let total = 0;
  for (const b of world.buildings.values())
    if (BUILDINGS[b.def].category === 'residential' && b.construction === 0 && !b.abandoned) total += b.occupants;
  return total;
}

export function workingAge(population: number, sick = 0, prisoners = 0): number {
  const ages = demographics(population);
  return Math.max(0, Math.round(ages.adults * 0.9 + ages.youth * 0.45) - Math.round(sick * 0.5) - prisoners);
}

export function societyReport(city: City) {
  const population = residentCount(city.world);
  const ages = demographics(population);
  let cells = 0;
  for (const b of city.world.buildings.values()) if (b.def === 'police_station' && isWorking(b)) cells += BALANCE.policeCells;
  const prisoners = Math.min(city.society.prisoners, population);
  return {
    ...ages,
    sick: Math.min(city.society.sick, population),
    prisoners,
    prisonCapacity: cells,
    prisonOverflow: city.society.prisonOverflow,
    deaths: city.society.deaths,
    pensionPerSenior: city.pensionPerSenior,
  };
}

/** Incidents add patients and detainees. Care, release and mortality change them each day. */
export function societyDay(city: City, events: readonly IncidentEvent[], random: () => number) {
  const state = city.society;
  const report = societyReport(city);
  if (city.day % BALANCE.daysPerMonth === 0) state.recentDeaths = 0;
  for (const event of events) {
    if (event.type === 'started' && (event.kind === 'illness' || event.kind === 'injury')) {
      state.sick += Math.max(1, Math.round(event.building.occupants * 0.03));
    } else if (event.type === 'resolved' && (event.kind === 'illness' || event.kind === 'injury')) {
      state.sick = Math.max(0, state.sick - Math.max(1, Math.round(event.building.occupants * 0.03)));
    } else if (event.type === 'resolved' && event.kind === 'theft') {
      if (state.prisoners < report.prisonCapacity) state.prisoners++;
      else state.prisonOverflow++;
    } else if (event.type === 'missed' && event.kind === 'theft') {
      state.prisonOverflow++;
    }
  }
  state.sick = Math.min(report.adults + report.youth + report.seniors + report.children, state.sick);
  state.prisoners = Math.min(report.prisonCapacity, state.prisoners);
  // A fraction of detainees finish their sentences each month; unresolved cases fade slowly.
  if (city.day % BALANCE.daysPerMonth === 0) {
    state.prisoners = Math.max(0, state.prisoners - Math.max(1, Math.round(state.prisoners * 0.25)));
    state.prisonOverflow = Math.max(0, Math.round(state.prisonOverflow * 0.75));
  }
  // The saved simulation stream makes the daily mortality draw repeatable across reloads.
  const cared = [...city.world.buildings.values()].some((b) => (b.def === 'clinic' || b.def === 'hospital') && isWorking(b));
  const expectedDeaths = state.sick * (cared ? 0.001 : 0.004);
  let deaths = Math.min(state.sick, Math.floor(expectedDeaths) + (state.sick > 0 && random() < expectedDeaths % 1 ? 1 : 0));
  state.sick -= deaths;
  state.deaths += deaths;
  state.recentDeaths += deaths;
  if (!cared) state.untreatedDeaths += deaths;
  for (const home of city.world.buildings.values()) {
    if (deaths <= 0) break;
    if (BUILDINGS[home.def].category !== 'residential' || home.occupants <= 0) continue;
    const lost = Math.min(home.occupants, deaths);
    home.occupants -= lost;
    deaths -= lost;
  }
}
