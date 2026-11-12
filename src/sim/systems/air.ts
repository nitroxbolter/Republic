import { BUILDINGS, type BuildingDef, type BuildingId, type BuildingInstance } from '../buildings/catalog';
import type { SimSystem } from '../core/System';
import { RoadType } from '../roads';
import type { World } from '../World';
import { isActive } from './access';
import { NO_TECH, type TechEffects } from '../research';

/**
 * Air quality (docs/specs/evolution.md, E4): a coarse field, one cell per CELL × CELL tiles,
 * rebuilt from today's sources (industry, fossil power, incinerators, landfills and road
 * traffic) each day and after edits. Emissions are summed per cell and blurred so smoke drifts
 * about three cells; the result reads as the familiar 0–500 AQI. No memory, so nothing to save.
 */

/** Tiles per field cell, each way. */
export const AIR_CELL = 4;

/** Daily emission of each polluting building (scaled by how busy it is for industry). A coal plant is the dirtiest thing in town. */
const EMITTERS: Readonly<Partial<Record<BuildingId, number>>> = {
  workshop: 0.25,
  warehouse: 0.35,
  factory: 0.7,
  power_plant: 2.4,
  gas_plant: 1.2,
  incinerator: 2,
  landfill: 0.5,
};
/** Emission per commuter a day crossing a road tile (0.05 per 1,000: a busy downtown reads Moderate). */
const TRAFFIC_EMISSION = 0.05 / 1000;
/** Box-blur passes (each spreads smoke one more cell): two keeps a source's own block dirtiest. */
const BLUR_PASSES = 2;
/** AQI = BACKGROUND + SCALE × concentration, capped at MAX_AQI. */
const BACKGROUND = 15;
const SCALE = 260;
export const MAX_AQI = 500;

/** The six AQI bands, worst last. */
export const AQI_BANDS = [
  { upTo: 50, label: 'Boa', color: 0x22c55e },
  { upTo: 100, label: 'Moderada', color: 0xfacc15 },
  { upTo: 150, label: 'Ruim para alguns', color: 0xfb923c },
  { upTo: 200, label: 'Ruim', color: 0xef4444 },
  { upTo: 300, label: 'Muito ruim', color: 0xa855f7 },
  { upTo: Infinity, label: 'Perigosa', color: 0x7f1d1d },
] as const;

export function aqiBand(aqi: number): (typeof AQI_BANDS)[number] {
  return AQI_BANDS.find((b) => aqi <= b.upTo) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** The clean-air need from the AQI: 1 up to 50, falling to 0 at 200. */
export function airScore(aqi: number): number {
  return Math.max(0, Math.min(1, 1 - (aqi - 50) / 150));
}

/** Something that commutes over the roads each day (sim/systems/commute.ts). */
export interface TrafficVolume {
  readonly volume: Float32Array;
}

export interface AirReport {
  /** Residents' average AQI (the map's average before anyone lives here). */
  cityAqi: number;
  /** The worst cell's AQI. */
  worstAqi: number;
}

export class AirSystem implements SimSystem {
  readonly name = 'air';
  /** AQI per cell, row by row (cols × rows). */
  readonly aqi: Float32Array;
  readonly cols: number;
  readonly rows: number;
  report: AirReport = { cityAqi: BACKGROUND, worstAqi: BACKGROUND };
  private readonly world: World;
  private readonly traffic: TrafficVolume | null;
  private readonly field: Float32Array;
  /** Research that cleans the air (sim/research.ts). */
  private readonly effects: () => TechEffects;
  private readonly scratch: Float32Array;

  constructor(world: World, traffic: TrafficVolume | null = null, effects: () => TechEffects = () => NO_TECH) {
    this.world = world;
    this.traffic = traffic;
    this.effects = effects;
    this.cols = Math.ceil(world.width / AIR_CELL);
    this.rows = Math.ceil(world.height / AIR_CELL);
    this.aqi = new Float32Array(this.cols * this.rows).fill(BACKGROUND);
    this.field = new Float32Array(this.cols * this.rows);
    this.scratch = new Float32Array(this.cols * this.rows);
  }

  onWorldChanged() {
    this.compute();
  }

  onDay() {
    this.compute();
  }

  /** AQI at a world tile. */
  aqiAt(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / AIR_CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / AIR_CELL)));
    return this.aqi[cy * this.cols + cx];
  }

  /** AQI at a building's footprint centre. */
  aqiOf(b: BuildingInstance): number {
    const { w, h } = BUILDINGS[b.def].size;
    return this.aqiAt(b.x + Math.floor(w / 2), b.y + Math.floor(h / 2));
  }

  compute() {
    const w = this.world;
    const f = this.field;
    f.fill(0);
    const fx = this.effects();
    const cell = (x: number, y: number) => Math.floor(y / AIR_CELL) * this.cols + Math.floor(x / AIR_CELL);

    for (const b of w.buildings.values()) {
      const base = EMITTERS[b.def];
      if (base === undefined || !isActive(b) || b.abandoned) continue;
      const d: BuildingDef = BUILDINGS[b.def];
      // Industry pollutes more the busier it is; plants and dumps run regardless.
      const busy = d.category === 'industrial' ? 0.4 + 0.6 * (d.capacity === 0 ? 0 : Math.min(1, b.occupants / d.capacity)) : 1;
      const cleaner = d.category === 'industrial' ? fx.industrySmoke : b.def === 'power_plant' || b.def === 'gas_plant' ? fx.fossilSmoke : 1;
      const perTile = (base * busy * cleaner) / (d.size.w * d.size.h);
      for (let y = b.y; y < b.y + d.size.h; y++) for (let x = b.x; x < b.x + d.size.w; x++) f[cell(x, y)] += perTile;
    }
    if (this.traffic) {
      const v = this.traffic.volume;
      for (let i = 0; i < w.road.length; i++) {
        if (w.road[i] === RoadType.None || v[i] === 0) continue;
        const x = i % w.width;
        f[cell(x, (i - x) / w.width)] += v[i] * TRAFFIC_EMISSION;
      }
    }

    for (let pass = 0; pass < BLUR_PASSES; pass++) this.blur();

    let worst = 0;
    for (let k = 0; k < f.length; k++) {
      const aqi = Math.min(MAX_AQI, BACKGROUND + SCALE * f[k]);
      this.aqi[k] = aqi;
      if (aqi > worst) worst = aqi;
    }

    let people = 0;
    let weighted = 0;
    let mapSum = 0;
    for (const v of this.aqi) mapSum += v;
    for (const b of w.buildings.values()) {
      if (BUILDINGS[b.def].category !== 'residential' || b.occupants === 0 || b.abandoned) continue;
      people += b.occupants;
      weighted += b.occupants * this.aqiOf(b);
    }
    this.report = { cityAqi: people === 0 ? mapSum / this.aqi.length : weighted / people, worstAqi: worst };
  }

  /** One 3×3 box blur of the field (edges average over the cells that exist). */
  private blur() {
    const { cols, rows, field: f, scratch: s } = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            sum += f[yy * cols + xx];
            n++;
          }
        }
        s[y * cols + x] = sum / n;
      }
    }
    f.set(s);
  }
}
