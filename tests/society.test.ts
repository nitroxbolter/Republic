import { describe, expect, it } from 'vitest';
import { monthlyBudget } from '../src/sim/systems/budget';
import { cityStats } from '../src/sim/systems/population';
import { demographics, societyDay } from '../src/sim/systems/society';
import { street } from './support/street';

describe('sociedade e política salarial', () => {
  it('crianças e idosos não compõem a força de trabalho; aposentadorias acompanham o salário mínimo', () => {
    const t = street();
    const home = t.place('walkup', 4, 11);
    home.occupants = 20;
    const ages = demographics(20);
    expect(ages.children + ages.youth + ages.adults + ages.seniors).toBe(20);
    expect(cityStats(t.world, t.city.taxRate, t.city.society).unemployed).toBeLessThan(20);
    const base = monthlyBudget(t.world, t.city.taxRate, 100).breakdown.pensions;
    expect(monthlyBudget(t.world, t.city.taxRate, 200).breakdown.pensions).toBe(base * 2);
    expect(monthlyBudget(t.world, t.city.taxRate, 100, 0.2).breakdown.pensions).toBe(base * 2);
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
