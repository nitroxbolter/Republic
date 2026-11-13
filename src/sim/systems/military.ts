import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingId } from '../buildings/catalog';
import type { City } from '../City';

export type MilitaryVehicle = 'patrol' | 'transport' | 'armored' | 'helicopter';
export type MilitaryPurchase = MilitaryVehicle | 'rifles' | 'ammunition' | 'supplies';

export interface MilitaryState {
  soldiers: number;
  vehicles: Record<MilitaryVehicle, number>;
  rifles: number;
  ammunition: number;
  supplies: number;
}

export interface MilitaryCapacities {
  soldiers: number;
  vehicles: number;
  rifles: number;
  ammunition: number;
  supplies: number;
  barracks: number;
  garages: number;
  armories: number;
  depots: number;
  commandCenters: number;
}

export interface MilitaryReport {
  inventory: MilitaryState;
  capacity: MilitaryCapacities;
  monthlyPayroll: number;
  enlistmentCost: number;
  commandAvailable: boolean;
}

export type MilitaryActionResult =
  | { ok: true; cost: number; quantity: number }
  | { ok: false; reason: 'command' | 'facility' | 'capacity' | 'funds' | 'equipment' | 'quantity' };

export function emptyMilitary(): MilitaryState {
  return { soldiers: 0, vehicles: { patrol: 0, transport: 0, armored: 0, helicopter: 0 }, rifles: 0, ammunition: 0, supplies: 0 };
}

function facilities(city: City, id: BuildingId) {
  return [...city.world.buildings.values()].filter((b) => b.def === id && b.construction === 0);
}

export function militaryCapacities(city: City): MilitaryCapacities {
  const barracks = facilities(city, 'barracks');
  const bases = facilities(city, 'military_base');
  const garages = facilities(city, 'military_garage');
  const armories = facilities(city, 'armory');
  const depots = facilities(city, 'military_depot');
  return {
    soldiers: [...barracks, ...bases].reduce((sum, b) => sum + BUILDINGS[b.def].capacity, 0),
    vehicles: garages.reduce((sum, b) => sum + BUILDINGS[b.def].capacity, 0),
    rifles: armories.length * BALANCE.military.riflesPerArmory,
    ammunition: armories.length * BALANCE.military.ammoPerArmory,
    supplies: depots.length * BALANCE.military.suppliesPerDepot,
    barracks: barracks.length,
    garages: garages.length,
    armories: armories.length,
    depots: depots.length,
    commandCenters: bases.length,
  };
}

export function militaryReport(city: City): MilitaryReport {
  const capacity = militaryCapacities(city);
  return {
    inventory: city.military,
    capacity,
    monthlyPayroll: city.military.soldiers * BALANCE.military.monthlySoldierPay,
    enlistmentCost: BALANCE.military.enlistmentCost,
    commandAvailable: capacity.commandCenters > 0,
  };
}

export function militaryMonthlyPayroll(city: City): number {
  return Math.round(city.military.soldiers * BALANCE.military.monthlySoldierPay);
}

function quantityIsValid(quantity: number) {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10_000;
}

export function enlistSoldiers(city: City, quantity: number): MilitaryActionResult {
  if (!quantityIsValid(quantity)) return { ok: false, reason: 'quantity' };
  const capacity = militaryCapacities(city);
  if (!capacity.commandCenters) return { ok: false, reason: 'command' };
  if (!capacity.soldiers) return { ok: false, reason: 'facility' };
  if (city.military.soldiers + quantity > capacity.soldiers) return { ok: false, reason: 'capacity' };
  if (city.military.rifles < quantity || city.military.ammunition < quantity * BALANCE.military.roundsPerSoldier) return { ok: false, reason: 'equipment' };
  const cost = quantity * BALANCE.military.enlistmentCost;
  if (city.funds < cost) return { ok: false, reason: 'funds' };
  city.funds -= cost;
  city.military.soldiers += quantity;
  city.military.rifles -= quantity;
  city.military.ammunition -= quantity * BALANCE.military.roundsPerSoldier;
  return { ok: true, cost, quantity };
}

const VEHICLE_FACILITY: Readonly<Record<MilitaryVehicle, BuildingId>> = {
  patrol: 'military_garage',
  transport: 'military_garage',
  armored: 'military_garage',
  helicopter: 'military_garage',
};

export function purchaseMilitary(city: City, item: MilitaryPurchase, quantity: number): MilitaryActionResult {
  if (!quantityIsValid(quantity)) return { ok: false, reason: 'quantity' };
  const capacity = militaryCapacities(city);
  if (!capacity.commandCenters) return { ok: false, reason: 'command' };

  let cost: number;
  if (item in VEHICLE_FACILITY) {
    if (!facilities(city, VEHICLE_FACILITY[item as MilitaryVehicle]).length) return { ok: false, reason: 'facility' };
    const stored = Object.values(city.military.vehicles).reduce((sum, count) => sum + count, 0);
    if (stored + quantity > capacity.vehicles) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.vehicleCosts[item as MilitaryVehicle] * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.vehicles[item as MilitaryVehicle] += quantity;
  } else if (item === 'rifles') {
    if (!capacity.armories) return { ok: false, reason: 'facility' };
    if (city.military.rifles + quantity > capacity.rifles) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.rifleCost * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.rifles += quantity;
  } else if (item === 'ammunition') {
    if (!capacity.armories) return { ok: false, reason: 'facility' };
    const rounds = quantity * BALANCE.military.roundsPerAmmoCrate;
    if (city.military.ammunition + rounds > capacity.ammunition) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.ammoCrateCost * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.ammunition += rounds;
  } else {
    if (!capacity.depots) return { ok: false, reason: 'facility' };
    const supplies = quantity * BALANCE.military.suppliesPerCrate;
    if (city.military.supplies + supplies > capacity.supplies) return { ok: false, reason: 'capacity' };
    cost = BALANCE.military.supplyCrateCost * quantity;
    if (city.funds < cost) return { ok: false, reason: 'funds' };
    city.military.supplies += supplies;
  }

  city.funds -= cost;
  return { ok: true, cost, quantity };
}
