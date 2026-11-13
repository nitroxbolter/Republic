/** Tunable game-economy numbers. See docs/specs/roads.md. */
export const BALANCE = {
  /** Enough for starter services, utilities, roads and several residential zones. */
  startingFunds: 40_000,
  /** Construction cost per road tile: $20 to $100. */
  roadCost: 20,
  highwayCost: 80,
  avenueCost: 35,
  avenueBridgeCost: 55,
  /** Wide roads are priced per tile; one drag lays two tiles per step. */
  boulevardCost: 55,
  boulevardBridgeCost: 70,
  expresswayCost: 100,
  expresswayBridgeCost: 100,
  rampCost: 45,
  rampBridgeCost: 60,
  pedestrianCost: 20,
  /** Rail track per tile, on land and over water (docs/specs/evolution.md, E7b), and its monthly upkeep. */
  railCost: 60,
  railBridgeCost: 150,
  railUpkeep: 0.8,
  /** A flyover deck over a crossing road, on top of the road's own price (docs/specs/transport.md, TX2). */
  flyoverCost: 80,
  /** Moving a building costs this share of its price (plus clearing the new lot). */
  moveCostShare: 0.2,
  /** Bridges replace the per-tile road cost while over water. */
  bridgeCost: 40,
  highwayBridgeCost: 90,
  /** Longest water crossing, in tiles. */
  maxBridgeSpan: 12,
  /** Clearing cost per tree (a tile holds 1–3). */
  treeClearCost: 3,
  rocksClearCost: 6,
  boulderClearCost: 15,
  /** Small decorations (flowers, tall grass) clear for free. */
  minorDecorClearCost: 0,

  // --- Simulation (sim/population.ts) ---
  /** Sim seconds per in-game day at 1× speed. */
  secondsPerDay: 6,
  /** Sim seconds per day on the time-of-day clock (day/night, rush hours). */
  secondsPerClockDay: 240,
  clockStartHour: 7,
  daysPerMonth: 30,
  /** Share of the empty space in a home that fills each day (with road access). */
  moveInRate: 0.12,
  /** Share of residents who work. */
  workforceShare: 0.87,
  defaultMinimumWage: 1_200,
  minMinimumWage: 500,
  maxMinimumWage: 3_000,
  defaultPensionPerSenior: 1_100,
  minPensionPerSenior: 0,
  maxPensionPerSenior: 3_000,
  energyBill: 80,
  waterBill: 60,
  foodBill: 200,
  housingBill: 450,
  transportBill: 200,
  /** Monthly rent for the entire residential building, shared by its actual occupants. */
  propertyRent: { cottage: 150, family_house: 250, townhouses: 450, walkup: 600, apartment_block: 1_000, condo_tower: 2_500, villa: 1_500, luxury_apartments: 3_000 },
  /** Utility charges: common-area use scales with capacity; variable use scales with occupants. */
  propertyCommonEnergy: 0.7,
  propertyCommonWater: 0.6,
  propertyUtilityScale: [1, 1.2, 1.5],
  propertyScaleDiscount: 0.2,
  propertyOperatingShare: 0.35,
  propertyReserveMonths: 1,
  propertyAlertMonths: 3,
  propertyFinanceMonths: 6,
  propertyCriticalMonths: 9,
  propertyBankruptcyMonths: 12,
  propertyLoanInterest: 0.02,
  propertyLoanTerm: 24,
  propertyHousingIncomeLimit: 0.3,
  /** Demographic policy uses migration speed, not forced population changes. */
  demographicBirthsPerResidentYear: 0.008,
  demographicNaturalMoveInFloor: 0.55,
  demographicStimulusMoveInBonus: 0.3,
  demographicPolicySmoothing: 0.25,
  demographicIncentivePerImmigrant: 12,
  demographicIncentivePerResident: 0.08,
  demographicInfrastructureWarning: 0.75,
  demographicMaxHousingSubsidy: 0.2,
  /** Extra housing capacity sought at the maximum subsidy, relative to the population. */
  demographicSubsidizedHousingReserve: 0.2,
  policeCells: 8,
  /** Migration slows only as taxation becomes severe; ordinary unemployment affects satisfaction instead. */
  migrationCompanyTaxSlow: 70,
  migrationCompanyTaxStop: 95,
  migrationIncomeTaxSlow: 70,
  migrationIncomeTaxStop: 95,
  migrationPurchasingPowerSlow: 0.45,
  migrationPurchasingPowerStop: 0.1,
  /** Missing jobs reduce housing occupancy by at most this share, without blocking construction. */
  housingJobInfluence: 0.1,
  /** Annual senior mortality after hospitals become available, at full and zero hospital coverage. */
  annualSeniorMortalityCared: 0.02,
  annualSeniorMortalityNoHospital: 0.08,
  /** Monthly tax per resident and per worker. */
  taxPerResident: 3,
  taxPerWorker: 2,
  /** Household spending available to local businesses per resident each month (game dollars). */
  monthlyShopSpendPerResident: 300,
  /** Public-service upkeep adds one base cost per this many residents served. */
  upkeepResidentsPerBase: 1_000,
  /** Monthly upkeep per road tile. */
  roadUpkeep: 1,
  highwayUpkeep: 6,
  avenueUpkeep: 2,
  boulevardUpkeep: 4,
  expresswayUpkeep: 8,
  rampUpkeep: 2,
  pedestrianUpkeep: 1,
  /** Fallback monthly upkeep for bridge tiles; typed roads use their own bridgeUpkeep. */
  bridgeUpkeep: 3,
  /** A land road within this many tiles of a footprint gives road access. */
  roadAccessRange: 3,

  // --- Zoning & growth (sim/growth.ts, docs/specs/buildings.md) ---
  // --- Services & utilities (sim/services.ts, docs/specs/core.md) ---
  // Fires, thefts and illness: sim/systems/incidents.ts (INCIDENTS).
  /** Default tax rate in percent; income scales with rate ÷ this. */
  baseTaxRate: 9,
  minTaxRate: 0,
  maxTaxRate: 100,
  // --- Needs & happiness (sim/systems/needs.ts, docs/specs/needs.md) ---
  /** Occupancy multiplier = happinessBase + happinessRange × happiness. */
  happinessBase: 0.55,
  happinessRange: 0.45,
  /** Happiness needed to level up to level 2 and level 3. */
  happyLevel2: 0.5,
  happyLevel3: 0.7,
  /** Below this for abandonDays in a row: abandoned. At recoverLine or above for recoverDays: recovers. */
  abandonLine: 0.3,
  abandonDays: 30,
  recoverLine: 0.45,
  recoverDays: 15,
  /** Buildings below this happiness complain. */
  complainLine: 0.6,
  /** Cost per tile to zone. */
  zoneCost: 5,
  /** Days a construction site takes; the first half is the foundation, the second the scaffold. */
  constructionDays: 4,
  /** New lots per zone per day at full demand. */
  growthPerDay: 2,
  /** Upgrades per zone per day at full demand. */
  upgradesPerDay: 1,
  /** A building must be at least this full ... */
  upgradeOccupancy: 0.8,
  /** ... for this many days in a row before it can level up. */
  upgradeAfterDays: 20,
  /** City population needed before buildings can reach each level (index = level). */
  levelPopulation: [0, 0, 150, 1000],
  /** Shops follow residents; industry follows available workers. */
  shopJobsPerResident: 0.08,
  /** Office construction follows residential capacity, independent of existing job vacancies. */
  officeJobsPerHousingResident: 0.16,
  /** Reserved share of available jobs when estimating industrial demand. */
  officeJobShare: 0.35,
  /** Jobs wanted per worker (a little over 1, so there are always a few openings). */
  jobSlack: 1.05,
  /** Housing wanted per existing resident (> 1 so the city keeps growing). */
  housingSlack: 1.2,
  /** Demand that a new town starts with: residents, shop jobs and industrial jobs. */
  seedHousing: 40,
  seedOfficeJobs: 40,
  seedCommercialJobs: 6,
  seedIndustrialJobs: 20,

  // --- Evolution (docs/specs/evolution.md) ---
  /** Lifestyle: days in a row at or above lifeUpLine to move up a tier, below lifeDownLine to move down. */
  lifeDays: 30,
  lifeUpLine: 0.7,
  lifeDownLine: 0.45,
  /** Wage multiplier by lifestyle tier (Basic, Comfortable, Prosperous). */
  lifestyleWage: [1, 1.5, 2.2],
  /** Share of Comfortable and Prosperous residents a university reaches who are graduates … */
  graduateShare: 0.12,
  /** … and the office jobs each graduate adds to office demand. */
  graduateOfficeJobs: 0.6,
  /** Homes ask for their tier's expectation when it scores below this. */
  requestLine: 0.5,
  /** Garbage made per day, in tons: per resident, per shop or office worker, per industrial worker. */
  garbagePerResident: 0.02,
  garbagePerWorker: 0.01,
  garbagePerIndustrialWorker: 0.03,
  /** The garbage need reaches 0 when the pile is this many days of a building's output. */
  garbageDays: 6,
  /** A pile stops growing at this many days of output (it is already as bad as it gets). */
  garbageMaxDays: 30,
  /** The Town Hall's chest holds this many months of taxes; the toast warns from chestWarnMonths. */
  chestMonths: 6,
  chestWarnMonths: 3,
  /** Construction materials (docs/specs/evolution.md, E6): tons per $ of a building's price … */
  materialsPerCost: 0.01,
  /** … made per industrial worker a day; imported at most this much a day at this price; exported at this. */
  materialsPerWorker: 0.15,
  materialsImportPerDay: 6,
  materialsImportPrice: 25,
  materialsExportPrice: 6,
  /** Storage: a base yard plus this much per warehouse. */
  materialsStorage: 300,
  /** A new city's yard starts with this many tons. */
  materialsStarting: 60,
  materialsPerWarehouse: 400,
  /** Income per ton a recycling centre sells. */
  recyclePrice: 0.5,
} as const;
