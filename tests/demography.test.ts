import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/buildings/catalog';
import { City } from '../src/sim/City';
import { World } from '../src/sim/World';
import { advanceDemographicPolicy, closeDemographicMonth, demographicBirthDay, demographicMonthlyCost, demographicReport, infrastructurePressure } from '../src/sim/systems/demography';
import { simulateDay } from '../src/sim/systems/population';
import { diagnoseLot, zoneDemand } from '../src/sim/systems/growth';
import { ZoneType } from '../src/sim/zones';
import { street } from './support/street';
import { deserialize, parseSave, serialize } from '../src/sim/save';
import { presetSettings } from '../src/sim/terrain/presets';
import { collectBudget, monthlyBudget } from '../src/sim/systems/budget';
import { societyDay } from '../src/sim/systems/society';
import { Stage } from '../src/sim/stages';
import { SERVICE_KINDS } from '../src/sim/buildings/catalog';

function cityWithVacantTower() {
  const city = new City(new World(64, 64, 10), 100_000);
  const home = city.world.addBuilding({ def: 'condo_tower', x: 2, y: 2, variant: 0, occupants: 0 }, 2, 2);
  home.entrance = 0; home.powered = true; home.watered = true;
  return { city, home };
}

describe('demographic policy', () => {
  it('available homes keep filling without any jobs', () => {
    const { city, home } = cityWithVacantTower();
    for (let day = 0; day < 45; day++) simulateDay(city.world, city.taxRate, city.society, city);
    expect(home.occupants).toBeGreaterThan(170);
    expect(city.demography.monthImmigration).toBeGreaterThan(170);
    expect(zoneDemand(city.world, city.taxRate, city).r).toBeGreaterThan(0);
  });

  it('a mature city without hospital coverage stops immigration and has more deaths', () => {
    const untreated = cityWithVacantTower();
    const covered = cityWithVacantTower();
    untreated.city.stage = Stage.Town; covered.city.stage = Stage.Town;
    untreated.home.occupants = 200; covered.home.occupants = 200;
    covered.home.services |= 1 << SERVICE_KINDS.indexOf('hospital');
    simulateDay(untreated.city.world, 9, untreated.city.society, untreated.city);
    simulateDay(covered.city.world, 9, covered.city.society, covered.city);
    expect(untreated.home.occupants).toBe(200);
    expect(covered.home.occupants).toBeGreaterThan(200);
    for (let day = 1; day <= 360; day++) {
      untreated.city.day = day; covered.city.day = day;
      societyDay(untreated.city, [], () => 1);
      societyDay(covered.city, [], () => 1);
    }
    expect(untreated.city.society.deaths).toBeGreaterThan(covered.city.society.deaths);
  });

  it('extreme business or household taxes stop new arrivals without expelling residents', () => {
    const { city, home } = cityWithVacantTower();
    home.occupants = 100;
    simulateDay(city.world, 100, city.society, city);
    expect(home.occupants).toBe(100);
    city.costTaxRates = { energy: 100, water: 100, housing: 100, transport: 100 };
    simulateDay(city.world, 9, city.society, city);
    expect(home.occupants).toBe(100);
    city.costTaxRates = { energy: 0, water: 0, housing: 0, transport: 0 };
    simulateDay(city.world, 9, city.society, city);
    expect(home.occupants).toBeGreaterThan(100);
  });
  it('stimulus speeds immigration gradually and charges the existing budget', () => {
    const balanced = cityWithVacantTower();
    const stimulated = cityWithVacantTower();
    stimulated.city.demography.strategy = 'stimulate';
    stimulated.city.demography.incentiveLevel = 1;
    simulateDay(balanced.city.world, 9, balanced.city.society, balanced.city);
    simulateDay(stimulated.city.world, 9, stimulated.city.society, stimulated.city);
    expect(stimulated.home.occupants).toBeGreaterThan(balanced.home.occupants);
    expect(stimulated.city.demography.monthImmigration).toBe(stimulated.home.occupants);
    expect(demographicMonthlyCost(stimulated.city)).toBeGreaterThan(0);
    expect(monthlyBudget(stimulated.city.world, 9, 1100, 1200, stimulated.city.costTaxRates, 0, stimulated.city.society, stimulated.city).breakdown.demographicIncentives).toBeGreaterThan(0);
  });

  it('balanced growth follows natural attraction and does not change existing residents', () => {
    const { city, home } = cityWithVacantTower();
    home.occupants = 100;
    const previous = home.occupants;
    city.demography.strategy = 'balanced';
    city.demography.incentiveLevel = 0;
    simulateDay(city.world, 9, city.society, city);
    expect(home.occupants).toBeGreaterThanOrEqual(previous);
    expect(demographicMonthlyCost(city)).toBe(0);
  });

  it('slowing growth preserves residents while reducing new arrivals', () => {
    const balanced = cityWithVacantTower();
    const slow = cityWithVacantTower();
    slow.city.demography.strategy = 'slow'; slow.city.demography.slowLevel = 1;
    simulateDay(balanced.city.world, 9, balanced.city.society, balanced.city);
    simulateDay(slow.city.world, 9, slow.city.society, slow.city);
    expect(slow.home.occupants).toBeGreaterThan(0);
    expect(slow.home.occupants).toBeLessThan(balanced.home.occupants);
    const occupied = slow.home.occupants;
    simulateDay(slow.city.world, 9, slow.city.society, slow.city);
    expect(slow.home.occupants).toBeGreaterThanOrEqual(occupied);
  });

  it('a service crisis creates warnings and reduces the affordable incentive level', () => {
    const { city, home } = cityWithVacantTower();
    home.occupants = 200;
    home.watered = false; home.powered = false;
    const pressure = infrastructurePressure(city);
    expect(pressure.alerts).toContain('Abastecimento de água insuficiente');
    expect(pressure.alerts).toContain('Abastecimento de energia insuficiente');
    city.day = 31; city.demography.strategy = 'stimulate'; city.demography.annualTarget = 10;
    advanceDemographicPolicy(city);
    expect(city.demography.incentiveLevel).toBeLessThan(0.25);
  });

  it('suspending incentives fades them out without blocking natural migration', () => {
    const { city, home } = cityWithVacantTower();
    city.demography.strategy = 'stimulate'; city.demography.incentiveLevel = 1; city.demography.incentivesEnabled = false;
    city.day = 31;
    advanceDemographicPolicy(city);
    expect(city.demography.incentiveLevel).toBe(0.75);
    expect(demographicMonthlyCost(city)).toBe(0);
    simulateDay(city.world, 9, city.society, city);
    expect(home.occupants).toBeGreaterThan(0);
  });

  it('monthly permits explain why a zoned lot is waiting and reset next month', () => {
    const t = street();
    t.world.zone[t.world.index(5, 11)] = ZoneType.Residential;
    t.city.demography.permitLimits.r = 0;
    expect(diagnoseLot(t.city, 5, 11)?.reason).toBe('permitLimit');
    t.city.demography.permitLimits.r = 1;
    t.city.demography.permitUsed.r = 1;
    expect(diagnoseLot(t.city, 5, 11)?.reason).toBe('permitLimit');
    t.city.day = 31;
    advanceDemographicPolicy(t.city);
    expect(t.city.demography.permitUsed.r).toBe(0);
  });

  it('housing subsidies reduce tenant rent and cost the government once', () => {
    const { city, home } = cityWithVacantTower();
    home.occupants = 100;
    const unsubsidized = monthlyBudget(city.world, 9, 1100, 1200, city.costTaxRates, 0, city.society, city);
    city.demography.housingSubsidy = 0.2;
    const baseline = monthlyBudget(city.world, 9, 1100, 1200, city.costTaxRates, 0, city.society, city);
    expect(baseline.breakdown.housingSubsidies).toBe(BUILDINGS.condo_tower.capacity ? 500 : 0);
    expect(baseline.costBalances.housing.nominalBase).toBe(2000);
    expect(baseline.expenses - unsubsidized.expenses).toBe(500);
    city.collectsTaxes = true;
    const before = city.funds;
    const closed = collectBudget(city);
    expect(closed.breakdown.housingSubsidies).toBe(500);
    expect(closed.cashNet).toBe(city.funds - before);
    expect(closed.cashNet).toBe(-closed.expenses);
  });

  it('natural births occupy vacancies, then monthly counters close', () => {
    const { city, home } = cityWithVacantTower();
    home.occupants = 200;
    city.demography.birthCarry = 0.999;
    demographicBirthDay(city);
    expect(home.occupants).toBe(201);
    expect(city.demography.monthBirths).toBe(1);
    closeDemographicMonth(city);
    expect(demographicReport(city).lastBirths).toBe(1);
    expect(city.demography.monthBirths).toBe(0);
  });

  it('policy settings and counters survive reload; old saves use balanced defaults', () => {
    const { city } = cityWithVacantTower();
    city.demography.strategy = 'slow'; city.demography.annualTarget = 4.5; city.demography.permitLimits.r = 2; city.demography.monthImmigration = 15; city.demography.monthConstructionGrants = 123;
    const terrain = presetSettings('riverValley', 10, 64);
    const saved = serialize(city, terrain, 'Policy');
    const loaded = deserialize(parseSave(JSON.parse(JSON.stringify(saved))));
    expect(loaded.demography.strategy).toBe('slow');
    expect(loaded.demography.permitLimits.r).toBe(2);
    expect(loaded.demography.monthImmigration).toBe(15);
    expect(loaded.demography.monthConstructionGrants).toBe(123);
    const old = deserialize(parseSave(JSON.parse(JSON.stringify({ ...saved, city: { ...saved.city, demography: undefined } }))));
    expect(old.demography.strategy).toBe('balanced');
    expect(old.demography.monthConstructionGrants).toBe(0);
  });
});
