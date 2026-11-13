import { BALANCE } from '../../shared/balance';
import { BUILDINGS, upkeepOf, type BuildingDef, type BuildingId, type BuildingInstance, type ServiceKind } from '../buildings/catalog';
import { isWorking } from './utilities';
import type { City } from '../City';
import { BridgeAxis, RoadType } from '../roads';
import { roadSpec } from '../roadTypes';
import type { World } from '../World';
import { cityStats } from './population';
import { demographics, workingAge } from './society';
import { BASE_COSTS, COST_KINDS, defaultCostTaxRates, livingCosts, type CostKind, type CostTaxRates } from './livingCosts';
import { economyReport } from './economy';
import type { DayOutcome, SimSystem } from '../core/System';

/** Monthly company and resident taxes, utility bills and recycling against upkeep and pensions. */

export interface BudgetReport {
  income: number;
  expenses: number;
  net: number;
  /** Company tax rate (percent) used for this report. */
  taxRate: number;
  incomeTaxRate: number;
  breakdown: { roads: number; transport: number; services: number; utilities: number; parks: number; pensions: number };
  /** Part of the income from materials recycling centres sold (docs/specs/evolution.md). */
  recycling: number;
  taxRevenue: number;
  businessTaxRevenue: number;
  residentTaxRevenue: number;
  incomeTaxRevenue: number;
  businessTurnover: number;
  /** Estimated company turnover after the company tax, before other business costs. */
  businessTurnoverAfterTax: number;
  utilityRevenue: number;
  costBalances: Readonly<Record<CostKind, CostBalance>>;
  /** All adults, including unemployed and temporarily unavailable residents. */
  workers: number;
  employed: number;
  unemployed: number;
  unavailable: number;
  seniors: number;
}

export interface CostBalance {
  residents: number;
  billPerResident: number;
  taxRate: number;
  nominalBase: number;
  nominalTax: number;
  baseRevenue: number;
  taxRevenue: number;
  revenue: number;
  upkeep: number;
  net: number;
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
  incomeTaxRate = 0,
  society?: City['society'],
): BudgetReport {
  const s = cityStats(world, taxRate, society, { minimumWage, pensionPerSenior, costTaxRates, incomeTaxRate });
  const ages = demographics(s.population);
  const availableWorkers = workingAge(s.population, society?.sick, society?.prisoners);
  const employed = Math.min(availableWorkers, s.workers);
  const unemployed = availableWorkers - employed;
  const unavailable = ages.adults - availableWorkers;
  const employedShare = ages.adults > 0 ? employed / ages.adults : 0;
  let recycled = 0;
  let incomeTaxesPaid = 0;
  const charged: Record<CostKind, { residents: number; base: number; tax: number }> = {
    energy: { residents: 0, base: 0, tax: 0 },
    water: { residents: 0, base: 0, tax: 0 },
    housing: { residents: 0, base: 0, tax: 0 },
    transport: { residents: 0, base: 0, tax: 0 },
  };
  let residentsCounted = 0;
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    if (d.category === 'residential' && b.construction === 0 && !b.abandoned) {
      const seniors = demographics(residentsCounted + b.occupants).seniors - demographics(residentsCounted).seniors;
      const adults = b.occupants - seniors;
      const paidWorkers = adults * employedShare;
      residentsCounted += b.occupants;
      const supplied = { energy: b.powered, water: b.watered };
      const grossWage = minimumWage * BALANCE.lifestyleWage[b.lifestyle];
      incomeTaxesPaid += paidWorkers * grossWage * incomeTaxRate / 100;
      const workerCosts = livingCosts(grossWage * (1 - incomeTaxRate / 100), costTaxRates, supplied);
      const seniorCosts = livingCosts(pensionPerSenior, costTaxRates, supplied);
      for (const kind of COST_KINDS) {
        if (kind === 'energy' && !supplied.energy || kind === 'water' && !supplied.water) continue;
        const row = charged[kind];
        row.residents += b.occupants;
        row.base += paidWorkers * workerCosts.charges[kind].base + seniors * seniorCosts.charges[kind].base;
        row.tax += paidWorkers * workerCosts.charges[kind].tax + seniors * seniorCosts.charges[kind].tax;
      }
    }
    // Recycling centres count this month's tons in `filled` (sim/systems/garbage.ts).
    if (d.garbage?.recycles) recycled += b.filled * d.garbage.recycles;
  }
  const recycling = Math.round(recycled * BALANCE.recyclePrice);
  const businessTurnover = economyReport(world, taxRate, { minimumWage, pensionPerSenior, costTaxRates, incomeTaxRate }).businessTurnover;
  const businessTaxRevenue = Math.round(businessTurnover * taxRate / 100);
  const businessTurnoverAfterTax = businessTurnover - businessTaxRevenue;
  let roads = 0;
  let transport = 0;
  for (let i = 0; i < world.road.length; i++) {
    const r = world.road[i];
    if (r === RoadType.None) continue;
    const spec = roadSpec(r);
    roads += world.bridge[i] !== BridgeAxis.None ? (spec?.bridgeUpkeep ?? BALANCE.bridgeUpkeep) : (spec?.upkeep ?? BALANCE.roadUpkeep);
  }
  // Rail track (E7b) belongs to public transport maintenance.
  for (let i = 0; i < world.rail.length; i++) if (world.rail[i] !== 0) transport += BALANCE.railUpkeep;
  let services = 0;
  let utilities = 0;
  let parks = 0;
  const categoryUpkeep: Record<CostKind, number> = { energy: 0, water: 0, housing: 0, transport };
  const context: UpkeepContext = { population: s.population, serviceResidents: serviceResidentLoads(world) };
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    const upkeep = monthlyUpkeep(world, b, context);
    if (d.group === 'services') services += upkeep;
    else if (d.group === 'utilities') {
      utilities += upkeep;
      if (d.supplies?.water) categoryUpkeep.water += upkeep;
      else if (d.energy || d.substation || d.supplies?.power) categoryUpkeep.energy += upkeep;
    }
    else if (d.group === 'transport') { transport += upkeep; categoryUpkeep.transport += upkeep; }
    else parks += upkeep;
  }
  const balanceFor = (kind: CostKind): CostBalance => {
    const row = charged[kind];
    const baseRevenue = Math.round(row.base);
    const taxRevenue = Math.round(row.tax);
    const revenue = baseRevenue + taxRevenue;
    const upkeep = categoryUpkeep[kind];
    return {
      residents: row.residents, billPerResident: BASE_COSTS[kind], taxRate: costTaxRates[kind],
      nominalBase: row.residents * BASE_COSTS[kind], nominalTax: row.residents * BASE_COSTS[kind] * costTaxRates[kind] / 100,
      baseRevenue, taxRevenue, revenue, upkeep, net: revenue - upkeep,
    };
  };
  const costBalances = { energy: balanceFor('energy'), water: balanceFor('water'), housing: balanceFor('housing'), transport: balanceFor('transport') };
  const incomeTaxRevenue = Math.round(incomeTaxesPaid);
  const residentTaxRevenue = incomeTaxRevenue + COST_KINDS.reduce((sum, kind) => sum + costBalances[kind].taxRevenue, 0);
  const taxRevenue = residentTaxRevenue + businessTaxRevenue;
  const utilityRevenue = costBalances.energy.baseRevenue + costBalances.water.baseRevenue;
  const income = taxRevenue + utilityRevenue + recycling;
  const pensions = ages.seniors * pensionPerSenior;
  const expenses = Math.round(roads + transport + services + utilities + parks + pensions);
  return {
    income,
    expenses,
    net: income - expenses,
    taxRate,
    incomeTaxRate,
    breakdown: { roads: Math.round(roads), transport, services, utilities, parks, pensions },
    recycling,
    taxRevenue,
    businessTaxRevenue,
    residentTaxRevenue,
    incomeTaxRevenue,
    businessTurnover,
    businessTurnoverAfterTax,
    utilityRevenue,
    costBalances,
    workers: ages.adults,
    employed,
    unemployed,
    unavailable,
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
  const r = monthlyBudget(city.world, city.taxRate, city.pensionPerSenior, city.minimumWage, city.costTaxRates, city.incomeTaxRate, city.society);
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
    return monthlyBudget(this.city.world, this.city.taxRate, this.city.pensionPerSenior, this.city.minimumWage, this.city.costTaxRates, this.city.incomeTaxRate, this.city.society);
  }
}
