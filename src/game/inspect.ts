import { BALANCE } from '../shared/balance';
import { BUILDINGS, buildingDef, Lifestyle, LIFESTYLE_NAMES, SERVICE_KINDS, type BuildingDef, type BuildingInstance } from '../sim/buildings/catalog';
import type { Simulation } from '../sim/core/Simulation';
import { Stage } from '../sim/stages';
import { serviceBit } from '../sim/systems/coverage';
import { monthlyUpkeep } from '../sim/systems/budget';
import { riseBlocker } from '../sim/systems/lifestyle';
import { COMPLAINT_TEXT, NEED_KINDS } from '../sim/systems/needs';
import { isWorking, needsUtilities } from '../sim/systems/utilities';
import { platformOf, stationName } from '../sim/rail';
import type { InspectInfo } from './events';
import { propertyBills, propertyState } from '../sim/systems/realEstate';

/**
 * What the info panel shows for a building (app/hud/InfoPanel.tsx), read from the simulation.
 * Pure: the Game only decides which building is selected and when to send it.
 */
export function inspectInfo(sim: Simulation, b: BuildingInstance): InspectInfo {
  const d: BuildingDef = BUILDINGS[b.def];
  return {
    id: b.id,
    property: d.category === 'residential' ? (() => {
      const bill = propertyBills(b, sim.city.costTaxRates.housing);
      const p = propertyState(b);
      const count = Math.max(1, b.occupants);
      return { status: p.status, rent: bill.rent, rentPerResident: b.occupants ? bill.rent / count : 0, energyPerResident: b.occupants ? bill.energy / count : 0, waterPerResident: b.occupants ? bill.water / count : 0, housingTax: bill.housingTax, surchargePerResident: b.occupants ? bill.surcharge / count : 0, operatingCost: bill.operatingCost, lastRent: p.lastRent, lastResult: p.lastResult, debt: p.debt, reserve: p.reserve, delinquentMonths: p.delinquentMonths, publicOwned: p.publicOwned, loan: p.loan && { payment: p.loan.payment, balance: p.loan.balance, late: p.loan.late, lateInterest: p.loan.lateInterest, interestRate: p.loan.interestRate, months: p.loan.months, term: p.loan.term }, canFinance: p.debt > 0 && p.delinquentMonths >= BALANCE.propertyFinanceMonths && !p.loan && sim.city.funds >= p.debt, canAcquire: p.status === 'bankrupt' && !p.publicOwned && sim.city.funds >= p.debt + bill.rent * 12, canPrivateRecover: p.status === 'bankrupt' };
    })() : null,
    name: d.name,
    category: d.category,
    level: d.level,
    wealth: d.wealth ?? 'everyday',
    investorValue: d.investorValue ?? 0,
    description: d.description,
    occupants: b.occupants,
    capacity: d.capacity,
    occupantLabel: d.category === 'residential' ? 'Moradores' : 'Trabalhadores',
    hasRoad: b.entrance !== -1,
    size: d.size,
    grown: b.grown,
    constructionDays: b.construction,
    needsUtilities: needsUtilities(d),
    powered: b.powered,
    watered: b.watered,
    services: d.category === 'civic' ? [] : SERVICE_KINDS.filter((k) => b.services & serviceBit(k)),
    provides: d.service
      ? { kind: 'service', service: d.service, radius: d.radius ?? 0 }
      : d.supplies || d.energy || d.substation
        ? {
            kind: 'utility',
            ...d.supplies,
            coverage: d.supplies?.water ? d.radius : (d.energy?.coverage ?? d.substation?.radius),
            condition: d.energy && d.energy.source !== 'battery' ? b.condition : undefined,
            repairCost: d.energy?.repairCost,
          }
        : null,
    powerIssue: powerIssue(sim, b),
    condition: d.energy && d.energy.source !== 'battery' ? b.condition : null,
    repairDays: b.repairDays,
    repairCost: d.energy?.repairCost ?? 0,
    upkeep: monthlyUpkeep(sim.world, b),
    commuteMinutes: d.category === 'residential' ? (sim.commute.commuteMinutes.get(b.id) ?? null) : null,
    needs: needsInfo(sim, b.id),
    abandoned: b.abandoned,
    lifestyle: d.category === 'residential' ? lifestyleInfo(b, sim.city.stage) : null,
    garbage: d.category !== 'civic' && sim.city.stage >= Stage.Village ? b.garbage : null,
    facility: d.garbage
      ? {
          collectedToday: sim.garbage.collectedToday.get(b.id) ?? 0,
          trucks: d.garbage.trucks,
          filled: d.garbage.holds === undefined ? null : b.filled,
          holds: d.garbage.holds ?? null,
        }
      : null,
    busStation: d.busStation
      ? {
          riders: Math.round(sim.commute.busStationRiders.get(b.id) ?? 0),
          out: sim.traffic.traffic.fleetOut(b.entrance),
          fleet: d.busStation.fleet,
          reach: d.busStation.reach,
        }
      : null,
    aqi: Math.round(sim.air.aqiOf(b)),
    taxesWaiting: b.def === 'town_hall' && sim.city.collectsTaxes ? Math.round(sim.city.uncollected) : null,
    station: d.railStation
      ? {
          name: `Estação ${stationName(b.id)}`,
          riders: Math.round(sim.commute.stationRiders.get(b.id) ?? 0),
          onTrack: platformOf(sim.world, b) !== -1,
          lines: sim.trains.linesAt(b.id).map((l) => ({
            trains: l.trains,
            stops: l.stops.map((id) => ({ name: stationName(id), riders: Math.round(sim.commute.stationRiders.get(id) ?? 0), here: id === b.id })),
          })),
        }
      : null,
  };
}

/** A home's lifestyle tier and, in plain words, what moves it next. */
function lifestyleInfo(b: BuildingInstance, stage: Stage): InspectInfo['lifestyle'] {
  const tier = LIFESTYLE_NAMES[b.lifestyle];
  const days = BALANCE.lifeDays;
  if (b.lifeDays > 0) return { tier, note: `Melhorando: ${b.lifeDays} / ${days} dias felizes` };
  if (b.lifeDays < 0) return { tier, note: `Piorando: ${-b.lifeDays} / ${days} dias infelizes` };
  if (b.lifestyle === Lifestyle.Prosperous) return { tier, note: 'O melhor padrão de vida da cidade' };
  const blocker = riseBlocker(b, stage);
  if (blocker) return { tier, note: `Para melhorar, precisa de ${blocker}` };
  return { tier, note: `Melhora após ${days} dias com felicidade de ${Math.round(BALANCE.lifeUpLine * 100)}% ou mais` };
}

function needsInfo(sim: Simulation, id: number): InspectInfo['needs'] {
  const n = sim.needs.byBuilding.get(id);
  if (!n) return null;
  return {
    happiness: n.happiness,
    scores: NEED_KINDS.flatMap((kind) => {
      const score = n.scores[kind];
      return score === undefined ? [] : [{ kind, score }];
    }),
    complaint: n.complaint ? COMPLAINT_TEXT[n.complaint] : null,
  };
}

/** Why a building has no power, with the numbers behind it. */
function powerIssue(sim: Simulation, b: BuildingInstance): InspectInfo['powerIssue'] {
  const d: BuildingDef = buildingDef(b.def);
  if (d.category === 'civic' || b.powered) return null;
  if (b.entrance === -1) return { reason: 'Sem acesso viário', stats: [{ label: 'Necessário', value: 'Uma via conectada a até 3 quadrados' }] };
  const report = sim.utilities.report.power;
  const substations = [...sim.world.buildings.values()].filter((s) => buildingDef(s.def).substation && isWorking(s));
  if (substations.length > 0) {
    const connected = substations.some((s) => {
      const sd = buildingDef(s.def).substation;
      const cx = b.x + d.size.w / 2;
      const cy = b.y + d.size.h / 2;
      return sd !== undefined && Math.hypot(s.x + 0.5 - cx, s.y + 0.5 - cy) <= sd.radius;
    });
    if (!connected) {
      return {
        reason: 'Fora da área da subestação',
        stats: [{ label: 'Cobertura', value: 'Construa perto de uma subestação conectada à rede' }],
      };
    }
  }
  return {
    reason: report.supply < report.demand ? 'Geração insuficiente' : 'Energia já usada por outros edifícios',
    stats: [
      { label: 'Demanda', value: report.demand.toLocaleString() },
      { label: 'Disponível', value: report.supply.toLocaleString() },
      { label: 'Falta', value: report.short.toLocaleString() },
    ],
  };
}
