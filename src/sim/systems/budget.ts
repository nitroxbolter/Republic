import { BALANCE } from '../../shared/balance';
import { BUILDINGS, upkeepOf, type BuildingDef, type BuildingId, type BuildingInstance, type ServiceKind } from '../buildings/catalog';
import { isWorking } from './utilities';
import type { City } from '../City';
import { BridgeAxis, RoadType } from '../roads';
import { roadSpec } from '../roadTypes';
import type { World } from '../World';
import { cityStats } from './population';
import { demographics } from './society';
import { defaultCostTaxRates, livingCosts, type CostTaxRates } from './livingCosts';
import { economyReport } from './economy';
import type { DayOutcome, SimSystem } from '../core/System';

/** Monthly company and resident taxes, utility bills and recycling against upkeep and pensions. */

export interface BudgetReport {
  income: number;
  expenses: number;
  net: number;
  /** Company tax rate (percent) used for this report. */
  taxRate: number;
  breakdown: { roads: number; services: number; utilities: number; parks: number; pensions: number };
  /** Part of the income from materials recycling centres sold (docs/specs/evolution.md). */
  recycling: number;
  taxRevenue: number;
  businessTaxRevenue: number;
  residentTaxRevenue: number;
  businessTurnover: number;
  utilityRevenue: number;
  workers: number;
  seniors: number;
}

const SERVICE_UPKEEP_SHARE: Readonly<Partial<Record<ServiceKind, number>>> = {
  police: 0.25,
  fire: 0.25,
  health: 0.5,
  education: 0.5,
  hospital: 1,
  university: 0.75,
};

const RECREATION_BUILDINGS: ReadonlySet<BuildingId> = new Set([
  'park',
  'central_park',
  'botanical_garden',
  'observation_wheel',
  'theme_park',
]);

interface ServiceProvider {
  building: BuildingInstance;
  x: number;
  y: number;
  radiusSquared: number;
}

/** A resident is assigned once per service kind, shared among working units in reach. */
function serviceResidentLoads(world: World): ReadonlyMap<number, number> {
  const providers = new Map<ServiceKind, ServiceProvider[]>();
  const homes: BuildingInstance[] = [];
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    if (d.category === 'residential' && b.construction === 0 && !b.abandoned && b.occupants > 0) homes.push(b);
    if (!d.service || !d.radius || !isWorking(b)) continue;
    const group = providers.get(d.service) ?? [];
    group.push({ building: b, x: b.x + d.size.w / 2, y: b.y + d.size.h / 2, radiusSquared: d.radius * d.radius });
    providers.set(d.service, group);
  }

  const loads = new Map<number, number>();
  for (const home of homes) {
    const d = BUILDINGS[home.def];
    const x = home.x + d.size.w / 2;
    const y = home.y + d.size.h / 2;
    for (const group of providers.values()) {
      const inReach = group.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= p.radiusSquared);
      if (inReach.length === 0) continue;
      const portion = home.occupants / inReach.length;
      for (const p of inReach) loads.set(p.building.id, (loads.get(p.building.id) ?? 0) + portion);
    }
  }
  return loads;
}

interface UpkeepContext {
  population: number;
  serviceResidents: ReadonlyMap<number, number>;
}

function upkeepContext(world: World): UpkeepContext {
  return { population: cityStats(world).population, serviceResidents: serviceResidentLoads(world) };
}

/** Monthly operating cost: each building's fixed base plus its share per 1,000 residents served. */
export function monthlyUpkeep(world: World, building: BuildingInstance, context?: UpkeepContext): number {
  const d: BuildingDef = BUILDINGS[building.def];
  const base = upkeepOf(building.def);
  if (base <= 0) return 0;
  const current = context ?? upkeepContext(world);
  const servedResidents = d.service ? (current.serviceResidents.get(building.id) ?? 0) : current.population;
  const share = d.service ? (SERVICE_UPKEEP_SHARE[d.service] ?? 0.5) : RECREATION_BUILDINGS.has(building.def) ? 0.1 : 1;
  return Math.round(base * (1 + (servedResidents / BALANCE.upkeepResidentsPerBase) * share));
}

/** Monthly government income from company turnover, household bill taxes and public utilities. */
export function monthlyBudget(
  world: World,
  taxRate: number = BALANCE.baseTaxRate,
  pensionPerSenior: number = BALANCE.defaultPensionPerSenior,
  minimumWage: number = BALANCE.defaultMinimumWage,
  costTaxRates: CostTaxRates = defaultCostTaxRates(),
): BudgetReport {
  const s = cityStats(world);
  let recycled = 0;
  let taxesPaid = 0;
  let utilityBillsPaid = 0;
  let residentsCounted = 0;
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    if (d.category === 'residential' && b.construction === 0 && !b.abandoned) {
      const seniors = demographics(residentsCounted + b.occupants).seniors - demographics(residentsCounted).seniors;
      const workers = b.occupants - seniors;
      residentsCounted += b.occupants;
      const supplied = { energy: b.powered, water: b.watered };
      const workerCosts = livingCosts(minimumWage * BALANCE.lifestyleWage[b.lifestyle], costTaxRates, supplied);
      const seniorCosts = livingCosts(pensionPerSenior, costTaxRates, supplied);
      taxesPaid += workers * workerCosts.taxesPaid + seniors * seniorCosts.taxesPaid;
      const householdUtilityPaid = workers * workerCosts.utilityPaid + seniors * seniorCosts.utilityPaid;
      utilityBillsPaid += householdUtilityPaid;
    }
    // Recycling centres count this month's tons in `filled` (sim/systems/garbage.ts).
    if (d.garbage?.recycles) recycled += b.filled * d.garbage.recycles;
  }
  const recycling = Math.round(recycled * BALANCE.recyclePrice);
  const ages = demographics(s.population);
  const residentTaxRevenue = Math.round(taxesPaid);
  const businessTurnover = economyReport(world, taxRate, { minimumWage, pensionPerSenior, costTaxRates }).businessTurnover;
  const businessTaxRevenue = Math.round(businessTurnover * taxRate / 100);
  const taxRevenue = residentTaxRevenue + businessTaxRevenue;
  const utilityRevenue = Math.round(utilityBillsPaid);
  const income = taxRevenue + utilityRevenue + recycling;
  let roads = 0;
  for (let i = 0; i < world.road.length; i++) {
    const r = world.road[i];
    if (r === RoadType.None) continue;
    const spec = roadSpec(r);
    roads += world.bridge[i] !== BridgeAxis.None ? (spec?.bridgeUpkeep ?? BALANCE.bridgeUpkeep) : (spec?.upkeep ?? BALANCE.roadUpkeep);
  }
  // Rail track (E7b) is paid with the roads.
  for (let i = 0; i < world.rail.length; i++) if (world.rail[i] !== 0) roads += BALANCE.railUpkeep;
  let services = 0;
  let utilities = 0;
  let parks = 0;
  const context: UpkeepContext = { population: s.population, serviceResidents: serviceResidentLoads(world) };
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    const upkeep = monthlyUpkeep(world, b, context);
    if (d.group === 'services') services += upkeep;
    else if (d.group === 'utilities') utilities += upkeep;
    else parks += upkeep;
  }
  const pensions = ages.seniors * pensionPerSenior;
  const expenses = Math.round(roads + services + utilities + parks + pensions);
  return {
    income,
    expenses,
    net: income - expenses,
    taxRate,
    breakdown: { roads: Math.round(roads), services, utilities, parks, pensions },
    recycling,
    taxRevenue,
    businessTaxRevenue,
    residentTaxRevenue,
    businessTurnover,
    utilityRevenue,
    workers: ages.adults,
    seniors: ages.seniors,
  };
}

/** What happened to this month's taxes when they wait at the Town Hall (docs/specs/evolution.md, E5). */
export interface HeldTaxes {
  /** Waiting in the chest now. */
  waiting: number;
  /** Lost because the chest was full. */
  lost: number;
  /** The chest is past the warning line. */
  filling: boolean;
}

/** Apply a month's budget to the city: upkeep from the funds, taxes to the funds or the Town Hall's chest. */
export function collectBudget(city: City): BudgetReport & { held: HeldTaxes | null } {
  const r = monthlyBudget(city.world, city.taxRate, city.pensionPerSenior, city.minimumWage, city.costTaxRates);
  if (!city.collectsTaxes) {
    city.funds += r.net;
    return { ...r, held: null };
  }
  city.funds -= r.expenses;
  const cap = Math.max(0, r.income) * BALANCE.chestMonths;
  const total = city.uncollected + r.income;
  city.uncollected = Math.min(total, Math.max(cap, city.uncollected));
  return {
    ...r,
    held: { waiting: city.uncollected, lost: total - city.uncollected, filling: city.uncollected >= r.income * BALANCE.chestWarnMonths },
  };
}

/** The working Town Hall that taxes are collected at, if the city has one. */
export function townHall(world: World): BuildingInstance | null {
  for (const b of world.buildings.values()) if (b.def === 'town_hall' && isWorking(b)) return b;
  return null;
}

/** Collect the taxes waiting at the Town Hall. Returns the amount, or why it couldn't. */
export function collectTaxes(city: City): { ok: true; amount: number } | { ok: false; reason: 'nothing-waiting' | 'no-town-hall' | 'town-hall-off-road' } {
  if (city.uncollected <= 0) return { ok: false, reason: 'nothing-waiting' };
  if (!townHall(city.world)) {
    const any = [...city.world.buildings.values()].some((b) => b.def === 'town_hall' && b.construction === 0);
    return { ok: false, reason: any ? 'town-hall-off-road' : 'no-town-hall' };
  }
  const amount = Math.round(city.uncollected);
  city.funds += amount;
  city.uncollected = 0;
  return { ok: true, amount };
}

/** Collects the monthly budget and keeps the last report. */
export class BudgetSystem implements SimSystem {
  readonly name = 'budget';
  last: BudgetReport | null = null;
  /** This month's taxes held at the Town Hall (cities that collect by hand). */
  held: HeldTaxes | null = null;
  private readonly city: City;
  constructor(city: City) {
    this.city = city;
  }
  onMonth(out: DayOutcome) {
    const r = collectBudget(this.city);
    this.held = r.held;
    this.last = r;
    out.budget = r;
  }
  /** Next month at today's numbers. */
  forecast(): BudgetReport {
    return monthlyBudget(this.city.world, this.city.taxRate, this.city.pensionPerSenior, this.city.minimumWage, this.city.costTaxRates);
  }
}
