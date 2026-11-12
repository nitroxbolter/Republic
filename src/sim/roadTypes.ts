import { BALANCE } from '../shared/balance';
import { RoadType, type BuildableRoad } from './roads';

/**
 * Every road type, described once (docs/specs/transport.md, D-069). Systems read these
 * numbers instead of checking for a particular type, so a new road is a new entry here plus
 * its art module (render/atlas/roads/).
 */
export interface RoadSpec {
  readonly name: string;
  /** Commuters per day a tile carries before it jams (sim/systems/commute.ts). */
  readonly capacity: number;
  /** Free-flow minutes to cross a tile. */
  readonly minutes: number;
  /** Visible cars' speed multiplier. */
  readonly carSpeed: number;
  /** Lane centres for one direction, inner lane first (tile units from the centre line; drive on the right). */
  readonly lanes: readonly number[];
  /** Where pedestrians walk (tile units from the centre line), or null with no footpaths. */
  readonly footpath: number | null;
  /** Price per tile on land, and as a bridge over water. */
  readonly cost: number;
  readonly bridgeCost: number;
  /** Monthly upkeep per tile. */
  readonly upkeep: number;
  /** Loud enough to bother nearby homes (sim/systems/needs.ts). */
  readonly noisy: boolean;
  /** Bigger roads replace smaller ones when dragged over them (paying the difference); never the reverse. */
  readonly rank: number;
  /** Tiles across: 2 for dual carriageways, each tile one direction (World.lane). */
  readonly width: 1 | 2;
  /** Cars may drive it (pedestrian streets: walkers only). */
  readonly cars: boolean;
  /** Pavement style when the player hasn't picked one (render/atlas/roads/paving.ts), or null with no footpaths to pave. */
  readonly pavement: PavementStyle | null;
}

/** Footpath paving, chosen per road in the road tool (cosmetic). */
export const PAVEMENTS = ['concrete', 'brick', 'setts', 'promenade'] as const;
export type PavementStyle = (typeof PAVEMENTS)[number];

export const ROAD_SPECS: Readonly<Record<BuildableRoad, RoadSpec>> = {
  [RoadType.Road]: {
    name: 'Rua',
    capacity: 500,
    minutes: 1,
    carSpeed: 1,
    lanes: [0.13],
    footpath: 0.37,
    cost: BALANCE.roadCost,
    bridgeCost: BALANCE.bridgeCost,
    upkeep: BALANCE.roadUpkeep,
    noisy: false,
    rank: 1,
    width: 1,
    cars: true,
    pavement: 'concrete',
  },
  [RoadType.Avenue]: {
    name: 'Avenue',
    capacity: 1100,
    minutes: 0.8,
    carSpeed: 1.3,
    lanes: [0.12, 0.25],
    footpath: 0.41,
    cost: BALANCE.avenueCost,
    bridgeCost: BALANCE.avenueBridgeCost,
    upkeep: BALANCE.avenueUpkeep,
    noisy: false,
    rank: 2,
    width: 1,
    cars: true,
    pavement: 'brick',
  },
  [RoadType.Boulevard]: {
    name: 'Boulevard',
    capacity: 1300,
    minutes: 0.7,
    carSpeed: 1.45,
    // One direction's three lanes on this tile (the median is on the left, the footpath on the right).
    lanes: [-0.27, -0.03, 0.2],
    footpath: null,
    cost: BALANCE.boulevardCost,
    bridgeCost: BALANCE.boulevardBridgeCost,
    upkeep: BALANCE.boulevardUpkeep,
    noisy: false,
    rank: 3,
    width: 2,
    cars: true,
    pavement: 'promenade',
  },
  [RoadType.Highway]: {
    name: 'Rodovia',
    capacity: 1500,
    minutes: 0.45,
    carSpeed: 1.9,
    lanes: [0.12, 0.32],
    footpath: null,
    cost: BALANCE.highwayCost,
    bridgeCost: BALANCE.highwayBridgeCost,
    upkeep: BALANCE.highwayUpkeep,
    noisy: true,
    rank: 4,
    width: 1,
    cars: true,
    pavement: null,
  },
  [RoadType.Expressway]: {
    name: 'Via expressa',
    capacity: 2000,
    minutes: 0.38,
    carSpeed: 2.3,
    // One direction's four lanes on this tile, between the median barrier and the outer barrier.
    lanes: [-0.33, -0.11, 0.11, 0.33],
    footpath: null,
    cost: BALANCE.expresswayCost,
    bridgeCost: BALANCE.expresswayBridgeCost,
    upkeep: BALANCE.expresswayUpkeep,
    noisy: true,
    rank: 5,
    width: 2,
    cars: true,
    pavement: null,
  },
  [RoadType.Ramp]: {
    name: 'Alça de acesso',
    capacity: 800,
    minutes: 0.6,
    carSpeed: 1.4,
    lanes: [0.13],
    footpath: null,
    cost: BALANCE.rampCost,
    bridgeCost: BALANCE.rampBridgeCost,
    upkeep: BALANCE.rampUpkeep,
    noisy: true,
    rank: 1.8,
    width: 1,
    cars: true,
    pavement: null,
  },
  [RoadType.Pedestrian]: {
    name: 'Rua de pedestres',
    // Walkers only: slow on foot, never jammed.
    capacity: 100_000,
    minutes: 2.5,
    carSpeed: 0,
    lanes: [0.13],
    footpath: 0.3,
    cost: BALANCE.pedestrianCost,
    bridgeCost: BALANCE.bridgeCost,
    upkeep: BALANCE.pedestrianUpkeep,
    noisy: false,
    rank: 1.5,
    width: 1,
    cars: false,
    pavement: 'setts',
  },
};

/** Every road type you can build, smallest first. */
export const BUILDABLE_ROADS: readonly BuildableRoad[] = [
  RoadType.Pedestrian,
  RoadType.Road,
  RoadType.Avenue,
  RoadType.Boulevard,
  RoadType.Ramp,
  RoadType.Highway,
  RoadType.Expressway,
];

/** The pavement shown on a tile: the player's pick, or the road type's default. */
export function pavementOf(type: number, pave: number): PavementStyle | null {
  const spec = roadSpec(type);
  if (!spec?.pavement) return null;
  return PAVEMENTS[pave - 1] ?? spec.pavement;
}

export function isBuildableRoad(v: number): v is BuildableRoad {
  return (BUILDABLE_ROADS as readonly number[]).includes(v);
}

/** The spec of the road on a tile, or null if there is none. */
export function roadSpec(type: number): RoadSpec | null {
  return isBuildableRoad(type) ? ROAD_SPECS[type] : null;
}
