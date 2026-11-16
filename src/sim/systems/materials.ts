import { BALANCE } from '../../shared/balance';
import { BUILDINGS, type BuildingDef, type BuildingId } from '../buildings/catalog';
import type { City } from '../City';
import type { SimSystem } from '../core/System';
import { isActive } from './access';
import { techEffects } from '../research';

/**
 * Construction materials (docs/specs/evolution.md, E6): industry makes them, growth and
 * upgrades use them, imports fill gaps at a price, and surplus over storage is exported.
 * Only in cities that need materials (`City.needsMaterials`); others build freely.
 */

/** Tons a zoned building needs to be built (1% of its price). */
export function materialsFor(id: BuildingId): number {
  return BUILDINGS[id].cost * BALANCE.materialsPerCost;
}

/** What growth draws on: the city's stock, topped up by imports when short. */
export interface MaterialStock {
  /** Take `tons` for a construction; false (and nothing taken) if they can't be had today. */
  take(tons: number): boolean;
}

/** A stock that never runs out (cities that build freely). */
export const UNLIMITED: MaterialStock = { take: () => true };

export interface MaterialsReport {
  stock: number;
  storage: number;
  /** Today's flows, in tons. */
  made: number;
  imported: number;
  used: number;
  exported: number;
  /** Constructions that waited today for want of materials. */
  waiting: number;
  /** Money spent on imports and earned by exports today. */
  importCost: number;
  exportIncome: number;
}

const emptyReport = (): MaterialsReport => ({ stock: 0, storage: 0, made: 0, imported: 0, used: 0, exported: 0, waiting: 0, importCost: 0, exportIncome: 0 });

/** Storage: a base yard plus each working warehouse. */
export function materialStorage(city: City): number {
  let storage = BALANCE.materialsStorage;
  for (const b of city.world.buildings.values()) if (b.def === 'warehouse' && isActive(b) && !b.abandoned) storage += BALANCE.materialsPerWarehouse;
  return storage;
}

export class MaterialsSystem implements SimSystem {
  readonly name = 'materials';
  report: MaterialsReport = emptyReport();
  private readonly city: City;
  private importedToday = 0;

  constructor(city: City) {
    this.city = city;
  }

  /** The stock growth draws on today (UNLIMITED in cities that build freely). */
  get stock(): MaterialStock {
    if (!this.city.needsMaterials) return UNLIMITED;
    return {
      take: (needed) => {
        const c = this.city;
        const tons = needed * techEffects(c).materials;
        const short = Math.max(0, tons - c.materials);
        if (short > BALANCE.materialsImportPerDay - this.importedToday) {
          this.report.waiting++;
          return false;
        }
        if (short > 0) {
          const cost = short * BALANCE.materialsImportPrice;
          this.importedToday += short;
          c.materials += short;
          c.funds -= cost;
          c.materialTrade.importCost += cost;
          this.report.imported += short;
          this.report.importCost += cost;
        }
        c.materials -= tons;
        this.report.used += tons;
        return true;
      },
    };
  }

  /** Before growth: today's production arrives, and anything over storage is exported. */
  onDay() {
    const c = this.city;
    this.report = emptyReport();
    this.importedToday = 0;
    if (!c.needsMaterials) return;
    let made = 0;
    for (const b of c.world.buildings.values()) {
      const d: BuildingDef = BUILDINGS[b.def];
      if (d.category === 'industrial' && isActive(b) && !b.abandoned) made += b.occupants * BALANCE.materialsPerWorker;
    }
    const storage = materialStorage(c);
    c.materials += made;
    const exported = Math.max(0, c.materials - storage);
    c.materials -= exported;
    const income = exported * BALANCE.materialsExportPrice;
    c.funds += income;
    c.materialTrade.exportIncome += income;
    this.report = { ...this.report, stock: c.materials, storage, made, exported, exportIncome: income };
  }

  /** After growth: today's closing stock. */
  afterGrowth() {
    this.report.stock = this.city.materials;
  }
}
