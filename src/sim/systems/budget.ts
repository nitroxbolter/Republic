import { BALANCE } from '../../shared/balance';
import { BUILDINGS, Lifestyle, upkeepOf, type BuildingDef, type BuildingId, type BuildingInstance, type ServiceKind } from '../buildings/catalog';
import { isWorking } from './utilities';
import type { City } from '../City';
import { BridgeAxis, RoadType } from '../roads';
import { roadSpec } from '../roadTypes';
import type { World } from '../World';
import { cityStats } from './population';
import { demographics, workingAge } from './society';
import { BASE_COSTS, COST_KINDS, defaultCostTaxRates, livingCosts, type CostKind, type CostTaxRates } from './livingCosts';
import { economyReport } from './economy';
import { propertyBills, forecastPropertyFlows, settleProperties, type PropertyFlows, type PropertyPayment } from './realEstate';
import { demographicMonthlyCost } from './demography';
import type { DayOutcome, SimSystem } from '../core/System';

/** Monthly company and resident taxes, utility bills and recycling against upkeep and pensions. */

export interface BudgetReport {
  income: number;
  expenses: number;
  net: number;
  cashNet: number;
  /** Company tax rate (percent) used for this report. */
  taxRate: number;
  incomeTaxRate: number;
  breakdown: { roads: number; transport: number; services: number; utilities: number; parks: number; pensions: number; demographicIncentives: number; housingSubsidies: number };
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
  /** Occupant-weighted monthly housing charges by residential lifestyle tier. */
  housingByClass: Readonly<Record<Lifestyle, HousingClassBalance>>;
  /** All adults, including unemployed and temporarily unavailable residents. */
  workers: number;
  employed: number;
  unemployed: number;
  unavailable: number;
  seniors: number;
  propertyFlows: PropertyFlows;
  propertyPayments: ReadonlyMap<number, PropertyPayment>;
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

export interface HousingClassBalance {
  residents: number;
  rentPerResident: number;
  taxPerResident: number;
  paidPerResident: number;
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
  policyCity?: City,
): BudgetReport {
  const s = cityStats(world, taxRate, society, policyCity ?? { minimumWage, pensionPerSenior, costTaxRates, incomeTaxRate });
  const ages = demographics(s.population);
  const availableWorkers = workingAge(s.population, society?.sick, society?.prisoners);
  const employed = Math.min(availableWorkers, s.workers);
  const unemployed = availableWorkers - employed;
  const unavailable = ages.adults - availableWorkers;
  const employedShare = ages.adults > 0 ? employed / ages.adults : 0;
  let recycled = 0;
  let incomeTaxesPaid = 0;
  let housingSubsidies = 0;
  const charged: Record<CostKind, { residents: number; base: number; tax: number; nominal: number }> = {
    energy: { residents: 0, base: 0, tax: 0, nominal: 0 },
    water: { residents: 0, base: 0, tax: 0, nominal: 0 },
    housing: { residents: 0, base: 0, tax: 0, nominal: 0 },
    transport: { residents: 0, base: 0, tax: 0, nominal: 0 },
  };
  const housingClasses: Record<Lifestyle, { residents: number; rent: number; tax: number; paid: number }> = {
    [Lifestyle.Basic]: { residents: 0, rent: 0, tax: 0, paid: 0 },
    [Lifestyle.Comfortable]: { residents: 0, rent: 0, tax: 0, paid: 0 },
    [Lifestyle.Prosperous]: { residents: 0, rent: 0, tax: 0, paid: 0 },
  };
  const propertyPayments = new Map<number, PropertyPayment>();
  let residentsCounted = 0;
  for (const b of world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    if (d.category === 'residential' && b.construction === 0) {
      const bill = propertyBills(b, costTaxRates.housing);
      const occupants = b.abandoned ? 0 : b.occupants;
      const subsidy = occupants > 0 && !b.property?.publicOwned ? bill.rent * (policyCity?.demography.housingSubsidy ?? 0) : 0;
      housingSubsidies += subsidy;
      const perPerson = occupants > 0 ? { housing: (bill.rent - subsidy) / occupants, energy: bill.energy / occupants, water: bill.water / occupants, surcharge: bill.surcharge / occupants } : { housing: 0, energy: 0, water: 0, surcharge: 0 };
      const householdBills = { ...BASE_COSTS, ...perPerson };
      const seniors = demographics(residentsCounted + occupants).seniors - demographics(residentsCounted).seniors;
      const adults = occupants - seniors;
      const paidWorkers = adults * employedShare;
      residentsCounted += occupants;
      const supplied = { energy: b.powered, water: b.watered };
      const grossWage = minimumWage * BALANCE.lifestyleWage[b.lifestyle];
      incomeTaxesPaid += paidWorkers * grossWage * incomeTaxRate / 100;
      const rentPerPerson = occupants > 0 ? bill.rent / occupants : 0;
      const housingDue = (rentPerPerson - subsidy / Math.max(1, occupants)) * (1 + costTaxRates.housing / 100);
      const surchargeCapacity = paidWorkers * Math.max(0, grossWage * (1 - incomeTaxRate / 100) * BALANCE.propertyHousingIncomeLimit - housingDue)
        + seniors * Math.max(0, pensionPerSenior * BALANCE.propertyHousingIncomeLimit - housingDue);
      householdBills.surcharge = b.property?.loan ? Math.min(b.property.loan.payment, surchargeCapacity) / Math.max(1, occupants) : 0;
      const workerCosts = livingCosts(grossWage * (1 - incomeTaxRate / 100), costTaxRates, supplied, householdBills);
      const seniorCosts = livingCosts(pensionPerSenior, costTaxRates, supplied, householdBills);
      if (occupants > 0) {
        const housingClass = housingClasses[b.lifestyle];
        housingClass.residents += occupants;
        housingClass.rent += bill.rent - subsidy;
        housingClass.tax += (bill.rent - subsidy) * costTaxRates.housing / 100;
        housingClass.paid += paidWorkers * (workerCosts.housingPaid + workerCosts.charges.housing.tax)
          + seniors * (seniorCosts.housingPaid + seniorCosts.charges.housing.tax);
      }
      propertyPayments.set(b.id, { rent: paidWorkers * workerCosts.housingPaid + seniors * seniorCosts.housingPaid + subsidy, surcharge: paidWorkers * workerCosts.surchargePaid + seniors * seniorCosts.surchargePaid, operatingCost: bill.operatingCost });
      for (const kind of COST_KINDS) {
        if (kind === 'energy' && !supplied.energy || kind === 'water' && !supplied.water) continue;
        const row = charged[kind];
        row.residents += occupants;
        row.nominal += occupants * householdBills[kind];
        row.base += paidWorkers * workerCosts.charges[kind].base + seniors * seniorCosts.charges[kind].base;
        row.tax += paidWorkers * workerCosts.charges[kind].tax + seniors * seniorCosts.charges[kind].tax;
      }
    }
    // Recycling centres count this month's tons in `filled` (sim/systems/garbage.ts).
    if (d.garbage?.recycles) recycled += b.filled * d.garbage.recycles;
  }
  const recycling = Math.round(recycled * BALANCE.recyclePrice);
  const businessTurnover = economyReport(world, taxRate, policyCity ?? { minimumWage, pensionPerSenior, costTaxRates, incomeTaxRate }).businessTurnover;
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
      residents: row.residents, billPerResident: row.residents ? row.nominal / row.residents : BASE_COSTS[kind], taxRate: costTaxRates[kind],
      nominalBase: row.nominal, nominalTax: row.nominal * costTaxRates[kind] / 100,
      baseRevenue, taxRevenue, revenue, upkeep, net: revenue - upkeep,
    };
  };
  const costBalances = { energy: balanceFor('energy'), water: balanceFor('water'), housing: balanceFor('housing'), transport: balanceFor('transport') };
  const housingByClass = Object.fromEntries(Object.entries(housingClasses).map(([tier, row]) => [tier, {
    residents: row.residents,
    rentPerResident: row.residents ? row.rent / row.residents : 0,
    taxPerResident: row.residents ? row.tax / row.residents : 0,
    paidPerResident: row.residents ? row.paid / row.residents : 0,
  }])) as Record<Lifestyle, HousingClassBalance>;
  const incomeTaxRevenue = Math.round(incomeTaxesPaid);
  const residentTaxRevenue = incomeTaxRevenue + COST_KINDS.reduce((sum, kind) => sum + costBalances[kind].taxRevenue, 0);
  const taxRevenue = residentTaxRevenue + businessTaxRevenue;
  const utilityRevenue = costBalances.energy.baseRevenue + costBalances.water.baseRevenue;
  const forecastFlows = forecastPropertyFlows(world, propertyPayments);
  const income = taxRevenue + utilityRevenue + recycling + Math.round(forecastFlows.interest + forecastFlows.publicRent);
  const pensions = ages.seniors * pensionPerSenior;
  const demographicIncentives = policyCity ? demographicMonthlyCost(policyCity, true) : 0;
  const expenses = Math.round(roads + transport + services + utilities + parks + pensions + demographicIncentives + housingSubsidies + forecastFlows.publicOperating);
  return {
    income,
    expenses,
    net: income - expenses,
    cashNet: income - expenses + forecastFlows.principal,
    taxRate,
    incomeTaxRate,
    breakdown: { roads: Math.round(roads), transport, services, utilities, parks, pensions, demographicIncentives, housingSubsidies: Math.round(housingSubsidies) },
    recycling,
    taxRevenue,
    businessTaxRevenue,
    residentTaxRevenue,
    incomeTaxRevenue,
    businessTurnover,
    businessTurnoverAfterTax,
    utilityRevenue,
    costBalances,
    housingByClass,
    workers: ages.adults,
    employed,
    unemployed,
    unavailable,
    seniors: ages.seniors,
    propertyFlows: forecastFlows,
    propertyPayments,
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
  const r = monthlyBudget(city.world, city.taxRate, city.pensionPerSenior, city.minimumWage, city.costTaxRates, city.incomeTaxRate, city.society, city);
  const flows = settleProperties(city.world, Math.floor(city.day / BALANCE.daysPerMonth), r.propertyPayments);
  const anticipated = r.propertyFlows;
  city.propertyLedger.recovered += flows.principal + flows.interest;
  flows.loanedTotal = city.propertyLedger.loaned;
  flows.recoveredTotal = city.propertyLedger.recovered;
  flows.losses = city.propertyLedger.writtenOff;
  flows.loansIssued = city.propertyLedger.issuedThisMonth;
  flows.acquisitions = city.propertyLedger.acquiredThisMonth;
  flows.earlyPrincipal = city.propertyLedger.repaidEarlyThisMonth - city.propertyLedger.earlyInterestThisMonth;
  flows.earlyInterest = city.propertyLedger.earlyInterestThisMonth;
  city.propertyLedger.issuedThisMonth = 0;
  city.propertyLedger.acquiredThisMonth = 0;
  city.propertyLedger.repaidEarlyThisMonth = 0;
  city.propertyLedger.earlyInterestThisMonth = 0;
  r.propertyFlows = flows;
  const regularIncome = r.income - Math.round(anticipated.interest + anticipated.publicRent);
  r.income += Math.round(flows.interest + flows.publicRent) - Math.round(anticipated.interest + anticipated.publicRent);
  r.expenses += Math.round(flows.publicOperating) - Math.round(anticipated.publicOperating);
  r.net = r.income - r.expenses;
  r.cashNet = r.net + flows.principal;
  if (!city.collectsTaxes) {
    city.funds += r.cashNet;
    return { ...r, held: null };
  }
  city.funds += flows.principal + flows.interest + flows.publicRent - r.expenses;
  const cap = Math.max(0, regularIncome) * BALANCE.chestMonths;
  const total = city.uncollected + regularIncome;
  city.uncollected = Math.min(total, Math.max(cap, city.uncollected));
  return {
    ...r,
    held: { waiting: city.uncollected, lost: total - city.uncollected, filling: city.uncollected >= regularIncome * BALANCE.chestWarnMonths },
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
    const report = monthlyBudget(this.city.world, this.city.taxRate, this.city.pensionPerSenior, this.city.minimumWage, this.city.costTaxRates, this.city.incomeTaxRate, this.city.society, this.city);
    report.propertyFlows.loanedTotal = this.city.propertyLedger.loaned;
    report.propertyFlows.recoveredTotal = this.city.propertyLedger.recovered;
    report.propertyFlows.losses = this.city.propertyLedger.writtenOff;
    report.propertyFlows.loansIssued = this.city.propertyLedger.issuedThisMonth;
    report.propertyFlows.acquisitions = this.city.propertyLedger.acquiredThisMonth;
    report.propertyFlows.earlyPrincipal = this.city.propertyLedger.repaidEarlyThisMonth - this.city.propertyLedger.earlyInterestThisMonth;
    report.propertyFlows.earlyInterest = this.city.propertyLedger.earlyInterestThisMonth;
    return report;
  }
}
