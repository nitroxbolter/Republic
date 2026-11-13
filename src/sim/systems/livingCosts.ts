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
  housingPaid: number;
  surchargePaid: number;
  /** Actual government receipts by bill after utility availability and income limits. */
  charges: Readonly<Record<CostKind, GovernmentCharge>>;
}

export interface GovernmentCharge { base: number; tax: number }

export interface SuppliedUtilities { energy: boolean; water: boolean }

export interface HouseholdBills { energy: number; water: number; housing: number; transport: number; food: number; surcharge?: number }

/** One resident's monthly wage or pension after essential bills and government charges. */
export function livingCosts(
  gross: number, rates: CostTaxRates,
  supplied: SuppliedUtilities = { energy: true, water: true },
  bills: HouseholdBills = BASE_COSTS,
): LivingCosts {
  const due = { energy: supplied.energy ? bills.energy : 0, water: supplied.water ? bills.water : 0, housing: bills.housing, transport: bills.transport };
  const categoryTax = COST_KINDS.reduce((sum, kind) => sum + due[kind] * rates[kind] / 100, 0);
  const base = bills.food + due.housing + due.energy + due.water + due.transport + (bills.surcharge ?? 0);
  const total = base + categoryTax;
  let available = Math.max(0, gross);
  const pay = (amount: number) => { const paid = Math.min(available, Math.max(0, amount)); available -= paid; return paid; };
  const housingPaid = pay(due.housing);
  const surchargePaid = pay(bills.surcharge ?? 0);
  const energyPaid = pay(due.energy);
  const waterPaid = pay(due.water);
  pay(bills.food);
  const transportPaid = pay(due.transport);
  const charges = {
    energy: { base: energyPaid, tax: pay(due.energy * rates.energy / 100) },
    water: { base: waterPaid, tax: pay(due.water * rates.water / 100) },
    housing: { base: 0, tax: pay(housingPaid * rates.housing / 100) },
    transport: { base: 0, tax: pay(transportPaid * rates.transport / 100) },
  };
  const utilityPaid = energyPaid + waterPaid;
  const taxesPaid = COST_KINDS.reduce((sum, kind) => sum + charges[kind].tax, 0);
  const governmentPaid = utilityPaid + taxesPaid;
  return {
    gross, base, categoryTax, total,
    disposable: available,
    shortfall: Math.max(0, total - gross),
    governmentPaid,
    taxesPaid,
    utilityPaid,
    housingPaid,
    surchargePaid,
    charges,
  };
}
