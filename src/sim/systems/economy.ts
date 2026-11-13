import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingCategory, type BuildingInstance } from '../buildings/catalog';
import type { World } from '../World';
import { isActive } from './access';
import { hasUtilities } from './utilities';
import { defaultCostTaxRates, livingCosts, type CostTaxRates } from './livingCosts';
import { propertyBills } from './realEstate';

export interface HouseholdPolicy {
  minimumWage: number;
  pensionPerSenior: number;
  costTaxRates: CostTaxRates;
  incomeTaxRate?: number;
}

/** A compact estimate of household purchasing power and the private economy. */
export interface EconomyReport {
  /** Household purchasing power after living costs and the indirect effect of company taxation. */
  purchasingPower: number;
  /** Household spending available to local commerce, in game dollars per month. */
  householdSpending: number;
  /** Estimated local commercial turnover, in game dollars per month. */
  commerceRevenue: number;
  /** Commercial plus industrial turnover exposed to the company tax. */
  businessTurnover: number;
  /** Share of normal commercial job capacity supported by household demand. */
  commerceActivity: number;
  /** Industrial output factor, which follows demand from the commercial sector. */
  industrialProduction: number;
}

const MIN_PURCHASING_POWER = 0.1;
const MIN_COMMERCE_ACTIVITY = 0.1;

/** Household spending follows disposable income, with a small floor for essential purchases. */
export function householdPurchasingPower(taxRate: number, policy?: HouseholdPolicy): number {
  const rates = policy?.costTaxRates ?? defaultCostTaxRates();
  const workerGross = policy?.minimumWage ?? BALANCE.defaultMinimumWage;
  const worker = livingCosts(workerGross * (1 - (policy?.incomeTaxRate ?? 0) / 100), rates);
  const senior = livingCosts(policy?.pensionPerSenior ?? BALANCE.defaultPensionPerSenior, rates);
  const baseWorker = livingCosts(BALANCE.defaultMinimumWage, defaultCostTaxRates());
  const baseSenior = livingCosts(BALANCE.defaultPensionPerSenior, defaultCostTaxRates());
  const available = 0.87 * worker.disposable + 0.13 * senior.disposable;
  const reference = 0.87 * baseWorker.disposable + 0.13 * baseSenior.disposable;
  // Company taxation cools hiring and wage opportunities; it is never a wage deduction.
  const companyFactor = (1 - 0.6 * taxRate / 100) / (1 - 0.6 * BALANCE.baseTaxRate / 100);
  return Math.max(MIN_PURCHASING_POWER, Math.min(1.05, available / reference * companyFactor));
}

/**
 * Monthly private-sector activity. Household spending is shared against the local capacity
 * for shops and offices; the resulting sales support commercial jobs and downstream industry.
 * This is not municipal income and is deliberately separate from the tax-demand adjustment.
 */
export function economyReport(world: World, taxRate: number = BALANCE.baseTaxRate, policy?: HouseholdPolicy): EconomyReport {
  let residents = 0;
  let disposable = 0;
  let baselineDisposable = 0;
  let commerceCapacity = 0;
  let industrialCapacity = 0;
  const rates = policy?.costTaxRates ?? defaultCostTaxRates();
  const noTax = defaultCostTaxRates();
  for (const b of world.buildings.values()) {
    if (!isActive(b) || b.abandoned || b.construction > 0 || !hasUtilities(b)) continue;
    const d = BUILDINGS[b.def];
    if (d.category === 'residential') {
      residents += b.occupants;
      if (policy && b.occupants > 0) {
        // A first occupant should not be treated as if they alone will pay all common-area costs forever.
        const expectedOccupants = Math.max(b.occupants, Math.ceil(d.capacity * 0.65));
        const bill = propertyBills(b, policy?.costTaxRates.housing ?? 0, expectedOccupants);
        const subsidy = policy && 'demography' in policy ? (policy as import('../City').City).demography.housingSubsidy : 0;
        const bills = { food: BALANCE.foodBill, transport: BALANCE.transportBill, housing: bill.rent * (1 - subsidy) / expectedOccupants, energy: bill.energy / expectedOccupants, water: bill.water / expectedOccupants, surcharge: bill.surcharge / expectedOccupants };
        const wage = (policy?.minimumWage ?? BALANCE.defaultMinimumWage) * BALANCE.lifestyleWage[b.lifestyle] * (1 - (policy?.incomeTaxRate ?? 0) / 100);
        const monthlyDue = bills.food + bills.transport + bills.housing + bills.energy + bills.water + bills.surcharge
          + bills.housing * rates.housing / 100 + bills.energy * rates.energy / 100 + bills.water * rates.water / 100 + bills.transport * rates.transport / 100;
        disposable += b.occupants * (0.87 * Math.max(0, wage - monthlyDue) + 0.13 * Math.max(0, (policy?.pensionPerSenior ?? BALANCE.defaultPensionPerSenior) - monthlyDue));
        const baselineBills = { ...bills, surcharge: 0 };
        const baselineDue = baselineBills.food + baselineBills.transport + baselineBills.housing + baselineBills.energy + baselineBills.water;
        baselineDisposable += b.occupants * (0.87 * Math.max(0, BALANCE.defaultMinimumWage * BALANCE.lifestyleWage[b.lifestyle] - baselineDue) + 0.13 * Math.max(0, BALANCE.defaultPensionPerSenior - baselineDue));
      }
    }
    else if (d.category === 'commercial') commerceCapacity += d.capacity;
    else if (d.category === 'industrial') industrialCapacity += d.capacity;
  }

  const reference = 0.87 * livingCosts(BALANCE.defaultMinimumWage, noTax).disposable + 0.13 * livingCosts(BALANCE.defaultPensionPerSenior, noTax).disposable;
  const companyFactor = (1 - 0.6 * taxRate / 100) / (1 - 0.6 * BALANCE.baseTaxRate / 100);
  const housingFactor = residents > 0 ? Math.max(0.85, Math.min(1.08, 1 + 0.05 * (baselineDisposable / Math.max(1, residents * reference) - 1))) : 1;
  const purchasingPower = policy && residents > 0 ? Math.max(MIN_PURCHASING_POWER, Math.min(1.15, disposable / Math.max(1, baselineDisposable) * companyFactor * housingFactor)) : householdPurchasingPower(taxRate, policy);
  const targetShopJobs = residents * BALANCE.shopJobsPerResident + BALANCE.seedCommercialJobs;
  const marketCoverage = commerceCapacity <= 0 ? 0 : Math.min(1, commerceCapacity / Math.max(1, targetShopJobs));
  const householdSpending = Math.round(residents * BALANCE.monthlyShopSpendPerResident * purchasingPower);
  const commerceRevenue = Math.round(householdSpending * marketCoverage);
  // Sales follow household spending; a small market-coverage component also affects hiring.
  // Its 5% weight keeps a new town from spiralling before its first shops have appeared.
  const commerceActivity = Math.max(MIN_COMMERCE_ACTIVITY, Math.min(1, purchasingPower * (0.95 + 0.05 * marketCoverage)));
  const industrialProduction = 0.25 + 0.75 * commerceActivity;
  const businessTurnover = commerceRevenue + Math.round(industrialCapacity * BALANCE.monthlyShopSpendPerResident * industrialProduction);

  return { purchasingPower, householdSpending, commerceRevenue, businessTurnover, commerceActivity, industrialProduction };
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
