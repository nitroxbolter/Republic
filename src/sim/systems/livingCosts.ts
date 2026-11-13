import { BALANCE } from '../../shared/balance';

export const COST_KINDS = ['energy', 'water', 'housing', 'transport'] as const;
export type CostKind = (typeof COST_KINDS)[number];
export type CostTaxRates = Record<CostKind, number>;

export function defaultCostTaxRates(): CostTaxRates {
  return { energy: 0, water: 0, housing: 0, transport: 0 };
}

export const BASE_COSTS: Readonly<Record<CostKind | 'food', number>> = {
  energy: BALANCE.energyBill,
  water: BALANCE.waterBill,
  food: BALANCE.foodBill,
  housing: BALANCE.housingBill,
  transport: BALANCE.transportBill,
};

export interface LivingCosts {
  gross: number;
  base: number;
  categoryTax: number;
  total: number;
  disposable: number;
  shortfall: number;
  /** Utility bills and taxes actually payable after private essentials. */
  governmentPaid: number;
  /** The tax share of governmentPaid, excluding the basic utility bills. */
  taxesPaid: number;
  utilityPaid: number;
  /** Actual government receipts by bill after utility availability and income limits. */
  charges: Readonly<Record<CostKind, GovernmentCharge>>;
}

export interface GovernmentCharge { base: number; tax: number }

export interface SuppliedUtilities { energy: boolean; water: boolean }

/** One resident's monthly wage or pension after essential bills and government charges. */
export function livingCosts(
  gross: number, rates: CostTaxRates,
  supplied: SuppliedUtilities = { energy: true, water: true },
): LivingCosts {
  const privateBase = BASE_COSTS.food + BASE_COSTS.housing + BASE_COSTS.transport;
  const utilityBase = (supplied.energy ? BASE_COSTS.energy : 0) + (supplied.water ? BASE_COSTS.water : 0);
  const categoryTax = COST_KINDS.reduce((sum, kind) => sum +
    (kind === 'energy' && !supplied.energy || kind === 'water' && !supplied.water ? 0 : BASE_COSTS[kind] * rates[kind] / 100), 0);
  const governmentDue = utilityBase + categoryTax;
  const governmentPaid = Math.min(governmentDue, Math.max(0, gross - privateBase));
  const paidShare = governmentDue > 0 ? governmentPaid / governmentDue : 0;
  const charge = (kind: CostKind): GovernmentCharge => {
    const suppliedHere = (kind !== 'energy' || supplied.energy) && (kind !== 'water' || supplied.water);
    return {
      base: suppliedHere && (kind === 'energy' || kind === 'water') ? BASE_COSTS[kind] * paidShare : 0,
      tax: suppliedHere ? BASE_COSTS[kind] * rates[kind] / 100 * paidShare : 0,
    };
  };
  const charges = { energy: charge('energy'), water: charge('water'), housing: charge('housing'), transport: charge('transport') };
  const base = privateBase + utilityBase;
  const total = base + categoryTax;
  return {
    gross, base, categoryTax, total,
    disposable: Math.max(0, gross - total),
    shortfall: Math.max(0, total - gross),
    governmentPaid,
    taxesPaid: categoryTax * paidShare,
    utilityPaid: utilityBase * paidShare,
    charges,
  };
}
