import { describe, expect, it } from 'vitest';
import { monthlyBudget } from '../src/sim/systems/budget';
import { economyReport } from '../src/sim/systems/economy';
import { cityStats } from '../src/sim/systems/population';
import { demographics, societyDay } from '../src/sim/systems/society';
import { deserialize, parseSave, serialize } from '../src/sim/save';
import { presetSettings } from '../src/sim/terrain/presets';
import { street } from './support/street';

describe('sociedade e política salarial', () => {
  it('13% são idosos e os demais recebem salário; aposentadoria depende do benefício', () => {
    const t = street();
    const home = t.place('walkup', 4, 11);
    home.occupants = 20;
    const ages = demographics(20);
    expect(ages.seniors).toBe(3);
    expect(ages.adults).toBe(17);
    expect(ages.children + ages.youth + ages.adults + ages.seniors).toBe(20);
    expect(cityStats(t.world, t.city.taxRate, t.city.society).unemployed).toBeLessThan(20);
    const base = monthlyBudget(t.world, t.city.taxRate, 10).breakdown.pensions;
    expect(monthlyBudget(t.world, t.city.taxRate, 20).breakdown.pensions).toBe(base * 2);
    const economy = economyReport(t.world, t.city.taxRate, t.city);
    t.city.minimumWage = 500;
    expect(t.sim.budget.forecast().breakdown.pensions).toBe(ages.seniors * t.city.pensionPerSenior);
    expect(economyReport(t.world, t.city.taxRate, t.city).purchasingPower).toBeLessThan(economy.purchasingPower);
    t.city.pensionPerSenior = 25;
    t.city.costTaxRates.housing = 15;
    const saved = serialize(t.city, presetSettings('plains', 5, 64), 'Teste');
    const loaded = deserialize(parseSave(JSON.parse(JSON.stringify(saved))));
    expect(loaded.minimumWage).toBe(500);
    expect(loaded.pensionPerSenior).toBe(25);
    expect(loaded.costTaxRates.housing).toBe(15);
    const retiredFoodRate = JSON.parse(JSON.stringify(saved));
    retiredFoodRate.city.costTaxRates.food = 80;
    expect(Object.keys(deserialize(parseSave(retiredFoodRate)).costTaxRates)).not.toContain('food');
    expect(monthlyBudget(t.world, t.city.taxRate, loaded.pensionPerSenior).breakdown.pensions).toBe(ages.seniors * 25);
    const older = JSON.parse(JSON.stringify(saved));
    delete older.city.costTaxRates;
    delete older.city.pensionPerSenior;
    older.city.pensionShare = 0.2;
    expect(deserialize(parseSave(older)).pensionPerSenior).toBe(1_100);
    expect(deserialize(parseSave(older)).minimumWage).toBe(1_200);
  });

  it('doença pode causar morte e crimes sem vaga aumentam a pressão criminal', () => {
    const t = street();
    const home = t.place('walkup', 4, 11);
    home.occupants = 20;
    t.city.day = 1;
    societyDay(t.city, [{ type: 'started', kind: 'illness', building: home }], () => 0);
    expect(t.city.society.deaths).toBe(1);
    expect(home.occupants).toBe(19);
    societyDay(t.city, [{ type: 'missed', kind: 'theft', building: home }], () => 1);
    expect(t.city.society.prisonOverflow).toBe(1);
  });
});
