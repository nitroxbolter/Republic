import { BALANCE } from '../../shared/balance';
import { BUILDINGS, SERVICE_KINDS, type BuildingDef } from '../buildings/catalog';
import type { City } from '../City';
import { isWorking } from './utilities';
import { Stage } from '../stages';

export type DemographicStrategy = 'stimulate' | 'balanced' | 'slow';
export type PermitZone = 'r' | 'c' | 'o' | 'i';
export type PermitLimits = Record<PermitZone, number>;
export interface DemographicPolicy {
  strategy: DemographicStrategy;
  annualTarget: number;
  incentivesEnabled: boolean;
  housingSubsidy: number;
  /** One-time grants accrued by residential construction starts this month. */
  monthConstructionGrants: number;
  permitLimits: PermitLimits;
  permitUsed: PermitLimits;
  incentiveLevel: number;
  slowLevel: number;
  yearStartPopulation: number;
  yearStartDay: number;
  monthImmigration: number;
  monthEmigration: number;
  monthBirths: number;
  monthDeaths: number;
  lastImmigration: number;
  lastEmigration: number;
  lastBirths: number;
  lastDeaths: number;
  birthCarry: number;
}

const zones = (): PermitLimits => ({ r: 9999, c: 9999, o: 9999, i: 9999 });
const empty = (): PermitLimits => ({ r: 0, c: 0, o: 0, i: 0 });
export function initialDemography(): DemographicPolicy {
  return { strategy: 'balanced', annualTarget: 3, incentivesEnabled: true, housingSubsidy: 0, monthConstructionGrants: 0, permitLimits: zones(), permitUsed: empty(), incentiveLevel: 0, slowLevel: 0, yearStartPopulation: 0, yearStartDay: 0, monthImmigration: 0, monthEmigration: 0, monthBirths: 0, monthDeaths: 0, lastImmigration: 0, lastEmigration: 0, lastBirths: 0, lastDeaths: 0, birthCarry: 0 };
}

const serviceMask = (name: string) => 1 << SERVICE_KINDS.indexOf(name as (typeof SERVICE_KINDS)[number]);

export function hospitalCoverage(city: City): number {
  let residents = 0, covered = 0;
  const mask = serviceMask('hospital');
  for (const b of city.world.buildings.values()) {
    if (BUILDINGS[b.def].category !== 'residential' || b.construction > 0 || b.abandoned) continue;
    residents += b.occupants;
    if (b.services & mask) covered += b.occupants;
  }
  return residents > 0 ? covered / residents : 0;
}

/** Ordinary unemployment never closes migration; hospitals and extreme taxes can. */
export function migrationOutlook(city: City | undefined, companyTax: number, purchasingPower: number): number {
  const fade = (value: number, slow: number, stop: number) => Math.max(0, Math.min(1, (stop - value) / (stop - slow)));
  const company = fade(companyTax, BALANCE.migrationCompanyTaxSlow, BALANCE.migrationCompanyTaxStop);
  const income = fade(city?.incomeTaxRate ?? 0, BALANCE.migrationIncomeTaxSlow, BALANCE.migrationIncomeTaxStop);
  const residentRates = city?.costTaxRates;
  const residentTax = residentRates ? fade((residentRates.energy + residentRates.water + residentRates.housing + residentRates.transport) / 4, BALANCE.migrationIncomeTaxSlow, 100) : 1;
  const buying = Math.max(0, Math.min(1, (purchasingPower - BALANCE.migrationPurchasingPowerStop) / (BALANCE.migrationPurchasingPowerSlow - BALANCE.migrationPurchasingPowerStop)));
  const care = city && city.stage >= Stage.Town ? hospitalCoverage(city) : 1;
  return Math.min(company, income, residentTax, buying, care);
}

export interface InfrastructurePressure {
  housing: number;
  hospital: number;
  school: number;
  water: number;
  energy: number;
  security: number;
  transport: number;
  employment: number;
  score: number;
  alerts: string[];
}

/** Default monthly construction cap suggested for the city's current infrastructure score. */
export function suggestedPermitLimit(score: number): number {
  return score < 0.5 ? 1 : score < 0.75 ? 2 : 4;
}

/** Read-only, aggregate infrastructure signal; 1 means fully served, 0 means none. */
export function infrastructurePressure(city: City): InfrastructurePressure {
  let population = 0, capacity = 0, hospital = 0, school = 0, water = 0, energy = 0, security = 0, transport = 0, employed = 0;
  const stations: { x: number; y: number; radius: number }[] = [];
  for (const b of city.world.buildings.values()) {
    const d: BuildingDef = BUILDINGS[b.def];
    if ((d.busStation || d.railStation) && isWorking(b)) stations.push({ x: b.x, y: b.y, radius: d.busStation?.reach ?? 8 });
    if (d.category !== 'residential' && b.construction === 0) employed += b.occupants;
  }
  for (const b of city.world.buildings.values()) {
    const d = BUILDINGS[b.def];
    if (d.category !== 'residential' || b.construction > 0 || b.abandoned) continue;
    const count = b.occupants;
    population += count;
    capacity += d.capacity;
    if (b.services & serviceMask('hospital')) hospital += count;
    if (b.services & serviceMask('education')) school += count;
    if (b.watered) water += count;
    if (b.powered) energy += count;
    if ((b.services & serviceMask('police')) && (b.services & serviceMask('fire'))) security += count;
    if (stations.some((s) => (s.x - b.x) ** 2 + (s.y - b.y) ** 2 <= s.radius ** 2)) transport += count;
  }
  const share = (value: number) => population ? Math.min(1, value / population) : 1;
  const measures = {
    housing: capacity ? Math.max(0, Math.min(1, (capacity - population) / Math.max(1, capacity * 0.2))) : 1,
    hospital: city.stage >= Stage.Town ? share(hospital) : 1, school: city.stage >= Stage.Village ? share(school) : 1, water: share(water), energy: share(energy), security: share(security), transport: share(transport),
    employment: population ? Math.min(1, employed / Math.max(1, population * BALANCE.workforceShare)) : 1,
  };
  const labels = { housing: 'Moradias próximas da lotação', hospital: 'Cobertura hospitalar insuficiente', school: 'Cobertura escolar insuficiente', water: 'Abastecimento de água insuficiente', energy: 'Abastecimento de energia insuficiente', security: 'Segurança insuficiente', transport: 'Transporte insuficiente', employment: 'Desemprego elevado' };
  const alerts = (Object.keys(measures) as (keyof typeof measures)[]).filter((k) => measures[k] < BALANCE.demographicInfrastructureWarning).map((k) => labels[k]);
  const score = (Object.values(measures).reduce((sum, value) => sum + value, 0) / 8);
  return { ...measures, score, alerts };
}

export function demographicReport(city: City) {
  const p = city.demography;
  const population = [...city.world.buildings.values()].reduce((sum, b) => sum + (BUILDINGS[b.def].category === 'residential' && b.construction === 0 && !b.abandoned ? b.occupants : 0), 0);
  const elapsed = Math.max(1, city.day - p.yearStartDay);
  const annualGrowth = p.yearStartPopulation > 0 ? (population - p.yearStartPopulation) / p.yearStartPopulation * 100 * Math.min(1, 360 / elapsed) : 0;
  return { ...p, population, annualGrowth, infrastructure: infrastructurePressure(city), monthlyCost: demographicMonthlyCost(city, true) };
}

/** Incentives are paid from the existing monthly budget, with an affordability check. */
export function demographicMonthlyCost(city: City, forecast = false): number {
  const p = city.demography;
  if (!p.incentivesEnabled || p.strategy !== 'stimulate') return 0;
  const residents = demographicReportPopulation(city);
  const immigrants = forecast && city.day % BALANCE.daysPerMonth !== 0 ? p.lastImmigration || p.monthImmigration : p.monthImmigration;
  return Math.round(p.incentiveLevel * (immigrants * BALANCE.demographicIncentivePerImmigrant + residents * BALANCE.demographicIncentivePerResident));
}

function demographicReportPopulation(city: City): number {
  let population = 0;
  for (const b of city.world.buildings.values()) if (BUILDINGS[b.def].category === 'residential' && b.construction === 0 && !b.abandoned) population += b.occupants;
  return population;
}

/** Smoothly adapt the policy monthly; the target never removes existing residents. */
export function advanceDemographicPolicy(city: City): void {
  const p = city.demography;
  if (city.day % BALANCE.daysPerMonth !== 1) return;
  p.permitUsed = empty();
  const population = demographicReportPopulation(city);
  if (p.yearStartDay === 0 && population > 0 || city.day - p.yearStartDay >= 360) {
    p.yearStartPopulation = population;
    p.yearStartDay = city.day;
  }
  const growth = demographicReport(city).annualGrowth;
  const infrastructure = infrastructurePressure(city).score;
  const budgetOk = city.funds > Math.max(1000, population * BALANCE.demographicIncentivePerResident * 3);
  const desired = p.strategy === 'stimulate' && p.incentivesEnabled && budgetOk
    ? Math.max(0, Math.min(1, (p.annualTarget - growth + 2) / 4)) * Math.max(0.2, infrastructure)
    : 0;
  p.incentiveLevel += (desired - p.incentiveLevel) * BALANCE.demographicPolicySmoothing;
  p.slowLevel += ((p.strategy === 'slow' ? 1 : 0) - p.slowLevel) * BALANCE.demographicPolicySmoothing;
}

/** Natural births fill existing vacancies; fractional births carry over deterministically. */
export function demographicBirthDay(city: City): void {
  const p = city.demography;
  p.birthCarry += demographicReportPopulation(city) * BALANCE.demographicBirthsPerResidentYear / 360;
  let births = Math.floor(p.birthCarry);
  if (births <= 0) return;
  for (const b of city.world.buildings.values()) {
    if (births <= 0) break;
    const d = BUILDINGS[b.def];
    if (d.category !== 'residential' || b.construction > 0 || b.abandoned || b.occupants <= 0) continue;
    const added = Math.min(births, Math.max(0, d.capacity - b.occupants));
    b.occupants += added;
    births -= added;
    p.monthBirths += added;
    p.birthCarry -= added;
  }
  p.birthCarry = Math.min(p.birthCarry, 1);
}

export function recordMigration(city: City, immigration: number, emigration: number): void {
  city.demography.monthImmigration += immigration;
  city.demography.monthEmigration += emigration;
}

export function recordDeaths(city: City, deaths: number): void { city.demography.monthDeaths += deaths; }

export function closeDemographicMonth(city: City): void {
  const p = city.demography;
  p.lastImmigration = p.monthImmigration; p.lastEmigration = p.monthEmigration; p.lastBirths = p.monthBirths; p.lastDeaths = p.monthDeaths;
  p.monthImmigration = 0; p.monthEmigration = 0; p.monthBirths = 0; p.monthDeaths = 0;
  p.monthConstructionGrants = 0;
}
