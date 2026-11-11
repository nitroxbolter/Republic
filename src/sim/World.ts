import { Lifestyle, type BuildingInstance, type NewBuilding } from './buildings/catalog';

/**
 * The whole map state as struct-of-arrays layers. Tile index is `y * width + x`.
 * See docs/02-architecture.md, "Data Model".
 */
export class World {
  readonly width: number;
  readonly height: number;
  readonly seed: number;

  readonly terrain: Uint8Array;
  readonly elevation: Uint8Array;
  readonly variant: Uint8Array;
  readonly tree: Uint8Array;
  readonly decor: Uint8Array;
  readonly road: Uint8Array;
  /** Bridge axis for road tiles over water (see sim/roads.ts BridgeAxis). */
  readonly bridge: Uint8Array;
  /** One-way carriageways (boulevards, expressways): travel direction + 1, or 0 (sim/roads.ts laneDir). */
  readonly lane: Uint8Array;
  /** Pavement style of a road's footpaths: 0 = the road type's default, else style + 1 (cosmetic). */
  readonly pave: Uint8Array;
  readonly zone: Uint8Array;
  /** Rail track (sim/rail.ts): 0 none, 1 track on land, 2 track on a bridge over water. */
  readonly rail: Uint8Array;
  /**
   * Flyovers (docs/specs/transport.md, TX2): the road type carried over this tile on a raised
   * deck (0 none), and the axis it runs along (1 x, 2 y). The ground road (`road`) runs across it.
   */
  readonly over: Uint8Array;
  readonly overAxis: Uint8Array;
  /** Building instance id covering each tile, −1 if none. */
  readonly building: Int32Array;
  readonly buildings = new Map<number, BuildingInstance>();
  private nextBuildingId = 1;

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    const n = width * height;
    this.terrain = new Uint8Array(n);
    this.elevation = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.tree = new Uint8Array(n);
    this.decor = new Uint8Array(n);
    this.road = new Uint8Array(n);
    this.bridge = new Uint8Array(n);
    this.lane = new Uint8Array(n);
    this.pave = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.rail = new Uint8Array(n);
    this.over = new Uint8Array(n);
    this.overAxis = new Uint8Array(n);
    this.building = new Int32Array(n).fill(-1);
  }

  /** Register a building and stamp its id over its footprint. Caller has validated the footprint. */
  addBuilding(b: NewBuilding, w: number, h: number): BuildingInstance {
    const instance: BuildingInstance = {
      id: this.nextBuildingId++,
      def: b.def,
      x: b.x,
      y: b.y,
      variant: b.variant,
      occupants: b.occupants ?? 0,
      entrance: -1,
      grown: b.grown ?? false,
      construction: b.construction ?? 0,
      fullDays: 0,
      powered: false,
      watered: false,
      services: 0,
      happiness: 0.75,
      moodDays: 0,
      abandoned: false,
      lifestyle: b.lifestyle ?? Lifestyle.Basic,
      lifeDays: 0,
      garbage: 0,
      filled: 0,
      stored: 0,
      condition: 1,
      repairDays: 0,
      robbed: 0,
      sick: 0,
    };
    this.buildings.set(instance.id, instance);
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) this.building[this.index(x, y)] = instance.id;
    return instance;
  }

  /** Move a building's footprint to a new top tile, keeping its id and state. Caller has validated the target. */
  moveBuilding(id: number, x: number, y: number, w: number, h: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    for (let ty = b.y; ty < b.y + h; ty++) for (let tx = b.x; tx < b.x + w; tx++) this.building[this.index(tx, ty)] = -1;
    b.x = x;
    b.y = y;
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) this.building[this.index(tx, ty)] = id;
  }

  removeBuilding(id: number, w: number, h: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) this.building[this.index(x, y)] = -1;
    this.buildings.delete(id);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }
}
