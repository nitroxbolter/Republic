import type { City } from '../City';

export const BANK_MIN_AMOUNT = 1_000;
export const BANK_MAX_DEBT = 1_000_000;
export const BANK_MAX_TERM = 12;

export interface BankInvestment {
  id: number;
  principal: number;
  months: number;
  remainingMonths: number;
  monthlyRate: number;
  maturityValue: number;
}

export interface BankLoan {
  id: number;
  principal: number;
  balance: number;
  months: number;
  remainingMonths: number;
  monthlyRate: number;
  installment: number;
}

export interface BankState {
  nextId: number;
  investments: BankInvestment[];
  loans: BankLoan[];
}

export interface BankFlow {
  investmentPrincipal: number;
  investmentInterest: number;
  loanPrincipal: number;
  loanInterest: number;
  loanPayment: number;
}

export type BankResult = { ok: true } | { ok: false; reason: 'amount' | 'term' | 'funds' | 'limit' };

const cents = (value: number): number => Math.round(value * 100) / 100;

export function initialBank(): BankState { return { nextId: 1, investments: [], loans: [] }; }
export function investmentRate(months: number): number { return 0.004 + (months - 1) * 0.0005; }
export function loanRate(months: number): number { return 0.012 + (months - 1) * 0.001; }
export function investmentValue(amount: number, months: number): number { return cents(amount * (1 + investmentRate(months)) ** months); }
export function loanInstallment(amount: number, months: number): number {
  const rate = loanRate(months);
  return cents(amount * rate / (1 - (1 + rate) ** -months));
}
export function outstandingDebt(bank: BankState): number { return cents(bank.loans.reduce((sum, loan) => sum + loan.balance, 0)); }

function validOrder(amount: number, months: number): BankResult {
  if (!Number.isSafeInteger(amount) || amount < BANK_MIN_AMOUNT || amount > 1_000_000_000) return { ok: false, reason: 'amount' };
  if (!Number.isInteger(months) || months < 1 || months > BANK_MAX_TERM) return { ok: false, reason: 'term' };
  return { ok: true };
}

export function openInvestment(city: City, amount: number, months: number): BankResult {
  const valid = validOrder(amount, months);
  if (!valid.ok) return valid;
  if (city.funds < amount) return { ok: false, reason: 'funds' };
  city.funds = cents(city.funds - amount);
  city.bank.investments.push({ id: city.bank.nextId++, principal: amount, months, remainingMonths: months, monthlyRate: investmentRate(months), maturityValue: investmentValue(amount, months) });
  return { ok: true };
}

export function openLoan(city: City, amount: number, months: number): BankResult {
  const valid = validOrder(amount, months);
  if (!valid.ok) return valid;
  if (outstandingDebt(city.bank) + amount > BANK_MAX_DEBT) return { ok: false, reason: 'limit' };
  city.funds = cents(city.funds + amount);
  city.bank.loans.push({ id: city.bank.nextId++, principal: amount, balance: amount, months, remainingMonths: months, monthlyRate: loanRate(months), installment: loanInstallment(amount, months) });
  return { ok: true };
}

export function forecastBankMonth(bank: BankState): BankFlow {
  const flow: BankFlow = { investmentPrincipal: 0, investmentInterest: 0, loanPrincipal: 0, loanInterest: 0, loanPayment: 0 };
  for (const investment of bank.investments) if (investment.remainingMonths === 1) {
    flow.investmentPrincipal += investment.principal;
    flow.investmentInterest += cents(investment.maturityValue - investment.principal);
  }
  for (const loan of bank.loans) {
    const interest = cents(loan.balance * loan.monthlyRate);
    const payment = loan.remainingMonths === 1 ? cents(loan.balance + interest) : Math.min(loan.installment, cents(loan.balance + interest));
    flow.loanInterest += interest;
    flow.loanPayment += payment;
    flow.loanPrincipal += cents(payment - interest);
  }
  for (const key of Object.keys(flow) as (keyof BankFlow)[]) flow[key] = cents(flow[key]);
  return flow;
}

export function settleBankMonth(bank: BankState): BankFlow {
  const flow = forecastBankMonth(bank);
  bank.investments = bank.investments.filter((investment) => --investment.remainingMonths > 0);
  for (const loan of bank.loans) {
    const interest = cents(loan.balance * loan.monthlyRate);
    const payment = loan.remainingMonths === 1 ? cents(loan.balance + interest) : Math.min(loan.installment, cents(loan.balance + interest));
    loan.balance = cents(loan.balance + interest - payment);
    loan.remainingMonths--;
  }
  bank.loans = bank.loans.filter((loan) => loan.remainingMonths > 0);
  return flow;
}
