import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingInstance } from '../buildings/catalog';
import type { City } from '../City';
import type { World } from '../World';

export type PropertyStatus = 'regular' | 'loss' | 'delinquent' | 'critical' | 'recovery' | 'financed' | 'bankrupt';
export interface PropertyLoan {
  principal: number;
  interestRate: number;
  term: number;
  payment: number;
  balance: number;
  paid: number;
  interestReceived: number;
  late: number;
  lateInterest: number;
  months: number;
}
export interface PropertyState {
  reserve: number;
  debt: number;
  delinquentMonths: number;
  status: PropertyStatus;
  publicOwned: boolean;
  loan: PropertyLoan | null;
  lastMonth: number;
  lastRent: number;
  lastCost: number;
  lastResult: number;
}

export interface PropertyBills {
  rent: number;
  housingTax: number;
  energy: number;
  water: number;
  operatingCost: number;
  surcharge: number;
}

const rentOf = (b: BuildingInstance) => BALANCE.propertyRent[b.def as keyof typeof BALANCE.propertyRent] ?? 0;
export const isHome = (b: BuildingInstance) => BUILDINGS[b.def].category === 'residential';

export function initialProperty(b: BuildingInstance): PropertyState {
  return { reserve: rentOf(b) * BALANCE.propertyReserveMonths, debt: 0, delinquentMonths: 0, status: 'regular', publicOwned: false, loan: null, lastMonth: -1, lastRent: 0, lastCost: 0, lastResult: 0 };
}

export function propertyState(b: BuildingInstance): PropertyState {
  return b.property ?? initialProperty(b);
}

/** A building's full monthly bills; only the occupied share is charged to residents. */
export function propertyBills(b: BuildingInstance, housingTaxRate: number, projectedOccupants = b.occupants): PropertyBills {
  const capacity = BUILDINGS[b.def].capacity;
  const rent = rentOf(b);
  const occupants = Math.max(0, projectedOccupants);
  const scale = BALANCE.propertyUtilityScale[b.lifestyle];
  const economy = 1 - BALANCE.propertyScaleDiscount * Math.min(1, capacity / 100);
  const common = Math.sqrt(capacity);
  const energy = b.powered ? BALANCE.energyBill * scale * (BALANCE.propertyCommonEnergy * common + occupants * economy) : 0;
  const water = b.watered ? BALANCE.waterBill * scale * (BALANCE.propertyCommonWater * common + occupants * economy) : 0;
  const loan = b.property?.loan;
  const grossPerPerson = occupants > 0 ? rent / occupants : 0;
  const income = BALANCE.defaultMinimumWage * BALANCE.lifestyleWage[b.lifestyle];
  const roomPerPerson = Math.max(0, income * BALANCE.propertyHousingIncomeLimit - grossPerPerson);
  const surcharge = loan && occupants > 0 ? Math.min(loan.payment, roomPerPerson * occupants) : 0;
  return { rent, housingTax: rent * housingTaxRate / 100, energy, water, operatingCost: rent * BALANCE.propertyOperatingShare + capacity * 0.5, surcharge };
}

export interface PropertyPayment { rent: number; surcharge: number; operatingCost: number }
export interface PropertyFlows { principal: number; interest: number; earlyPrincipal: number; earlyInterest: number; loansIssued: number; acquisitions: number; publicRent: number; publicOperating: number; delinquent: number; debt: number; activeLoans: number; loanedTotal: number; recoveredTotal: number; losses: number; milestones: { id: number; months: number }[] }
export const emptyPropertyFlows = (): PropertyFlows => ({ principal: 0, interest: 0, earlyPrincipal: 0, earlyInterest: 0, loansIssued: 0, acquisitions: 0, publicRent: 0, publicOperating: 0, delinquent: 0, debt: 0, activeLoans: 0, loanedTotal: 0, recoveredTotal: 0, losses: 0, milestones: [] });
const PROPERTY_MILESTONES: readonly number[] = [BALANCE.propertyAlertMonths, BALANCE.propertyFinanceMonths, BALANCE.propertyCriticalMonths, BALANCE.propertyBankruptcyMonths];

/** Read-only city totals for forecasts and the budget panel. */
export function propertyTotals(world: World): PropertyFlows {
  const result = emptyPropertyFlows();
  for (const b of world.buildings.values()) {
    if (!isHome(b)) continue;
    const p = propertyState(b);
    if (p.delinquentMonths > 0 || p.status === 'bankrupt') result.delinquent++;
    result.debt += p.debt;
    if (p.loan) { result.activeLoans++; result.loanedTotal += p.loan.principal; result.recoveredTotal += p.loan.paid; result.losses += p.loan.late; }
  }
  return result;
}

/** Estimate the next installment without changing building balances. */
export function forecastPropertyFlows(world: World, payments: ReadonlyMap<number, PropertyPayment>): PropertyFlows {
  const flows = propertyTotals(world);
  for (const b of world.buildings.values()) {
    if (!isHome(b) || b.construction > 0) continue;
    const p = propertyState(b);
    const bill = payments.get(b.id);
    const rent = bill?.rent ?? 0;
    const surcharge = bill?.surcharge ?? 0;
    const cost = bill?.operatingCost ?? propertyBills(b, 0).operatingCost;
    if (p.publicOwned) { flows.publicRent += rent + surcharge; flows.publicOperating += cost; }
    if (!p.loan) continue;
    const result = rent + surcharge - cost;
    const debtPaid = Math.min(p.debt, Math.max(0, result));
    const reserve = Math.max(0, p.reserve + result - debtPaid);
    const interestDue = p.loan.balance * p.loan.interestRate + p.loan.lateInterest;
    const due = Math.min(p.loan.payment, p.loan.balance + interestDue) + p.loan.late;
    const paid = Math.min(due, reserve);
    const interest = Math.min(paid, interestDue);
    flows.interest += interest;
    flows.principal += paid - interest;
  }
  return flows;
}

/** Called only at the existing budget close. A per-building month marker prevents a second charge. */
export function settleProperties(world: World, month: number, payments: ReadonlyMap<number, PropertyPayment>): PropertyFlows {
  const flows = emptyPropertyFlows();
  for (const b of world.buildings.values()) {
    if (!isHome(b) || b.construction > 0) continue;
    const p = b.property ?? (b.property = initialProperty(b));
    if (p.lastMonth === month) continue;
    const bill = payments.get(b.id);
    const rent = bill?.rent ?? 0;
    const surcharge = bill?.surcharge ?? 0;
    const cost = bill?.operatingCost ?? propertyBills(b, 0).operatingCost;
    p.lastMonth = month;
    p.lastRent = rent;
    p.lastCost = cost;
    p.lastResult = rent + surcharge - cost;
    if (p.publicOwned) { flows.publicRent += rent + surcharge; flows.publicOperating += cost; }
    else if (p.lastResult >= 0) {
      const debtPayment = Math.min(p.debt, p.lastResult);
      p.debt -= debtPayment;
      p.reserve += p.lastResult - debtPayment;
    }
    else {
      const loss = -p.lastResult;
      const fromReserve = Math.min(loss, p.reserve);
      p.reserve -= fromReserve;
      p.debt += loss - fromReserve;
    }
    if (p.debt > 0) p.delinquentMonths++;
    else p.delinquentMonths = 0;
    if (PROPERTY_MILESTONES.includes(p.delinquentMonths)) flows.milestones.push({ id: b.id, months: p.delinquentMonths });
    if (p.loan) {
      const loan = p.loan;
      loan.months++;
      const interestDue = loan.balance * loan.interestRate + loan.lateInterest;
      const due = Math.min(loan.payment, loan.balance + interestDue) + loan.late;
      const paid = Math.min(due, p.reserve);
      p.reserve -= paid;
      loan.late = due - paid;
      const interest = Math.min(paid, interestDue);
      loan.lateInterest = interestDue - interest;
      const principal = paid - interest;
      loan.balance = Math.max(0, loan.balance - principal);
      loan.paid += paid;
      loan.interestReceived += interest;
      flows.principal += principal;
      flows.interest += interest;
      if (loan.balance < 0.01 && loan.late < 0.01) p.loan = null;
    }
    p.status = p.delinquentMonths >= BALANCE.propertyBankruptcyMonths ? 'bankrupt'
      : p.delinquentMonths >= BALANCE.propertyCriticalMonths ? 'critical'
      : p.loan ? 'financed'
        : p.delinquentMonths >= BALANCE.propertyAlertMonths ? 'delinquent'
          : p.debt > 0 ? 'loss' : p.lastResult < 0 ? 'loss' : 'regular';
  }
  return { ...flows, ...propertyTotals(world), principal: flows.principal, interest: flows.interest, publicRent: flows.publicRent, publicOperating: flows.publicOperating, milestones: flows.milestones };
}

export function financeProperty(city: City, b: BuildingInstance): boolean {
  if (!isHome(b)) return false;
  const p = b.property ?? (b.property = initialProperty(b));
  if (p.loan || p.debt <= 0 || p.delinquentMonths < BALANCE.propertyFinanceMonths || city.funds < p.debt) return false;
  const principal = p.debt;
  const rate: number = BALANCE.propertyLoanInterest;
  const term = BALANCE.propertyLoanTerm;
  const payment = rate === 0 ? principal / term : principal * rate / (1 - (1 + rate) ** -term);
  city.funds -= principal;
  city.propertyLedger.loaned += principal;
  city.propertyLedger.issuedThisMonth += principal;
  p.debt = 0;
  p.delinquentMonths = 0;
  p.loan = { principal, interestRate: rate, term, payment, balance: principal, paid: 0, interestReceived: 0, late: 0, lateInterest: 0, months: 0 };
  p.status = 'financed';
  return true;
}

export function acquireProperty(city: City, b: BuildingInstance): boolean {
  if (!isHome(b)) return false;
  const p = b.property ?? (b.property = initialProperty(b));
  if (p.publicOwned || p.status !== 'bankrupt') return false;
  const price = p.debt + rentOf(b) * 12;
  if (city.funds < price) return false;
  city.funds -= price;
  city.propertyLedger.acquiredThisMonth += price;
  if (p.loan) city.propertyLedger.writtenOff += p.loan.balance + p.loan.late;
  p.debt = 0;
  p.reserve = 0;
  p.publicOwned = true;
  p.loan = null;
  p.status = 'recovery';
  return true;
}

export function privateRecoverProperty(b: BuildingInstance): boolean {
  if (!isHome(b)) return false;
  const p = b.property;
  if (!p || p.status !== 'bankrupt') return false;
  p.reserve = 0;
  p.debt = 0;
  p.delinquentMonths = 0;
  p.status = 'recovery';
  return true;
}

export function repayPropertyLoan(city: City, b: BuildingInstance): boolean {
  const p = b.property;
  if (!p?.loan) return false;
  const amount = p.loan.balance + p.loan.lateInterest;
  if (p.reserve < amount) return false;
  p.reserve -= amount;
  city.funds += amount;
  city.propertyLedger.recovered += amount;
  city.propertyLedger.repaidEarlyThisMonth += amount;
  city.propertyLedger.earlyInterestThisMonth += p.loan.lateInterest;
  p.loan = null;
  p.status = p.debt > 0 ? 'loss' : 'regular';
  return true;
}
