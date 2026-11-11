/** Building catalog. See docs/specs/buildings.md. Visuals live in render/atlas/buildingArt.ts. */

export type Zone = 'R' | 'C' | 'I';
/** Low density: houses and shops. High density: apartments and offices. Industry is always low. */
export type Density = 'low' | 'high';
export type BuildingCategory = 'residential' | 'commercial' | 'industrial' | 'civic';
export type WealthTier = 'everyday' | 'comfortable' | 'luxury';
/** City services with a coverage area (docs/specs/core.md). */
export type ServiceKind = 'police' | 'fire' | 'health' | 'education' | 'hospital' | 'university';
export const SERVICE_KINDS: readonly ServiceKind[] = ['police', 'fire', 'health', 'education', 'hospital', 'university'];
/** The four basic services every level-3 building needs (hospital and university are lifestyle expectations, docs/specs/evolution.md). */
export const BASIC_SERVICES: readonly ServiceKind[] = ['police', 'fire', 'health', 'education'];
/** A home's lifestyle tier (docs/specs/evolution.md): what its residents expect from the city. */
export const Lifestyle = { Basic: 0, Comfortable: 1, Prosperous: 2 } as const;
export type Lifestyle = (typeof Lifestyle)[keyof typeof Lifestyle];
export const LIFESTYLE_NAMES: Readonly<Record<Lifestyle, string>> = { 0: 'Basic', 1: 'Comfortable', 2: 'Prosperous' };
/** How a power building makes (or stores) its power (docs/specs/energy.md). */
export type EnergySource = 'coal' | 'gas' | 'wind' | 'solar' | 'battery';
export const ENERGY_SOURCES: readonly EnergySource[] = ['coal', 'gas', 'wind', 'solar', 'battery'];

export interface EnergyDef {
  readonly source: EnergySource;
  /** Batteries: how much they hold, and how much they can take in or give out per clock hour. */
  readonly storage?: number;
  readonly rate?: number;
  /** Preview reach from the plant, in tiles. The grid still requires a shared road island. */
  readonly coverage?: number;
  /** Output fraction at which sustained demand begins wearing this plant down. */
  readonly overload?: number;
  /** Cost to restore a failed plant to full condition. */
  readonly repairCost?: number;
}

/** Emergency vehicles (sim/systems/incidents.ts, docs/specs/evolution.md E3). */
export type ResponderKind = 'fire' | 'police' | 'ambulance';

/** A station that sends vehicles to incidents over the roads. */
export interface ResponderDef {
  readonly kind: ResponderKind;
  /** Vehicles it can have out at once. */
  readonly vehicles: number;
  /** Ambulances that can take injuries (hospitals, the trauma centre); clinics only take illness. */
  readonly injuries?: boolean;
  /** Speed multiplier over the emergency speed (the trauma centre's rapid response). */
  readonly speed?: number;
}

/** Civic panel tabs. */
export type CivicGroup = 'services' | 'transport' | 'utilities' | 'parks';

export interface BuildingDef {
  name: string;
  category: BuildingCategory;
  zone: Zone | null;
  /** Which zone density grows this building (null for civic buildings). */
  density: Density | null;
  /** Development level 1–3 (civic: 0). */
  level: 0 | 1 | 2 | 3;
  size: { w: number; h: number };
  cost: number;
  /** Residents for housing, jobs for everything else. */
  capacity: number;
  description: string;
  /** Civic buildings: which Civic panel tab lists it. */
  group?: CivicGroup;
  /** Monthly running cost (civic buildings). */
  upkeep?: number;
  /** Services: what it provides and how far (tiles from the footprint centre). */
  service?: ServiceKind;
  radius?: number;
  /** Utilities: power and water supplied to buildings on the same road network (power: peak output). */
  supplies?: { power?: number; water?: number };
  /** Power buildings: what drives their output (sim/systems/energy.ts). */
  energy?: EnergyDef;
  /** Garbage facilities (sim/systems/garbage.ts): tons collected per day, reach in tiles, and (landfills) how much it holds. */
  garbage?: { readonly trucks: number; readonly reach: number; readonly holds?: number; readonly recycles?: number };
  /** Emergency services: the vehicles it sends to fires, thefts and patients (docs/specs/evolution.md, E3). */
  responder?: ResponderDef;
  /** Train stations: must be built with track beside the footprint (sim/rail.ts). */
  railStation?: boolean;
  /** Bus stations: a fleet of buses runs from it, and nearby homes commute by bus (sim/systems/traffic.ts, commute.ts). */
  busStation?: { readonly fleet: number; readonly reach: number };
  /** Power corridor node: buildings on the same road island within this reach can connect. */
  substation?: { readonly radius: number; readonly capacity: number };
  /** Resident/customer profile this building attracts. */
  wealth?: WealthTier;
  /** Investor confidence contributed by a successful high-value building. */
  investorValue?: number;
}

export const BUILDINGS = {
  cottage: {
    name: 'Cottage',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 120,
    capacity: 3,
    description: 'A small gable-roofed home with a garden.',
  },
  family_house: {
    name: 'Family House',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 200,
    capacity: 5,
    description: 'Two storeys, a porch and a hip roof.',
  },
  townhouses: {
    name: 'Townhouses',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 450,
    capacity: 12,
    description: 'A narrow row of three homes with bright doors.',
  },
  walkup: {
    name: 'Walk-up Apartments',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 700,
    capacity: 24,
    description: 'Four floors of brick apartments with balconies.',
  },
  apartment_block: {
    name: 'Apartment Block',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 2400,
    capacity: 120,
    description: 'A mid-rise block with balconies and a rooftop water tank.',
  },
  condo_tower: {
    name: 'Condo Tower',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 5200,
    capacity: 260,
    description: 'A glass residential tower with terraces.',
  },
  villa: {
    name: 'Private Villa',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 2,
    size: { w: 2, h: 2 },
    cost: 2600,
    capacity: 8,
    description: 'A landscaped villa for affluent residents and visiting investors.',
    wealth: 'luxury',
    investorValue: 8,
  },
  luxury_apartments: {
    name: 'Luxury Apartments',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 7600,
    capacity: 180,
    description: 'A premium residence with terraces, concierge spaces and a skyline view.',
    wealth: 'luxury',
    investorValue: 12,
  },
  corner_shop: {
    name: 'Corner Shop',
    category: 'commercial',
    zone: 'C',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 260,
    capacity: 6,
    description: 'A neighbourhood shop under a striped awning.',
  },
  cafe: {
    name: 'Café',
    category: 'commercial',
    zone: 'C',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 240,
    capacity: 8,
    description: 'Coffee, cake and tables outside.',
  },
  small_office: {
    name: 'Small Office',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 900,
    capacity: 40,
    description: 'Five floors of offices with bands of glass.',
  },
  creative_office: {
    name: 'Creative Office',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 1400,
    capacity: 55,
    description: 'Flexible studios and bright workspaces for growing companies.',
    wealth: 'comfortable',
    investorValue: 3,
  },
  supermarket: {
    name: 'Supermarket',
    category: 'commercial',
    zone: 'C',
    density: 'low',
    level: 2,
    size: { w: 2, h: 2 },
    cost: 1800,
    capacity: 60,
    description: 'A big store with its own parking lot.',
  },
  hotel: {
    name: 'Hotel',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 4200,
    capacity: 90,
    description: 'A tall hotel with a rooftop sign and an entrance canopy.',
  },
  office_tower: {
    name: 'Office Tower',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 6500,
    capacity: 400,
    description: 'A glass skyscraper with a lit crown.',
  },
  tech_campus: {
    name: 'Tech Campus',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 8200,
    capacity: 480,
    description: 'A next-generation campus that attracts ambitious firms and investors.',
    wealth: 'luxury',
    investorValue: 10,
  },
  workshop: {
    name: 'Workshop',
    category: 'industrial',
    zone: 'I',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 300,
    capacity: 10,
    description: 'A small workshop with a garage door.',
  },
  warehouse: {
    name: 'Warehouse',
    category: 'industrial',
    zone: 'I',
    density: 'low',
    level: 2,
    size: { w: 2, h: 2 },
    cost: 1500,
    capacity: 40,
    description: 'Storage with loading docks and crates.',
  },
  factory: {
    name: 'Factory',
    category: 'industrial',
    zone: 'I',
    density: 'low',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 3200,
    capacity: 120,
    description: 'Sawtooth roofs and a tall smokestack.',
  },
  park: {
    name: 'Park',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 100,
    capacity: 0,
    description: 'Lawn, trees, a path and a fountain.',
    group: 'parks',
    upkeep: 1,
  },
  central_park: {
    name: 'Central Park',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 2200,
    capacity: 0,
    description: 'A grand green with a lake, winding paths and mature trees.',
    group: 'parks',
    upkeep: 18,
  },
  botanical_garden: {
    name: 'Botanical Garden',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 3000,
    capacity: 0,
    description: 'Glasshouses, flower beds and a tranquil garden walk.',
    group: 'parks',
    upkeep: 24,
  },
  shopping_complex: {
    name: 'Shopping Complex',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 2 },
    cost: 4200,
    capacity: 180,
    description: 'A bright mixed-use mall with a public plaza and rooftop gardens.',
    group: 'parks',
    upkeep: 32,
  },
  riverside_market: {
    name: 'Riverside Market',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 2600,
    capacity: 90,
    description: 'Colourful market halls wrapped around a lively pedestrian square.',
    group: 'parks',
    upkeep: 20,
  },
  observation_wheel: {
    name: 'Observation Wheel',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 16000,
    capacity: 60,
    description: 'A giant wheel of glass pods with views over the whole city, lit up after dark.',
    group: 'parks',
    upkeep: 40,
  },
  theme_park: {
    name: 'Theme Park',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 4, h: 4 },
    cost: 42000,
    capacity: 420,
    description: 'A fairy-tale castle, a looping coaster, a carousel, a drop tower and a lagoon.',
    group: 'parks',
    upkeep: 140,
    wealth: 'comfortable',
    investorValue: 8,
  },
  sail_hotel: {
    name: 'Sail Hotel',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 36000,
    capacity: 380,
    description: 'A luxury hotel shaped like a billowing sail, on its own island with a helipad.',
    group: 'parks',
    upkeep: 60,
    wealth: 'luxury',
    investorValue: 14,
  },
  sky_tower: {
    name: 'Sky Tower',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 90000,
    capacity: 1400,
    description: 'A supertall glass tower whose three wings spiral up to a needle spire.',
    group: 'parks',
    upkeep: 160,
    wealth: 'luxury',
    investorValue: 30,
  },
  town_hall: {
    name: 'Town Hall',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 5000,
    capacity: 30,
    description: 'The seat of your city government.',
    group: 'parks',
    upkeep: 50,
  },
  police_station: {
    name: 'Police Station',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 750,
    capacity: 20,
    description: 'Keeps the streets safe. Buildings nearby fill up and grow.',
    group: 'services',
    upkeep: 60,
    service: 'police',
    radius: 14,
    responder: { kind: 'police', vehicles: 2 },
  },
  fire_station: {
    name: 'Fire Station',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 750,
    capacity: 20,
    description: 'Stops fires before they spread. Buildings outside its reach can burn down.',
    group: 'services',
    upkeep: 60,
    service: 'fire',
    radius: 14,
    responder: { kind: 'fire', vehicles: 2 },
  },
  clinic: {
    name: 'Clinic',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 900,
    capacity: 25,
    description: 'Doctors and nurses for the neighbourhood.',
    group: 'services',
    upkeep: 80,
    service: 'health',
    radius: 12,
    responder: { kind: 'ambulance', vehicles: 1 },
  },
  school: {
    name: 'School',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 1500,
    capacity: 30,
    description: 'Classrooms and a playground. Educated cities grow taller.',
    group: 'services',
    upkeep: 80,
    service: 'education',
    radius: 14,
  },
  hospital: {
    name: 'Hospital',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 2 },
    cost: 14000,
    capacity: 140,
    description: 'Wards, surgery and an emergency bay. Comfortable residents expect one; it also counts as a clinic.',
    group: 'services',
    upkeep: 320,
    service: 'hospital',
    radius: 24,
    responder: { kind: 'ambulance', vehicles: 3, injuries: true },
  },
  university: {
    name: 'University',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 22000,
    capacity: 160,
    description: 'A campus with a quad and a clock tower. Prosperous residents expect one; graduates want office jobs.',
    group: 'services',
    upkeep: 420,
    service: 'university',
    radius: 32,
  },  trauma_centre: {
    name: 'Trauma Centre',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 26000,
    capacity: 180,
    description: 'Six rapid-response ambulances for patients and fire injuries across the city. It also counts as a hospital.',
    group: 'services',
    upkeep: 480,
    service: 'hospital',
    radius: 28,
    responder: { kind: 'ambulance', vehicles: 6, injuries: true, speed: 1.5 },
  },

  landfill: {
    name: 'Landfill',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 3000,
    capacity: 20,
    description: 'Garbage trucks empty the bins in reach. It fills up over the years, and it smells.',
    group: 'utilities',
    upkeep: 60,
    garbage: { trucks: 120, reach: 22, holds: 60000 },
  },
  recycling_centre: {
    name: 'Recycling Centre',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 9000,
    capacity: 45,
    description: 'Sorts garbage into materials to sell. It never fills up.',
    group: 'utilities',
    upkeep: 200,
    garbage: { trucks: 150, reach: 24, recycles: 0.4 },
  },
  incinerator: {
    name: 'Incinerator',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 16000,
    capacity: 35,
    description: 'Burns a lot of garbage and never fills up, but its stack is smoky.',
    group: 'utilities',
    upkeep: 260,
    garbage: { trucks: 300, reach: 28 },
  },
  train_station: {
    name: 'Train Station',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 8000,
    capacity: 20,
    description: 'Build it beside rail track. Homes and jobs within 8 tiles take the train when it beats driving, which takes cars off the roads.',
    group: 'transport',
    upkeep: 150,
    railStation: true,
  },
  bus_station: {
    name: 'Bus Station',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 12000,
    capacity: 30,
    description: 'A terminal with bays for a fleet of buses that run across town. Homes within 10 tiles send some commuters by bus instead of driving.',
    group: 'transport',
    upkeep: 220,
    busStation: { fleet: 4, reach: 10 },
  },
  research_centre: {
    name: 'Research Centre',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 30000,
    capacity: 80,
    description: 'Labs that make research points every day (more with a university nearby). Projects finish in turn: cleaner coal, better garbage trucks, cheaper construction, wider care, green industry, rapid transit.',
    group: 'services',
    upkeep: 500,
  },
  power_plant: {
    name: 'Coal Power Plant',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 4000,
    capacity: 40,
    description: 'Powers every building connected to it by road, up to its capacity.',
    group: 'utilities',
    upkeep: 150,
    supplies: { power: 4000 },
    energy: { source: 'coal', coverage: 14, overload: 0.9, repairCost: 900 },
  },
  gas_plant: {
    name: 'Gas Power Plant',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 6500,
    capacity: 30,
    description: 'Steady power day and night with half the smoke of coal, but costly to run.',
    group: 'utilities',
    upkeep: 260,
    supplies: { power: 5000 },
    energy: { source: 'gas', coverage: 18, overload: 0.95, repairCost: 1200 },
  },
  wind_turbine: {
    name: 'Wind Turbine',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 900,
    capacity: 2,
    description: 'Clean power that rises and falls with the wind over the days.',
    group: 'utilities',
    upkeep: 15,
    supplies: { power: 450 },
    energy: { source: 'wind', coverage: 10, overload: 0.8, repairCost: 180 },
  },
  solar_farm: {
    name: 'Solar Farm',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 3200,
    capacity: 3,
    description: 'Clean power while the sun is up, and none at night. Pair it with batteries.',
    group: 'utilities',
    upkeep: 30,
    supplies: { power: 1000 },
    energy: { source: 'solar', coverage: 12, overload: 0.85, repairCost: 450 },
  },
  battery_bank: {
    name: 'Battery Bank',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 2500,
    capacity: 2,
    description: 'Stores spare power and gives it back when demand peaks or the sun goes down.',
    group: 'utilities',
    upkeep: 25,
    energy: { source: 'battery', storage: 2400, rate: 800 },
  },
  substation: {
    name: 'Power Substation',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 1400,
    capacity: 0,
    description: 'Connects a road corridor to nearby homes and businesses.',
    group: 'utilities',
    upkeep: 20,
    substation: { radius: 12, capacity: 300 },
  },
  water_tower: {
    name: 'Water Tower',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 1200,
    capacity: 10,
    description: 'Supplies water to every building within 14 tiles, like a fire or police station covers its area, up to its capacity.',
    group: 'utilities',
    upkeep: 80,
    supplies: { water: 2500 },
    // Water reaches buildings by distance, like services (user call, D-093).
    radius: 14,
  },
} as const satisfies Record<string, BuildingDef>;

export type BuildingId = keyof typeof BUILDINGS;

/** Colour variants each building is painted in (render/atlas/buildingArt.ts). */
export const ART_VARIANTS = 6;

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];

/**
 * What the Build tool may place: civic buildings only. Homes, shops and industry come from
 * zoning (docs/decisions.md D-042). The sim itself can still place anything (tests use it).
 */
export const PLACEABLE_IDS: readonly BuildingId[] = BUILDING_IDS.filter((id) => BUILDINGS[id].category === 'civic');

/** Monthly upkeep of a building (0 for zoned buildings). */
export function upkeepOf(id: BuildingId): number {
  const d: BuildingDef = BUILDINGS[id];
  return d.upkeep ?? 0;
}

export function isPlaceable(id: BuildingId): boolean {
  return PLACEABLE_IDS.includes(id);
}

export const CATEGORY_ORDER: readonly BuildingCategory[] = ['residential', 'commercial', 'industrial', 'civic'];

export function buildingDef(id: BuildingId): BuildingDef {
  return BUILDINGS[id];
}

export function wealthOf(id: BuildingId): WealthTier {
  return buildingDef(id).wealth ?? 'everyday';
}

export interface BuildingInstance {
  id: number;
  def: BuildingId;
  /** Footprint's top (north) tile. */
  x: number;
  y: number;
  /** Art variant 0–5, fixed when placed (the renderer wraps it to each building's variant count). */
  variant: number;
  /** Residents (housing) or workers (everything else). Updated by sim/population.ts. */
  occupants: number;
  /** Tile index of the road the building uses (within roadAccessRange), or −1 if it has no road access. */
  entrance: number;
  /** Grew on a zone (vs placed with the Build tool). Only grown buildings level up. */
  grown: boolean;
  /** Days of construction left; 0 once finished. Sites have no residents or jobs. */
  construction: number;
  /** Consecutive days at or above BALANCE.upgradeOccupancy. */
  fullDays: number;
  /** Utilities reach it (set by sim/services.ts; civic buildings are always served). */
  powered: boolean;
  watered: boolean;
  /** Bitmask of services covering it (bit = index in SERVICE_KINDS). */
  services: number;
  /** 0..1 from its needs (sim/systems/needs.ts); new buildings start neutral. */
  happiness: number;
  /** Consecutive days below the abandonment line (or, once abandoned, above the recovery line). */
  moodDays: number;
  /** Run-down and empty after a long unhappy spell (docs/specs/needs.md). */
  abandoned: boolean;
  /** Homes: residents' lifestyle tier (sim/systems/lifestyle.ts); Basic for everything else. */
  lifestyle: Lifestyle;
  /** Homes: consecutive days toward the next tier (> 0) or down a tier (< 0). */
  lifeDays: number;
  /** Uncollected garbage piled up here, in tons (sim/systems/garbage.ts). */
  garbage: number;
  /** Landfills: tons buried so far. */
  filled: number;
  /** Battery banks: power held right now (sim/systems/energy.ts); 0 for everything else. */
  stored: number;
  /** 0..1 health of a generating plant; non-generators remain at 1. */
  condition: number;
  /** In-game days remaining before a failed generator can run again. */
  repairDays: number;
  /** Days left of the hurt from a theft nobody stopped, and from patients nobody reached (E3). */
  robbed: number;
  sick: number;
}

/** What a caller supplies when placing or growing; the runtime fields start empty. */
export interface NewBuilding extends Pick<BuildingInstance, 'def' | 'x' | 'y' | 'variant'> {
  grown?: boolean;
  construction?: number;
  /** Residents or workers carried over from the lots an upgrade replaced. */
  occupants?: number;
  /** Homes: lifestyle carried over from the homes an upgrade replaced. */
  lifestyle?: Lifestyle;
}

/** Zoned buildings of a zone, density, level and square footprint size (1 or 2), in catalog order. */
export function zonedBuildings(zone: Zone, density: Density, level: number, size: number): BuildingId[] {
  return BUILDING_IDS.filter((id) => {
    const d: BuildingDef = BUILDINGS[id];
    return d.zone === zone && d.density === density && d.level === level && d.size.w === size && d.size.h === size;
  });
}

/** The level new lots of this zone and density start at: its lowest 1×1 building. */
export function startLevel(zone: Zone, density: Density): number {
  let level = Infinity;
  for (const id of BUILDING_IDS) {
    const d: BuildingDef = BUILDINGS[id];
    if (d.zone === zone && d.density === density && d.size.w === 1) level = Math.min(level, d.level);
  }
  return level;
}

/** Pick a random zoned building, or null if the catalog has none for that zone/density/level/size. */
export function chooseBuilding(zone: Zone, density: Density, level: number, size: number, rng: () => number): BuildingId | null {
  const ids = zonedBuildings(zone, density, level, size);
  return ids.length === 0 ? null : ids[Math.floor(rng() * ids.length)];
}

/** Top-left (north) tile of a footprint whose "centre" tile is under the cursor. */
export function footprintOrigin(id: BuildingId, cx: number, cy: number): { x: number; y: number } {
  const { w, h } = BUILDINGS[id].size;
  return { x: cx - Math.floor((w - 1) / 2), y: cy - Math.floor((h - 1) / 2) };
}
