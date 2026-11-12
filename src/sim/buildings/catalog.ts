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
export const LIFESTYLE_NAMES: Readonly<Record<Lifestyle, string>> = { 0: 'Básico', 1: 'Confortável', 2: 'Próspero' };
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
    name: 'Casa de campo',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 120,
    capacity: 3,
    description: 'Uma casa pequena com telhado de duas águas e jardim.',
  },
  family_house: {
    name: 'Casa familiar',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 200,
    capacity: 5,
    description: 'Dois andares, varanda e telhado de quatro águas.',
  },
  townhouses: {
    name: 'Casas geminadas',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 450,
    capacity: 12,
    description: 'Uma fileira estreita de três casas com portas coloridas.',
  },
  walkup: {
    name: 'Prédio de apartamentos',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 700,
    capacity: 24,
    description: 'Quatro andares de apartamentos de tijolos com sacadas.',
  },
  apartment_block: {
    name: 'Conjunto de apartamentos',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 2400,
    capacity: 120,
    description: 'Um prédio de altura média com sacadas e caixa-d’água no terraço.',
  },
  condo_tower: {
    name: 'Torre residencial',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 5200,
    capacity: 260,
    description: 'Uma torre residencial de vidro com terraços.',
  },
  villa: {
    name: 'Mansão',
    category: 'residential',
    zone: 'R',
    density: 'low',
    level: 2,
    size: { w: 2, h: 2 },
    cost: 2600,
    capacity: 8,
    description: 'Uma mansão com jardins para moradores abastados e investidores visitantes.',
    wealth: 'luxury',
    investorValue: 8,
  },
  luxury_apartments: {
    name: 'Apartamentos de luxo',
    category: 'residential',
    zone: 'R',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 7600,
    capacity: 180,
    description: 'Uma residência sofisticada com terraços, portaria e vista para a cidade.',
    wealth: 'luxury',
    investorValue: 12,
  },
  corner_shop: {
    name: 'Loja de esquina',
    category: 'commercial',
    zone: 'C',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 260,
    capacity: 6,
    description: 'Uma loja de bairro sob um toldo listrado.',
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
    description: 'Café, bolo e mesas ao ar livre.',
  },
  small_office: {
    name: 'Escritório pequeno',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 900,
    capacity: 40,
    description: 'Cinco andares de escritórios com faixas de vidro.',
  },
  creative_office: {
    name: 'Escritório criativo',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 2,
    size: { w: 1, h: 1 },
    cost: 1400,
    capacity: 55,
    description: 'Estúdios flexíveis e espaços claros para empresas em crescimento.',
    wealth: 'comfortable',
    investorValue: 3,
  },
  supermarket: {
    name: 'Supermercado',
    category: 'commercial',
    zone: 'C',
    density: 'low',
    level: 2,
    size: { w: 2, h: 2 },
    cost: 1800,
    capacity: 60,
    description: 'Uma loja grande com estacionamento próprio.',
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
    description: 'Um hotel alto com letreiro no terraço e cobertura na entrada.',
  },
  office_tower: {
    name: 'Torre de escritórios',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 6500,
    capacity: 400,
    description: 'Um arranha-céu de vidro com o topo iluminado.',
  },
  tech_campus: {
    name: 'Campus tecnológico',
    category: 'commercial',
    zone: 'C',
    density: 'high',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 8200,
    capacity: 480,
    description: 'Um campus moderno que atrai empresas ambiciosas e investidores.',
    wealth: 'luxury',
    investorValue: 10,
  },
  workshop: {
    name: 'Oficina',
    category: 'industrial',
    zone: 'I',
    density: 'low',
    level: 1,
    size: { w: 1, h: 1 },
    cost: 300,
    capacity: 10,
    description: 'Uma pequena oficina com portão de garagem.',
  },
  warehouse: {
    name: 'Armazém',
    category: 'industrial',
    zone: 'I',
    density: 'low',
    level: 2,
    size: { w: 2, h: 2 },
    cost: 1500,
    capacity: 40,
    description: 'Depósito com docas de carga e caixotes.',
  },
  factory: {
    name: 'Fábrica',
    category: 'industrial',
    zone: 'I',
    density: 'low',
    level: 3,
    size: { w: 2, h: 2 },
    cost: 3200,
    capacity: 120,
    description: 'Telhados em dente de serra e uma chaminé alta.',
  },
  park: {
    name: 'Parque',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 100,
    capacity: 0,
    description: 'Gramado, árvores, um caminho e uma fonte.',
    group: 'parks',
    upkeep: 1,
  },
  central_park: {
    name: 'Parque central',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 2200,
    capacity: 0,
    description: 'Um grande parque com lago, caminhos sinuosos e árvores antigas.',
    group: 'parks',
    upkeep: 18,
  },
  botanical_garden: {
    name: 'Jardim botânico',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 3000,
    capacity: 0,
    description: 'Estufas, canteiros de flores e um passeio tranquilo pelo jardim.',
    group: 'parks',
    upkeep: 24,
  },
  shopping_complex: {
    name: 'Centro comercial',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 2 },
    cost: 4200,
    capacity: 180,
    description: 'Um centro comercial com praça pública e jardins no terraço.',
    group: 'parks',
    upkeep: 32,
  },
  riverside_market: {
    name: 'Mercado ribeirinho',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 2600,
    capacity: 90,
    description: 'Pavilhões coloridos em torno de uma movimentada praça de pedestres.',
    group: 'parks',
    upkeep: 20,
  },
  observation_wheel: {
    name: 'Roda-gigante',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 16000,
    capacity: 60,
    description: 'Uma roda-gigante com cabines de vidro e vista da cidade inteira, iluminada à noite.',
    group: 'parks',
    upkeep: 40,
  },
  theme_park: {
    name: 'Parque de diversões',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 4, h: 4 },
    cost: 42000,
    capacity: 420,
    description: 'Um castelo de conto de fadas, montanha-russa, carrossel, torre de queda e lagoa.',
    group: 'parks',
    upkeep: 140,
    wealth: 'comfortable',
    investorValue: 8,
  },
  sail_hotel: {
    name: 'Hotel Vela',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 36000,
    capacity: 380,
    description: 'Um hotel de luxo em forma de vela, numa ilha própria com heliponto.',
    group: 'parks',
    upkeep: 60,
    wealth: 'luxury',
    investorValue: 14,
  },
  sky_tower: {
    name: 'Torre do Céu',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 90000,
    capacity: 1400,
    description: 'Uma torre de vidro altíssima, com três alas que sobem em espiral até a agulha no topo.',
    group: 'parks',
    upkeep: 160,
    wealth: 'luxury',
    investorValue: 30,
  },
  town_hall: {
    name: 'Prefeitura',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 5000,
    capacity: 30,
    description: 'A sede do governo da sua cidade.',
    group: 'parks',
    upkeep: 50,
  },
  police_station: {
    name: 'Delegacia',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 750,
    capacity: 20,
    description: 'Mantém as ruas seguras. Os edifícios próximos atraem mais moradores e crescem.',
    group: 'services',
    upkeep: 60,
    service: 'police',
    radius: 14,
    responder: { kind: 'police', vehicles: 2 },
  },
  fire_station: {
    name: 'Quartel dos bombeiros',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 750,
    capacity: 20,
    description: 'Controla incêndios antes que se espalhem. Edifícios fora do alcance podem ser destruídos.',
    group: 'services',
    upkeep: 60,
    service: 'fire',
    radius: 14,
    responder: { kind: 'fire', vehicles: 2 },
  },
  clinic: {
    name: 'Clínica',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 900,
    capacity: 25,
    description: 'Médicos e enfermeiros para a vizinhança.',
    group: 'services',
    upkeep: 80,
    service: 'health',
    radius: 12,
    responder: { kind: 'ambulance', vehicles: 1 },
  },
  school: {
    name: 'Escola',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 1500,
    capacity: 30,
    description: 'Salas de aula e parquinho. Cidades instruídas crescem mais.',
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
    description: 'Enfermarias, cirurgia e pronto-socorro. Moradores confortáveis esperam ter um; também funciona como clínica.',
    group: 'services',
    upkeep: 320,
    service: 'hospital',
    radius: 24,
    responder: { kind: 'ambulance', vehicles: 3, injuries: true },
  },
  university: {
    name: 'Universidade',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 22000,
    capacity: 160,
    description: 'Um campus com praça e torre do relógio. Moradores prósperos esperam ter uma; formados procuram empregos em escritórios.',
    group: 'services',
    upkeep: 420,
    service: 'university',
    radius: 32,
  },  trauma_centre: {
    name: 'Centro de trauma',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 26000,
    capacity: 180,
    description: 'Seis ambulâncias de resposta rápida atendem pacientes e feridos em incêndios por toda a cidade. Também funciona como hospital.',
    group: 'services',
    upkeep: 480,
    service: 'hospital',
    radius: 28,
    responder: { kind: 'ambulance', vehicles: 6, injuries: true, speed: 1.5 },
  },

  landfill: {
    name: 'Aterro sanitário',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 3000,
    capacity: 20,
    description: 'Caminhões recolhem o lixo no alcance. O aterro enche com os anos e causa mau cheiro.',
    group: 'utilities',
    upkeep: 60,
    garbage: { trucks: 120, reach: 22, holds: 60000 },
  },
  recycling_centre: {
    name: 'Centro de reciclagem',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 9000,
    capacity: 45,
    description: 'Separa o lixo em materiais para venda. Nunca fica cheio.',
    group: 'utilities',
    upkeep: 200,
    garbage: { trucks: 150, reach: 24, recycles: 0.4 },
  },
  incinerator: {
    name: 'Incinerador',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 16000,
    capacity: 35,
    description: 'Queima muito lixo e nunca fica cheio, mas sua chaminé produz fumaça.',
    group: 'utilities',
    upkeep: 260,
    garbage: { trucks: 300, reach: 28 },
  },
  train_station: {
    name: 'Estação de trem',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 8000,
    capacity: 20,
    description: 'Construa ao lado dos trilhos. Moradias e empregos a até 8 quadrados usam o trem quando ele é mais rápido que dirigir.',
    group: 'transport',
    upkeep: 150,
    railStation: true,
  },
  bus_station: {
    name: 'Terminal de ônibus',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 3, h: 3 },
    cost: 12000,
    capacity: 30,
    description: 'Um terminal para uma frota de ônibus que percorre a cidade. Moradias a até 10 quadrados enviam parte dos trabalhadores de ônibus.',
    group: 'transport',
    upkeep: 220,
    busStation: { fleet: 4, reach: 10 },
  },
  research_centre: {
    name: 'Centro de pesquisa',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 30000,
    capacity: 80,
    description: 'Laboratórios geram pontos de pesquisa diariamente, ainda mais perto de uma universidade. Pesquise energia limpa, coleta eficiente, construção moderna, saúde, indústria verde e transporte rápido.',
    group: 'services',
    upkeep: 500,
  },
  power_plant: {
    name: 'Usina a carvão',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 4000,
    capacity: 40,
    description: 'Fornece energia aos edifícios conectados pela mesma rede viária, até atingir sua capacidade.',
    group: 'utilities',
    upkeep: 300,
    supplies: { power: 4000 },
    energy: { source: 'coal', coverage: 14, overload: 0.9, repairCost: 900 },
  },
  gas_plant: {
    name: 'Usina a gás',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 6500,
    capacity: 30,
    description: 'Energia constante dia e noite, com metade da fumaça do carvão, mas custo de operação alto.',
    group: 'utilities',
    upkeep: 480,
    supplies: { power: 5000 },
    energy: { source: 'gas', coverage: 18, overload: 0.95, repairCost: 1200 },
  },
  wind_turbine: {
    name: 'Turbina eólica',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 900,
    capacity: 2,
    description: 'Energia limpa cuja produção varia conforme o vento.',
    group: 'utilities',
    upkeep: 25,
    supplies: { power: 450 },
    energy: { source: 'wind', coverage: 10, overload: 0.8, repairCost: 180 },
  },
  solar_farm: {
    name: 'Usina solar',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 2, h: 2 },
    cost: 3200,
    capacity: 3,
    description: 'Produz energia limpa durante o dia, mas não à noite. Combine com baterias.',
    group: 'utilities',
    upkeep: 45,
    supplies: { power: 1000 },
    energy: { source: 'solar', coverage: 12, overload: 0.85, repairCost: 450 },
  },
  battery_bank: {
    name: 'Banco de baterias',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 2500,
    capacity: 2,
    description: 'Armazena energia excedente e a devolve nos picos de demanda ou após o pôr do sol.',
    group: 'utilities',
    upkeep: 35,
    energy: { source: 'battery', storage: 2400, rate: 800 },
  },
  substation: {
    name: 'Subestação elétrica',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 1400,
    capacity: 0,
    description: 'Conecta a rede viária a moradias e comércios próximos.',
    group: 'utilities',
    upkeep: 30,
    substation: { radius: 12, capacity: 300 },
  },
  water_tower: {
    name: 'Torre de água',
    category: 'civic',
    zone: null,
    density: null,
    level: 0,
    size: { w: 1, h: 1 },
    cost: 1200,
    capacity: 10,
    description: 'Fornece água aos edifícios num raio de 14 quadrados, até atingir sua capacidade.',
    group: 'utilities',
    upkeep: 120,
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
