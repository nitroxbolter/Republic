import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/City';
import { World } from '../src/sim/World';
import { collectBudget, monthlyBudget } from '../src/sim/systems/budget';
import { BANK_MAX_DEBT, forecastBankMonth, investmentRate, investmentValue, loanRate, openInvestment, openLoan, outstandingDebt } from '../src/sim/systems/bank';
import { deserialize, parseSave, serialize } from '../src/sim/save';
import { presetSettings } from '../src/sim/terrain/presets';

function city(): City { return new City(new World(64, 64, 5), 100_000); }
function forecast(c: City) { return monthlyBudget(c.world, c.taxRate, c.pensionPerSenior, c.minimumWage, c.costTaxRates, c.incomeTaxRate, c.society, c); }

describe('city bank', () => {
  it('compounds investment interest and credits principal plus earnings only at maturity', () => {
    const c = city();
    expect(openInvestment(c, 10_000, 3)).toEqual({ ok: true });
    expect(c.funds).toBe(90_000);
    expect(c.bank.investments[0].maturityValue).toBe(investmentValue(10_000, 3));
    expect(investmentValue(10_000, 3)).toBeGreaterThan(10_000 * (1 + investmentRate(3) * 3));
    for (let month = 1; month <= 3; month++) {
      const before = c.funds;
      const predicted = forecast(c);
      const closed = collectBudget(c);
      expect(closed.cashNet).toBeCloseTo(c.funds - before, 2);
      expect(closed.bankFlow.investmentPrincipal).toBe(month === 3 ? 10_000 : 0);
      expect(predicted.bankFlow).toEqual(closed.bankFlow);
    }
    expect(c.bank.investments).toHaveLength(0);
  });

  it('amortizes a loan over monthly closings with increasing rates for longer terms', () => {
    const c = city();
    expect(loanRate(12)).toBeGreaterThan(loanRate(1));
    expect(openLoan(c, 12_000, 12)).toEqual({ ok: true });
    expect(c.funds).toBe(112_000);
    let paid = 0;
    for (let month = 0; month < 12; month++) {
      const expected = forecastBankMonth(c.bank);
      const before = c.funds;
      const closed = collectBudget(c);
      expect(closed.bankFlow).toEqual(expected);
      expect(closed.cashNet).toBeCloseTo(c.funds - before, 2);
      paid += closed.bankFlow.loanPayment;
    }
    expect(c.bank.loans).toHaveLength(0);
    expect(paid).toBeGreaterThan(12_000);
  });

  it('keeps bank payments outside the manual tax chest and respects credit and cash limits', () => {
    const c = city();
    c.collectsTaxes = true;
    expect(openInvestment(c, 200_000, 1)).toEqual({ ok: false, reason: 'funds' });
    expect(openLoan(c, BANK_MAX_DEBT, 1)).toEqual({ ok: true });
    expect(openLoan(c, 1_000, 1)).toEqual({ ok: false, reason: 'limit' });
    expect(outstandingDebt(c.bank)).toBe(BANK_MAX_DEBT);
    const before = c.funds;
    const report = collectBudget(c);
    expect(report.bankFlow.loanPayment).toBeGreaterThan(BANK_MAX_DEBT);
    expect(c.funds - before).toBeCloseTo(report.cashNet, 2);
    expect(c.uncollected).toBe(0);
  });

  it('sends an investment maturity directly to available funds with manual tax collection', () => {
    const c = city();
    c.collectsTaxes = true;
    openInvestment(c, 10_000, 1);
    const before = c.funds;
    const forecasted = forecast(c);
    const report = collectBudget(c);
    expect(report.bankFlow.investmentPrincipal).toBe(10_000);
    expect(report.bankFlow.investmentInterest).toBe(investmentValue(10_000, 1) - 10_000);
    expect(report.cashNet).toBeCloseTo(c.funds - before, 2);
    expect(forecasted.cashNet).toBeCloseTo(report.cashNet, 2);
    expect(c.uncollected).toBe(0);
  });

  it('persists active operations and opens older cities with an empty bank', () => {
    const c = city();
    openInvestment(c, 10_000, 4);
    openLoan(c, 20_000, 6);
    collectBudget(c);
    const saved = serialize(c, presetSettings('plains', 5, 64), 'Banco');
    const loaded = deserialize(parseSave(JSON.parse(JSON.stringify(saved))));
    expect(loaded.bank).toEqual(c.bank);
    expect(forecastBankMonth(loaded.bank)).toEqual(forecastBankMonth(c.bank));
    const old = deserialize(parseSave(JSON.parse(JSON.stringify({ ...saved, city: { ...saved.city, bank: undefined } }))));
    expect(old.bank.investments).toEqual([]);
    expect(old.bank.loans).toEqual([]);
  });
});
