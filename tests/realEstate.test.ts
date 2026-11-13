import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/City';
import { World } from '../src/sim/World';
import { BUILDINGS, Lifestyle, type BuildingId } from '../src/sim/buildings/catalog';
import { monthlyBudget } from '../src/sim/systems/budget';
import { livingCosts, defaultCostTaxRates } from '../src/sim/systems/livingCosts';
import { acquireProperty, financeProperty, initialProperty, privateRecoverProperty, propertyBills, repayPropertyLoan, settleProperties } from '../src/sim/systems/realEstate';
import { deserialize, parseSave, serialize } from '../src/sim/save';
import { presetSettings } from '../src/sim/terrain/presets';

function town(type: BuildingId = 'cottage', occupants: number = BUILDINGS[type].capacity) {
  const world = new World(64, 64, 1);
  const city = new City(world, 100_000);
  const home = world.addBuilding({ def: type, x: 2, y: 2, variant: 0, occupants }, BUILDINGS[type].size.w, BUILDINGS[type].size.h);
  home.powered = true; home.watered = true;
  const jobs = world.addBuilding({ def: 'factory', x: 20, y: 20, variant: 0, occupants: 10_000 }, 2, 2);
  jobs.powered = true; jobs.watered = true;
  return { city, world, home };
}

describe('building-based property economy', () => {
  it('shares rent across a full house without multiplying the property tax', () => {
    const { world, home } = town('cottage', 3);
    const rates = { ...defaultCostTaxRates(), housing: 2 };
    const bill = propertyBills(home, 2);
    expect(bill.rent).toBe(150);
    expect(bill.housingTax).toBe(3);
    expect(monthlyBudget(world, 0, 1100, 1200, rates).costBalances.housing.taxRevenue).toBe(3);
  });

  it('reports occupant-weighted rent and housing tax by residential class', () => {
    const { world } = town('cottage', 3);
    const apartment = world.addBuilding({ def: 'walkup', x: 6, y: 2, variant: 0, occupants: 10, lifestyle: Lifestyle.Comfortable }, 1, 1);
    apartment.powered = true; apartment.watered = true;
    const rates = { ...defaultCostTaxRates(), housing: 10 };
    const report = monthlyBudget(world, 0, 1100, 1200, rates);
    expect(report.housingByClass[Lifestyle.Basic]).toMatchObject({ residents: 3, rentPerResident: 50, taxPerResident: 5, paidPerResident: 55 });
    expect(report.housingByClass[Lifestyle.Comfortable]).toMatchObject({ residents: 10, rentPerResident: 60, taxPerResident: 6, paidPerResident: 66 });
    expect(report.housingByClass[Lifestyle.Prosperous].residents).toBe(0);
  });

  it('partially occupied homes charge the same total rent among fewer residents', () => {
    const { home } = town('apartment_block', 100);
    expect(propertyBills(home, 0).rent / home.occupants).toBe(10);
    home.occupants = 50;
    expect(propertyBills(home, 0).rent / home.occupants).toBe(20);
  });

  it('an empty building has fixed operating and common-area costs, but no household revenue', () => {
    const { world, home } = town('walkup', 0);
    const bill = propertyBills(home, 0);
    expect(bill.operatingCost).toBeGreaterThan(0);
    expect(bill.energy).toBeGreaterThan(0);
    const report = monthlyBudget(world);
    expect(report.costBalances.housing.taxRevenue).toBe(0);
    expect(report.propertyPayments.get(home.id)?.rent).toBe(0);
  });

  it('unemployed residents cannot invent income to pay rent', () => {
    const { world, home } = town('villa', 8);
    for (const b of world.buildings.values()) if (b !== home) b.occupants = 0;
    expect(monthlyBudget(world).propertyPayments.get(home.id)?.rent).toBeLessThan(propertyBills(home, 0).rent);
    const poor = livingCosts(0, defaultCostTaxRates(), { energy: true, water: true }, { food: 200, transport: 200, housing: 100, energy: 80, water: 60 });
    expect(poor.housingPaid + poor.utilityPaid).toBe(0);
  });

  it('pensioners pay bills with pensions and never owe income tax', () => {
    const { world } = town('townhouses', 10);
    const report = monthlyBudget(world, 0, 1100, 1200, defaultCostTaxRates(), 10);
    expect(report.seniors).toBeGreaterThan(0);
    expect(report.incomeTaxRevenue).toBe(report.employed * 120);
  });

  it('unavailable utilities are not billed', () => {
    const { world, home } = town('townhouses', 10);
    home.watered = false;
    expect(propertyBills(home, 0).water).toBe(0);
    expect(monthlyBudget(world).costBalances.water.residents).toBe(0);
    home.powered = false;
    expect(propertyBills(home, 0).energy).toBe(0);
    expect(monthlyBudget(world).costBalances.energy.residents).toBe(0);
  });

  it('empty-month losses consume reserves once and become debt', () => {
    const { world, home } = town('cottage', 0);
    const payment = new Map([[home.id, { rent: 0, surcharge: 0, operatingCost: 100 }]]);
    settleProperties(world, 1, payment);
    expect(home.property?.reserve).toBe(50);
    settleProperties(world, 1, payment);
    expect(home.property?.reserve).toBe(50);
    settleProperties(world, 2, payment);
    expect(home.property?.debt).toBe(50);
  });

  it('a public loan disburses immediately and uses fixed amortization with interest', () => {
    const { city, world, home } = town('cottage', 0);
    home.property = { ...initialProperty(home), debt: 10_000, delinquentMonths: 6, reserve: 0 };
    const before = city.funds;
    expect(financeProperty(city, home)).toBe(true);
    expect(city.funds).toBe(before - 10_000);
    expect(home.property.debt).toBe(0);
    expect(home.property.loan?.payment).toBeGreaterThan(10_000 / 24);
    const revenue = new Map([[home.id, { rent: 1_000, surcharge: 0, operatingCost: 0 }]]);
    const flows = settleProperties(world, 1, revenue);
    expect(flows.interest).toBeCloseTo(200);
    expect(flows.principal).toBeGreaterThan(0);
    expect(home.property.loan?.balance).toBeLessThan(10_000);
  });

  it('missed installments accrue without creating government revenue', () => {
    const { city, world, home } = town('cottage', 0);
    home.property = { ...initialProperty(home), debt: 1_000, delinquentMonths: 6, reserve: 0 };
    financeProperty(city, home);
    const flows = settleProperties(world, 1, new Map());
    expect(flows.principal + flows.interest).toBe(0);
    expect(home.property?.loan?.late).toBeGreaterThan(0);
    expect(home.property?.loan?.lateInterest).toBeGreaterThan(0);
  });

  it('early repayment transfers reserves to the city and removes the surcharge', () => {
    const { city, home } = town('cottage', 3);
    home.property = { ...initialProperty(home), debt: 1_000, delinquentMonths: 6, reserve: 0 };
    financeProperty(city, home);
    home.property.reserve = 2_000;
    const before = city.funds;
    expect(repayPropertyLoan(city, home)).toBe(true);
    expect(city.funds).toBe(before + 1_000);
    expect(home.property.loan).toBeNull();
    expect(propertyBills(home, 0).surcharge).toBe(0);
  });

  it('bankruptcy is gradual and gives acquisition or private recovery choices', () => {
    const { city, world, home } = town('cottage', 0);
    home.property = { ...initialProperty(home), reserve: 0 };
    const payment = new Map([[home.id, { rent: 0, surcharge: 0, operatingCost: 100 }]]);
    for (let month = 1; month <= 12; month++) {
      const flows = settleProperties(world, month, payment);
      if (month === 9) { expect(home.property?.status).toBe('critical'); expect(flows.milestones).toContainEqual({ id: home.id, months: 9 }); }
    }
    expect(home.property.status).toBe('bankrupt');
    expect(home.property.delinquentMonths).toBe(12);
    expect(world.buildings.has(home.id)).toBe(true);
    expect(acquireProperty(city, home)).toBe(true);
    expect(home.property.publicOwned).toBe(true);
    const other = town('cottage', 0).home;
    other.property = { ...initialProperty(other), debt: 100, status: 'bankrupt' };
    expect(privateRecoverProperty(other)).toBe(true);
    expect(other.property.status).toBe('recovery');
  });

  it('demolition clears only the building footprint', () => {
    const { world, home } = town('cottage', 0);
    const neighbour = world.addBuilding({ def: 'family_house', x: 5, y: 2, variant: 0 }, 1, 1);
    world.removeBuilding(home.id, 1, 1);
    expect(world.building[world.index(2, 2)]).toBe(-1);
    expect(world.buildings.has(neighbour.id)).toBe(true);
  });

  it('saves finance state and migrates old saves', () => {
    const { city, home } = town('cottage', 3);
    home.property = { ...initialProperty(home), debt: 500, delinquentMonths: 4 };
    const terrain = presetSettings('riverValley', 1, 64);
    const saved = serialize(city, terrain, 'Finance');
    const loaded = deserialize(parseSave(JSON.parse(JSON.stringify(saved))));
    expect([...loaded.world.buildings.values()][0].property?.debt).toBe(500);
    const old = deserialize(parseSave(JSON.parse(JSON.stringify({ ...saved, properties: undefined, city: { ...saved.city, propertyLedger: undefined } }))));
    expect([...old.world.buildings.values()][0].property).toBeUndefined();
  });

  it.each([12, 24, 60])('closes %i months exactly once', (months) => {
    const { world, home } = town('cottage', 0);
    home.property = { ...initialProperty(home), reserve: 0 };
    const payment = new Map([[home.id, { rent: 0, surcharge: 0, operatingCost: 1 }]]);
    for (let month = 1; month <= months; month++) { settleProperties(world, month, payment); settleProperties(world, month, payment); }
    expect(home.property.debt).toBe(months);
  });

  it('handles thousands of residents without per-person iteration', () => {
    const { world } = town('condo_tower', 260);
    for (let i = 0; i < 30; i++) {
      const b = world.addBuilding({ def: 'condo_tower', x: 1 + (i % 10) * 2, y: 30 + Math.floor(i / 10) * 2, variant: 0, occupants: 260, lifestyle: Lifestyle.Comfortable }, 2, 2);
      b.powered = true; b.watered = true;
    }
    const report = monthlyBudget(world);
    expect(report.workers + report.seniors).toBe(8_060);
    expect(report.propertyPayments.size).toBe(31);
  });
});
