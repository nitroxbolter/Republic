import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingCategory, type BuildingInstance } from '../buildings/catalog';
import type { World } from '../World';
import { isActive } from './access';
import { hasUtilities } from './utilities';

/** A compact estimate of household purchasing power and the private economy. */
export interface EconomyReport {
  /** Take-home purchasing power relative to the default 9% tax rate. */
  purchasingPower: number;
  /** Household spending available to local commerce, in game dollars per month. */
  householdSpending: number;
  /** Estimated local commercial turnover, in game dollars per month. */
  commerceRevenue: number;
  /** Share of normal commercial job capacity supported by household demand. */
  commerceActivity: number;
  /** Industrial output factor, which follows demand from the commercial sector. */
  industrialProduction: number;
}

const MIN_PURCHASING_POWER = 0.1;
const MIN_COMMERCE_ACTIVITY = 0.1;

/** Household spending follows disposable income, with a small floor for essential purchases. */
export function householdPurchasingPower(taxRate: number, minimumWage: number = BALANCE.defaultMinimumWage): number {
  const afterTaxAtRate = 1 - taxRate / 100;
  const afterTaxAtBase = 1 - BALANCE.baseTaxRate / 100;
  const wageEffect = Math.max(0.75, Math.min(1.3, minimumWage / BALANCE.defaultMinimumWage));
  return Math.max(MIN_PURCHASING_POWER, Math.min(1.3, (afterTaxAtRate / afterTaxAtBase) * wageEffect));
}

/**
 * Monthly private-sector activity. Household spending is shared against the local capacity
 * for shops and offices; the resulting sales support commercial jobs and downstream industry.
 * This is not municipal income and is deliberately separate from the tax-demand adjustment.
 */
export function economyReport(world: World, taxRate: number = BALANCE.baseTaxRate, minimumWage: number = BALANCE.defaultMinimumWage): EconomyReport {
  let residents = 0;
  let commerceCapacity = 0;
  for (const b of world.buildings.values()) {
    if (!isActive(b) || b.abandoned || b.construction > 0 || !hasUtilities(b)) continue;
    const d = BUILDINGS[b.def];
    if (d.category === 'residential') residents += b.occupants;
    else if (d.category === 'commercial') commerceCapacity += d.capacity;
  }

  const purchasingPower = householdPurchasingPower(taxRate, minimumWage);
  const targetShopJobs = residents * BALANCE.shopJobsPerResident + BALANCE.seedCommercialJobs;
  const marketCoverage = commerceCapacity <= 0 ? 0 : Math.min(1, commerceCapacity / Math.max(1, targetShopJobs));
  const householdSpending = Math.round(residents * BALANCE.monthlyShopSpendPerResident * purchasingPower);
  const commerceRevenue = Math.round(householdSpending * marketCoverage);
  // Sales follow household spending; a small market-coverage component also affects hiring.
  // Its 5% weight keeps a new town from spiralling before its first shops have appeared.
  const wageHiring = Math.max(0.6, 1 - Math.max(0, minimumWage / BALANCE.defaultMinimumWage - 1) * 0.08);
  const commerceActivity = Math.max(MIN_COMMERCE_ACTIVITY, Math.min(1, purchasingPower * (0.95 + 0.05 * marketCoverage) * wageHiring));
  const industrialProduction = 0.25 + 0.75 * commerceActivity;

  return { purchasingPower, householdSpending, commerceRevenue, commerceActivity, industrialProduction };
}

/** The portion of a business's normal employment capacity supported by current sales. */
export function employmentFactor(category: BuildingCategory, economy: EconomyReport): number {
  if (category === 'commercial') return economy.commerceActivity;
  if (category === 'industrial') return economy.industrialProduction;
  return 1;
}

/** Effective jobs offered by one building at the current level of economic activity. */
export function effectiveJobs(building: BuildingInstance, economy: EconomyReport): number {
  return BUILDINGS[building.def].capacity * employmentFactor(BUILDINGS[building.def].category, economy);
}
