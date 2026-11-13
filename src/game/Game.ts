import { turn, type Rotation } from '../render/view/ViewTransform';
import { buildingFrameSize, buildingHeadroom, BUILDING_VARIANTS } from '../render/atlas/buildings';
import { bridgeTexture, buildingTexture, roadTexture } from '../render/atlas/tiles';
import { roadVariant } from '../render/atlas/roads';
import { BRIDGE_ANCHOR_Y, GROUND_PAD } from '../render/atlas/geometry';
import { Renderer } from '../render/Renderer';
import { BALANCE } from '../shared/balance';
import { HALF_H, SIM_TICK_HZ } from '../shared/constants';
import { BUILDINGS, type BuildingId } from '../sim/buildings/catalog';
import { City } from '../sim/City';
import type { BurstKind } from '../render/fx/Effects';
import { applyClear, applyMove, applyRail, applyPlace, applyRoad, applyZone, planClear, type ApplyResult, type PlannedTile } from '../sim/commands';
import { buildDemoCity } from '../sim/demo';
import { tileToWorld } from '../render/iso';
import { buildingDef, isPlaceable, Lifestyle, type BuildingInstance } from '../sim/buildings/catalog';
import { Simulation } from '../sim/core/Simulation';
import type { DayOutcome } from '../sim/core/System';
import { findEntrance } from '../sim/systems/access';
import { nextStage, STAGES, unlockedAt, unlockStage, unlockTech } from '../sim/stages';
import { stageRequirements } from '../sim/progression';
import { lifestyleReport } from '../sim/systems/lifestyle';
import { currentTech, researchRate, TECHS } from '../sim/research';
import { materialStorage } from '../sim/systems/materials';
import { enlistSoldiers, issueMilitaryMove, purchaseMilitary, type MilitaryPurchase, type MilitaryActionResult } from '../sim/systems/military';
import { collectTaxes, townHall } from '../sim/systems/budget';
import { acquireProperty, financeProperty, privateRecoverProperty, repayPropertyLoan } from '../sim/systems/realEstate';
import { inspectInfo } from './inspect';
import { aqiBand } from '../sim/systems/air';
import { isWaterTerrain } from '../render/transitions';
import { windFactor } from '../sim/systems/energy';
import { demandFor } from '../sim/systems/growth';
import { isZoned, ZoneType } from '../sim/zones';
import { PAVEMENTS, ROAD_SPECS } from '../sim/roadTypes';
import { cityStats } from '../sim/systems/population';
import { economyReport } from '../sim/systems/economy';
import { societyReport } from '../sim/systems/society';
import { demographicReport, type DemographicStrategy, type PermitLimits } from '../sim/systems/demography';
import { openInvestment, openLoan, type BankResult } from '../sim/systems/bank';
import type { Traffic } from '../sim/systems/traffic';
import { happinessColor, type OverlayTile } from '../render/Renderer';
import { rectTiles, RoadType, roadMask, type BuildableRoad, type TilePos } from '../sim/roads';
import { Decor } from '../sim/terrain/types';
import { generateTerrain } from '../sim/terrain/generate';
import { loadSimulation, serialize, type SaveData } from '../sim/save';
import type { TerrainSettings } from '../sim/terrain/presets';
import type { World } from '../sim/World';
import { SoundBoard } from './audio';
import { daylightTint, nightness } from '../render/daylight';
import type { Point, ViewTransform } from '../render/view/ViewTransform';
import { EventBus, type DayNightMode, type GameEventMap, type Notice, type ProgressInfo } from './events';
import { InputController, type ScreenPoint } from './input/InputController';
import { GameLoop } from './loop';
import { type LoadProgress, type LoadStage } from './loading';
import { coveragePreviewTiles, isRoadTool, isZoneTool, planTool, type RoadToolId, strandedZoneTiles, previewTiles, TOOL_KEYS, type ToolDrag, type ToolId, type ToolPlan } from './tools';

export interface GameOptions {
  /** Preset, seed, size and sliders (see sim/terrain/presets.ts). */
  terrain: TerrainSettings;
  name: string;
  /** Starting money; defaults to BALANCE.startingFunds. */
  funds?: number;
  /** Build the planned demo city on the map before the first frame (the /demo route). */
  demo?: boolean;
  /** Continue a saved city (its terrain settings and name match `terrain` and `name`). */
  save?: SaveData;
}

/** What has changed since a save: player edits and in-game days (src/save/CitySaver.ts). */
export interface ChangeStamp {
  readonly edits: number;
  readonly day: number;
}

/** How often stats are pushed to the UI (they don't need 60 Hz React renders). */
const STATS_INTERVAL = 0.25;
/** The build ripple never takes longer than this, however long the road. */
const MAX_RIPPLE_TIME = 0.5;
/** Particle budget shared across all tiles of one action. */
const PARTICLE_BUDGET = 900;
/** Days zoned lots wait on demand before the game explains why. */
const WAIT_NOTICE_DAYS = 10;
/** Turbine blade speed at full wind and 1× (radians per second, about 17 rpm), and its cap at high game speeds. */
const ROTOR_SPIN = 1.8;
const ROTOR_SPIN_MAX = 4;
/** Sim-time multipliers for pause, 1×, 2×, 3×. */
export const GAME_SPEEDS = [0, 1, 2, 3] as const;
const DAY_NIGHT_KEY = 'citybuilder.dayNightMode';
const DAY_NIGHT_MODES: readonly DayNightMode[] = ['cycle', 'day', 'night'];
/** The clock hour shown while the mode is "always night". */
const NIGHT_HOUR = 1;

function readDayNight(): DayNightMode {
  try {
    const v = localStorage.getItem(DAY_NIGHT_KEY);
    return DAY_NIGHT_MODES.find((m) => m === v) ?? 'cycle';
  } catch {
    return 'cycle';
  }
}

/** Cursor-label names for the zone tools. */
const TOOL_LABEL = {
  'zone-r': 'Moradias',
  'zone-rh': 'Apartamentos',
  'zone-c': 'Lojas',
  'zone-ch': 'Escritórios',
  'zone-i': 'Indústria',
} as const;
/** Toast ids, unique across game instances (dev mode mounts a game twice, sharing one HUD store). */
let noticeSeq = 0;
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

/** Owns City + Renderer + input + loop. The React layer only talks to it via `events` and public methods. */
export class Game {
  readonly events = new EventBus<GameEventMap>();
  readonly city: City;
  readonly sound = new SoundBoard();
  /** The simulation core: every system (access, utilities, growth, traffic …) lives here. */
  readonly sim: Simulation;
  private readonly renderer: Renderer;
  private readonly input: InputController;
  private readonly loop: GameLoop;

  private simTick = 0;
  private hovered: TilePos | null = null;
  private toolId: ToolId = 'select';
  private buildingChoice: BuildingId = 'park';
  private speedIndex = 1;
  private inspected: number | null = null;
  private inspectedZone: TilePos | null = null;
  private selectedMilitaryUnit: number | null = null;
  private drag: ToolDrag | null = null;
  /**
   * The drag is finished but was drawn with a finger, so it waits for Build or Cancel (D-080):
   * a finger hides what it draws, and a tap shouldn't spend money.
   */
  private awaitingConfirm = false;
  private lastPointer: ScreenPoint | null = null;
  private dayNightMode = readDayNight();
  /** The data view shown over the city, if any (roads by congestion, buildings by happiness). */
  private dataView: DataView | null = null;
  /** Bumped whenever tiles or buildings change, so the minimap knows to repaint. */
  private worldVersion = 0;
  /** Utility hints already shown this game. */
  private readonly hinted = new Set<'power' | 'water'>();
  private statsTimer = 0;
  private statsFrames = 0;
  private statsTime = 0;
  /** Consecutive days each zone kind had lots held back by low demand, and when we last said so. */
  private readonly waitingDays = { r: 0, c: 0, o: 0, i: 0 };
  private readonly waitNoticeDay = { r: -Infinity, c: -Infinity, o: -Infinity, i: -Infinity };
  /** The clock day of the last brownout notice (one per clock day). */
  private brownoutDay = -1;
  private recentRoadTool: RoadToolId = 'road';
  /** The Move tool's picked-up building (id), if any. */
  /** Day of the last "waiting for materials" notice. */
  private materialsNoticeDay = -Infinity;
  /** Road tools carry the new road over crossings (flyovers) instead of joining them. */
  private flyoverMode = false;
  private carrying: number | null = null;
  private pavementChoice = 0;
  /** Player edits so far (roads, zones, buildings, taxes), for save dirty tracking. */
  private edits = 0;
  private readonly options: GameOptions;

  private constructor(sim: Simulation, renderer: Renderer, options: GameOptions) {
    this.sim = sim;
    this.city = sim.city;
    this.options = options;
    this.renderer = renderer;
    this.input = new InputController(renderer.app.canvas, renderer.camera, {
      onPointer: (p) => this.updateHover(p),
      onKey: (code) => this.onKey(code),
      onPrimaryDown: (p, shift) => this.onPrimaryDown(p, shift),
      onPrimaryMove: (p, shift) => this.onPrimaryMove(p, shift),
      onPrimaryUp: (_p, _shift, touch) => this.onPrimaryUp(touch),
      onCancel: () => this.cancel(),
      onClick: (p) => this.onClick(p),
    });
    renderer.setAgentSource(
      () => this.traffic.agents,
      () => this.traffic.stops,
      () => this.traffic.lights(),
      () => this.sim.trains.poses(),
    );
    renderer.setNeedsSource(() => this.sim.needs.byBuilding);
    renderer.setMilitarySource(() => this.city.military.units, () => this.selectedMilitaryUnit);
    // Blades turn with the day's wind, faster at higher game speeds, and stop when paused.
    renderer.setRotorSpin(() => Math.min(ROTOR_SPIN_MAX, GAME_SPEEDS[this.speedIndex] * ROTOR_SPIN * windFactor(this.world.seed, this.city.day)));
    this.loop = new GameLoop(
      SIM_TICK_HZ,
      () => this.tick(),
      (dt) => this.frame(dt),
    );
  }

  /**
   * Build the city and its renderer. `progress` hears each loading stage as it starts (D-099)
   * and may hold creation for a painted frame, so the loading screen can show it.
   */
  static async create(host: HTMLElement, opts: GameOptions, progress?: LoadProgress): Promise<Game> {
    const stage = async (s: LoadStage) => {
      await progress?.(s);
    };
    // A saved city comes back with its systems already up to date (and continues exactly).
    let sim: Simulation;
    let demo: ReturnType<typeof buildDemoCity> | null = null;
    await stage('world');
    if (opts.save) {
      sim = loadSimulation(opts.save);
    } else {
      const terrain = generateTerrain(opts.terrain);
      await stage('simulation');
      // The showcase is assembled before play and costs far more than a new town.
      const city = new City(terrain, opts.demo ? 1_000_000_000 : opts.funds);
      // Player cities unlock buildings stage by stage (D-086); the /demo showcase has everything.
      city.locked = !opts.demo;
      // ... and collect their taxes by hand at the Town Hall (docs/specs/evolution.md, E5).
      city.collectsTaxes = !opts.demo;
      // ... and build with materials their industry makes (E6), starting with a small yard.
      city.needsMaterials = !opts.demo;
      city.materials = BALANCE.materialsStarting;
      demo = opts.demo ? buildDemoCity(city, opts.terrain.seed) : null;
      if (demo) city.funds = opts.funds ?? BALANCE.startingFunds;
      sim = new Simulation(city);
      if (demo) sim.worldChanged({ roads: true });
    }
    const world = sim.world;
    const renderer = await Renderer.create(host, world, stage);
    await stage('enter');
    const game = new Game(sim, renderer, opts);
    // Start over downtown (a little zoomed out), or over what the player built in a saved city.
    const centre = demo?.centre ?? (opts.save ? builtCentre(world) : null);
    if (centre) {
      game.afterSimChange();
      const p = tileToWorld(centre.x, centre.y);
      renderer.camera.jumpTo(p.x, p.y, 0.8);
    }
    game.loop.speed = GAME_SPEEDS[game.speedIndex];
    game.loop.start();
    return game;
  }

  get world(): World {
    return this.city.world;
  }

  /** The city as a save (docs/specs/saving.md). A few ms even for a big city. */
  snapshot(): SaveData {
    return serialize(this.city, this.options.terrain, this.options.name, this.sim);
  }

  get changeStamp(): ChangeStamp {
    return { edits: this.edits, day: this.city.day };
  }

  get traffic(): Traffic {
    return this.sim.traffic.traffic;
  }

  get tool(): ToolId {
    return this.toolId;
  }

  get building(): BuildingId {
    return this.buildingChoice;
  }

  /** Pick what the Build tool places (and switch to it). */
  setBuilding(id: BuildingId) {
    if (!isPlaceable(id)) return;
    this.buildingChoice = id;
    this.events.emit('building', id);
    if (this.toolId !== 'build') this.setTool('build');
    else this.updatePreview();
  }

  private plan(drag: ToolDrag | null, hovered: TilePos | null) {
    return planTool(this.world, this.toolId, drag, hovered, this.buildingChoice, this.carrying, this.flyoverMode);
  }

  // ---------------------------------------------------------------- tools

  /** The road tool the Roads button returns to. */
  get lastRoadTool(): RoadToolId {
    return this.recentRoadTool;
  }

  /** Footpath style for new roads (0 = each road type's default; else PAVEMENTS index + 1). */
  get pavement(): number {
    return this.pavementChoice;
  }

  /** Road tools: build flyovers over the roads a drag crosses (docs/specs/transport.md, TX2). */
  setFlyover(on: boolean) {
    this.flyoverMode = on;
    this.sound.play('tool');
    this.events.emit('flyover', on);
    this.updatePreview();
  }

  get flyover(): boolean {
    return this.flyoverMode;
  }

  setPavement(pave: number) {
    this.pavementChoice = Math.max(0, Math.min(PAVEMENTS.length, Math.round(pave)));
    this.sound.play('tool');
    this.events.emit('pavement', this.pavementChoice);
  }

  /** The style to store for a road: the pick, if the road has footpaths to pave. */
  private pavementFor(type: BuildableRoad): number {
    return ROAD_SPECS[type].pavement ? this.pavementChoice : 0;
  }

  /**
   * The Move tool: the first click picks a building up, the next sets it down where the
   * cursor is (docs/specs/buildings.md, "Moving"). Esc or right-click drops the pick.
   */
  private moveClick(t: TilePos) {
    if (this.carrying === null) {
      const b = this.world.buildings.get(this.world.building[this.world.index(t.x, t.y)]);
      if (!b) return;
      if (b.construction > 0) {
        this.sound.play('error');
        this.notify('error', 'Esta construção ainda não terminou. Mova-a depois de pronta.');
        return;
      }
      this.carrying = b.id;
      this.sound.play('tool');
      this.notify('info', `Movendo ${BUILDINGS[b.def].name}: clique no novo local (Esc para cancelar)`);
      this.updatePreview();
      return;
    }
    const p = this.plan(null, t);
    if (!p || p.kind !== 'move') return;
    const funds = this.city.funds;
    const moved = this.carrying;
    this.execute(p);
    // Moved (money spent): back to Select with the building still selected at its new place.
    if (this.city.funds < funds) {
      this.setTool('select');
      this.inspect(moved);
      return;
    }
    this.updatePreview();
  }

  /** Start moving a building straight away (the info panel's Move button). */
  startMove(id: number) {
    if (!this.world.buildings.has(id)) return;
    this.setTool('move');
    const b = this.world.buildings.get(id);
    if (b) this.moveClick({ x: b.x, y: b.y });
    this.inspect(null);
  }

  setTool(tool: ToolId) {
    if (tool !== 'move') this.carrying = null;
    if (isRoadTool(tool)) this.recentRoadTool = tool;
    if (tool !== this.toolId) this.sound.play('tool');
    this.toolId = tool;
    this.drag = null;
    this.awaitingConfirm = false;
    this.renderer.app.canvas.style.cursor = tool === 'select' ? '' : 'crosshair';
    this.renderer.hover.set(tool === 'select' ? this.hovered : null);
    this.renderer.setZoneView(isZoneTool(tool));
    this.events.emit('tool', tool);
    this.updatePreview();
  }

  /** World tile under a screen point, clamped to the map (works in any view rotation). */
  private tileAt(screen: ScreenPoint): TilePos {
    return this.renderer.screenToTile(screen.x, screen.y, true) ?? { x: 0, y: 0 };
  }

  // ---------------------------------------------------------------- view rotation

  get rotation(): Rotation {
    return this.renderer.rotation;
  }

  /** Turn the camera a quarter turn (+1 or −1). The city itself doesn't change. */
  rotate(step: 1 | -1) {
    const r = turn(this.renderer.rotation, step);
    this.renderer.setRotation(r);
    this.sound.play('tool');
    this.events.emit('rotation', r);
    this.bumpWorld();
    this.updatePreview();
  }

  private onPrimaryDown(screen: ScreenPoint, shift: boolean): boolean {
    if (this.toolId === 'select') return false;
    const t = this.tileAt(screen);
    if (this.toolId === 'move') {
      this.lastPointer = screen;
      this.moveClick(t);
      return true;
    }
    this.drag = { start: t, current: t, straight: shift };
    this.awaitingConfirm = false;
    this.lastPointer = screen;
    this.updatePreview();
    return true;
  }

  private onPrimaryMove(screen: ScreenPoint, shift: boolean) {
    if (!this.drag) return;
    const t = this.tileAt(screen);
    this.lastPointer = screen;
    if (t.x === this.drag.current.x && t.y === this.drag.current.y && shift === this.drag.straight) {
      this.emitPreviewLabel();
      return;
    }
    this.drag = { ...this.drag, current: t, straight: shift };
    this.updatePreview();
  }

  private onPrimaryUp(touch: boolean) {
    if (!this.drag) return;
    if (touch) {
      // Keep the drag as a draft: its preview stays on the map until the player confirms.
      this.awaitingConfirm = true;
      this.emitPreviewLabel();
      return;
    }
    this.commitDrag();
  }

  /** Build the drafted touch drag (the confirm bar's Build button). */
  confirmDraft() {
    if (this.awaitingConfirm) this.commitDrag();
  }

  private commitDrag() {
    const p = this.drag ? this.plan(this.drag, null) : null;
    this.drag = null;
    this.awaitingConfirm = false;
    if (p) this.execute(p);
    this.updatePreview();
  }

  /** Apply a tool plan: mutate the world, then refresh rendering, sim caches and UI. */
  private execute(p: ToolPlan) {
    // What's on each tile before it changes decides the particles (leaves, grit, dust).
    const debris = this.debrisOf(p.plan.tiles);
    // Rezoning or dezoning removes grown buildings; they get a puff of dust.
    if (p.kind === 'zone') {
      for (const t of p.plan.tiles) {
        const i = this.world.index(t.x, t.y);
        if (t.valid && this.world.building[i] !== -1) debris.set(i, 'dust');
      }
    }
    let result: ApplyResult;
    if (p.kind === 'road') result = applyRoad(this.city, p.plan, p.roadType, this.pavementFor(p.roadType));
    else if (p.kind === 'clear') result = applyClear(this.city, p.plan);
    else if (p.kind === 'zone') result = applyZone(this.city, p.plan, p.zone);
    else if (p.kind === 'move') result = applyMove(this.city, p.plan);
    else if (p.kind === 'rail') result = applyRail(this.city, p.plan);
    else result = applyPlace(this.city, p.plan, Math.floor(Math.random() * BUILDING_VARIANTS));

    if (p.kind === 'move' && !p.plan.ok) {
      this.sound.play('error');
      this.notify('error', 'Não é possível mover para lá: o terreno deve estar livre de vias, água e outros edifícios');
    } else if (p.kind === 'place' && !p.plan.ok) {
      this.sound.play('error');
      this.notify('error', p.plan.note ?? 'Não é possível construir lá: o terreno deve estar livre de vias e água');
    } else if (result.ok && result.changed) {
      this.edits++;
      const c = result.changed;
      // Roads change which zoned lots can grow up to roadAccessRange tiles away; refresh that far.
      const g = p.kind === 'road' || p.kind === 'clear' ? BALANCE.roadAccessRange : 0;
      const rect = { x: c.minX - g, y: c.minY - g, w: c.maxX - c.minX + 1 + 2 * g, h: c.maxY - c.minY + 1 + 2 * g };
      this.renderer.refreshWorld(rect);
      this.events.emit('funds', this.city.funds);
      this.buildFeedback(p, result.tiles ?? [], debris);
      if (p.kind === 'zone') this.warnUnreachableZones(result.tiles ?? []);
      // Track changes the train network the commute model plans over, like roads.
      this.afterWorldChange(p.kind === 'road' || p.kind === 'clear' || p.kind === 'rail');
    } else if (result.reason === 'insufficient-funds') {
      this.sound.play('error');
      this.notify('error', `Dinheiro insuficiente: precisa de $${p.plan.cost.toLocaleString()}`);
    } else if (result.reason === 'locked' && p.kind === 'rail') {
      this.sound.play('error');
      this.notify('error', 'Os trilhos exigem a pesquisa Transporte rápido (Centro de pesquisa, estágio Metrópole)');
    } else if (result.reason === 'locked' && p.kind === 'place') {
      const stage = STAGES[unlockStage(p.plan.building)];
      const tech = unlockTech(p.plan.building);
      const name = buildingDef(p.plan.building).name;
      this.sound.play('error');
      this.notify(
        'error',
        this.city.stage >= unlockStage(p.plan.building) && tech
          ? `${name} exige a pesquisa ${TECHS.find((t) => t.id === tech)?.name ?? tech}`
          : `${name} é desbloqueado no estágio ${stage.name} (${stage.population.toLocaleString()} moradores)`,
      );
    }
  }

  /** Zones only grow within reach of a road; say so when some of the new zone can't. */
  private warnUnreachableZones(tiles: readonly PlannedTile[]) {
    const far = tiles.filter((t) => findEntrance(this.world, t.x, t.y, 1, 1, BALANCE.roadAccessRange) === -1).length;
    if (far === 0) return;
    const all = far === tiles.length;
    this.notify(
      'info',
      all
        ? `Sem via por perto: zonas só crescem a até ${BALANCE.roadAccessRange} quadrados de uma via (R)`
        : `${far} de ${tiles.length} quadrados da zona estão a mais de ${BALANCE.roadAccessRange} quadrados de uma via e não vão crescer`,
    );
  }

  /** Roads or buildings changed by the player: update the systems, then everything on screen. */
  private afterWorldChange(roadsChanged: boolean) {
    this.sim.worldChanged({ roads: roadsChanged });
    this.afterSimChange();
  }

  /** The systems are up to date: refresh the minimap, badges, hints and panels. */
  private afterSimChange() {
    this.bumpWorld();
    this.refreshDataView();
    this.renderer.indicators.setTaxesWaiting(this.city.collectsTaxes && this.city.uncollected > 0, this.world);
    this.renderer.indicators.sync(this.world);
    this.hintUtilities();
    if (this.inspected !== null && !this.world.buildings.has(this.inspected)) this.inspect(null);
    this.emitInspect();
    this.emitCity();
    // Power and water change with every edit, not only at the next hour or day.
    this.emitBudget();
  }

  // ---------------------------------------------------------------- simulation

  get speed(): number {
    return this.speedIndex;
  }

  /** 0 = paused, 1–3 = 1×, 2×, 3×. */
  setSpeed(index: number) {
    this.speedIndex = Math.max(0, Math.min(GAME_SPEEDS.length - 1, index));
    this.loop.speed = GAME_SPEEDS[this.speedIndex];
    this.sound.play('tool');
    this.emitCity();
  }

  private lastSpeed = 1;
  togglePause() {
    if (this.speedIndex === 0) this.setSpeed(this.lastSpeed);
    else {
      this.lastSpeed = this.speedIndex;
      this.setSpeed(0);
    }
  }

  private newDay(out: DayOutcome) {
    this.showDay(out);
    this.explainMaterials();
    this.showMilestones(out);
    this.explainWaitingZones();
    // Congestion changes every day, even when no buildings did.
    if (out.changed.length === 0) this.refreshDataView();
    const r = out.budget;
    if (r) {
      for (const months of [BALANCE.propertyAlertMonths, BALANCE.propertyFinanceMonths, BALANCE.propertyCriticalMonths, BALANCE.propertyBankruptcyMonths]) {
        const affected = r.propertyFlows.milestones.filter((m) => m.months === months);
        if (affected.length === 0) continue;
        const names = affected.slice(0, 3).map((m) => { const b = this.world.buildings.get(m.id); return b ? `${BUILDINGS[b.def].name} (${b.x}, ${b.y})` : `imóvel ${m.id}`; });
        const phase = months === BALANCE.propertyBankruptcyMonths ? 'em falência' : months === BALANCE.propertyCriticalMonths ? 'em situação crítica' : months === BALANCE.propertyFinanceMonths ? 'aptos a financiamento' : 'inadimplentes';
        this.notify('error', `${affected.length} imóvel(is) ${phase}: ${names.join(', ')}${affected.length > 3 ? '…' : ''}.`, `property-${months}`);
      }
      this.events.emit('funds', this.city.funds);
      const month = MONTH_NAMES[(this.city.date.month + 11) % 12];
      const sign = r.net >= 0 ? '+' : '−';
      const held = this.sim.budget.held;
      if (held) {
        // Taxes wait at the Town Hall (docs/specs/evolution.md, E5).
        const where = townHall(this.world) ? 'Recolha-os na Prefeitura' : 'Construa uma Prefeitura para recolhê-los';
        const lost = held.lost > 0 ? ` O cofre está cheio: $${Math.round(held.lost).toLocaleString()} foram perdidos.` : '';
        this.notify(
          held.filling || held.lost > 0 ? 'error' : 'info',
          `${month}: despesas de $${r.expenses.toLocaleString()} pagas. $${Math.round(held.waiting).toLocaleString()} em receitas aguardando. ${where}.${lost}`,
          'taxes',
        );
      } else {
        this.notify(
          r.net >= 0 ? 'info' : 'error',
          `Orçamento de ${month}: ${sign}$${Math.abs(r.net).toLocaleString()} (receitas $${r.income.toLocaleString()}, despesas $${r.expenses.toLocaleString()})`,
          'budget',
        );
      }
      this.renderer.indicators.setTaxesWaiting(this.city.collectsTaxes && this.city.uncollected > 0, this.world);
    }
    this.emitCity();
    this.emitBudget();
    this.emitInspect();
  }

  /** A new stage (with what it unlocks) or the first homes reaching a better lifestyle. */
  private showMilestones(out: DayOutcome) {
    if (out.stage !== null) {
      const def = STAGES[out.stage];
      const unlocked = this.city.locked ? unlockedAt(out.stage).map((id) => buildingDef(id).name) : [];
      this.sound.play('build');
      this.notify('milestone', `Sua cidade agora é ${def.name}!${unlocked.length ? ` Novidades: ${unlocked.join(', ')}.` : ''} ${def.news}`.trim(), `stage-${out.stage}`);
    }
    if (out.research) {
      this.sound.play('coin');
      this.notify('milestone', `Pesquisa concluída: ${out.research.name}. ${out.research.effect}.`, `research-${out.research.id}`);
    }
    if (out.lifestyle === Lifestyle.Comfortable) {
      this.notify('milestone', 'Os moradores estão prosperando: as primeiras moradias alcançaram o nível Confortável. Têm renda maior e querem um hospital por perto.', 'lifestyle-1');
    } else if (out.lifestyle === Lifestyle.Prosperous) {
      this.notify('milestone', 'As primeiras moradias alcançaram o nível Próspero! Têm renda maior e querem uma universidade.', 'lifestyle-2');
    }
  }

  /**
   * Show a day's outcome: dust for new construction sites, a pop for finished buildings,
   * smoke and a toast for fires. Then refresh what's on screen if anything changed.
   */
  private showDay(out: DayOutcome) {
    if (out.changed.length === 0) return;
    this.renderer.refreshWorld(...out.changed);
    const fx = this.renderer.effects;
    for (const id of out.started) {
      const b = this.world.buildings.get(id);
      if (!b) continue;
      const { w, h } = BUILDINGS[b.def].size;
      for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) fx.burst(x, y, 'dust', 3, Math.random() * 0.3);
    }
    for (const id of out.completed) {
      const b = this.world.buildings.get(id);
      if (b) this.popBuilding(b, 0);
    }
    if (out.abandoned.length > 0) {
      const first = this.world.buildings.get(out.abandoned[0]);
      const name = first ? BUILDINGS[first.def].name : 'edifício';
      this.notify(
        'error',
        out.abandoned.length === 1
          ? `${name} foi abandonado: os moradores estavam infelizes. Veja "Os moradores dizem".`
          : `${out.abandoned.length} edifícios foram abandonados. Veja "Os moradores dizem".`,
        'abandoned',
      );
    }
    this.showBurned();
    this.afterSimChange();
  }

  /**
   * Buildings fires took since the last day (the incident system burns them on its tick):
   * dust where they stood and one toast. Other incident events are not shown yet.
   */
  private showBurned() {
    const burned = this.sim.incidents.takeEvents().flatMap((e) => (e.type === 'burned' ? [e.building] : []));
    if (burned.length === 0) return;
    const fx = this.renderer.effects;
    for (const b of burned) {
      const { w, h } = BUILDINGS[b.def].size;
      for (let y = b.y; y < b.y + h; y++) for (let x = b.x; x < b.x + w; x++) fx.burst(x, y, 'dust', 10, Math.random() * 0.4);
    }
    this.sound.play('clear');
    const name = BUILDINGS[burned[0].def].name;
    this.notify(
      'error',
      burned.length === 1 ? `Um incêndio destruiu ${name}. Construa um quartel dos bombeiros por perto.` : `${burned.length} edifícios foram destruídos pelo fogo. Construa quartéis dos bombeiros para proteger a cidade.`,
      'fire',
    );
  }

  /** The "pop" a building makes when it appears. */
  private popBuilding(b: BuildingInstance, delay: number) {
    const { w, h } = BUILDINGS[b.def].size;
    const frame = buildingFrameSize(b.def, b.variant);
    this.renderer.effects.pop(
      [
        {
          // Fractional tile coords put the pop at the footprint's centre.
          x: b.x + (w - 1) / 2,
          y: b.y + (h - 1) / 2,
          texture: buildingTexture(this.renderer.textures, b.def, b.variant, this.renderer.rotation),
          anchorY: (buildingHeadroom(b.def, b.variant) + GROUND_PAD + ((w + h) * HALF_H) / 2) / frame.h,
        },
      ],
      delay,
    );
  }

  private bumpWorld() {
    this.worldVersion++;
    this.events.emit('worldChanged', this.worldVersion);
  }

  // ---------------------------------------------------------------- minimap & clock

  /** The current view transform (the minimap paints in view space). */
  get view(): ViewTransform {
    return this.renderer.view;
  }

  /** Screen corners in view-tile coordinates. */
  viewportTiles(): Point[] {
    return this.renderer.viewportTiles();
  }

  /** Glide the camera to a view-tile point (minimap click). */
  lookAt(p: Point) {
    this.renderer.panToViewTile(p);
  }

  get trafficView(): boolean {
    return this.dataView === 'traffic';
  }

  /** Show or hide the traffic overlay (roads coloured by congestion). */
  setTrafficView(on: boolean) {
    this.showDataView(on ? 'traffic' : null);
  }

  get happinessView(): boolean {
    return this.dataView === 'happiness';
  }

  /** Show or hide the happiness view (buildings coloured green → red). */
  setHappinessView(on: boolean) {
    this.showDataView(on ? 'happiness' : null);
  }

  get airView(): boolean {
    return this.dataView === 'air';
  }

  /** Show or hide the air quality view (land tinted by AQI). */
  setAirView(on: boolean) {
    this.showDataView(on ? 'air' : null);
  }

  private showDataView(view: DataView | null) {
    this.dataView = view;
    this.refreshDataView();
    this.sound.play('tool');
    this.events.emit('trafficView', view === 'traffic');
    this.events.emit('happinessView', view === 'happiness');
    this.events.emit('airView', view === 'air');
  }

  /** Redraw the active data view from today's numbers. */
  private refreshDataView() {
    if (this.dataView === 'traffic') this.renderer.setTrafficOverlay(this.sim.commute.congestion);
    else if (this.dataView === 'happiness') this.renderer.setDataOverlay(this.happinessTiles());
    else if (this.dataView === 'air') this.renderer.setDataOverlay(this.airTiles());
    else this.renderer.setDataOverlay(null);
  }

  /** Every land tile, coloured by the AQI of its air cell. */
  private airTiles(): OverlayTile[] {
    const w = this.world;
    const tiles: OverlayTile[] = [];
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const i = w.index(x, y);
        if (isWaterTerrain(w.terrain[i])) continue;
        tiles.push({ tile: i, color: aqiBand(this.sim.air.aqiAt(x, y)).color });
      }
    }
    return tiles;
  }

  /** Every zoned building's footprint, coloured by its happiness. */
  private happinessTiles(): OverlayTile[] {
    const w = this.world;
    const tiles: OverlayTile[] = [];
    for (const b of w.buildings.values()) {
      const n = this.sim.needs.byBuilding.get(b.id);
      if (!n) continue;
      const color = happinessColor(n.happiness, b.abandoned);
      const { w: bw, h: bh } = BUILDINGS[b.def].size;
      for (let y = b.y; y < b.y + bh; y++) for (let x = b.x; x < b.x + bw; x++) tiles.push({ tile: w.index(x, y), color });
    }
    return tiles;
  }

  /** A building's happiness and need scores for the info panel (null for civic buildings). */
  /** Glide the camera to a world tile (the Citizens panel's "Show me"). */
  focusTile(x: number, y: number) {
    this.lookAt(this.renderer.view.pointToView(x, y));
  }

  /** Focus and inspect the building selected by a complaint diagnostic. */
  focusBuilding(id: number) {
    const b = this.world.buildings.get(id);
    if (!b) return;
    this.focusTile(b.x, b.y);
    this.inspect(id);
  }

  get dayNight(): DayNightMode {
    return this.dayNightMode;
  }

  setDayNight(mode: DayNightMode) {
    this.dayNightMode = mode;
    try {
      localStorage.setItem(DAY_NIGHT_KEY, mode);
    } catch {
      // Storage unavailable: the setting just won't persist.
    }
    this.events.emit('dayNight', mode);
  }

  /** The hour the world is drawn at: the clock, or fixed for "always day/night". */
  private visibleHour(): number | null {
    if (this.dayNightMode === 'day') return null;
    return this.dayNightMode === 'night' ? NIGHT_HOUR : this.city.hour;
  }

  /** Once per game: explain missing power or water the first time homes go without. */
  private hintUtilities() {
    const r = this.sim.utilities.report;
    for (const kind of ['power', 'water'] as const) {
      if (r[kind].short === 0) this.resolve(`needs-${kind}`);
      if (this.hinted.has(kind) || r[kind].short === 0) continue;
      this.hinted.add(kind);
      this.notify(
        'info',
        kind === 'power'
          ? 'Os edifícios precisam de energia: construa uma usina (Serviços → Infraestrutura) na mesma rede viária. Carvão e gás funcionam dia e noite; vento e sol são limpos, mas variam.'
          : 'Os edifícios precisam de água: construa uma torre de água (Serviços → Infraestrutura) a até 14 quadrados deles',
        `needs-${kind}`,
      );
    }
  }

  // ---------------------------------------------------------------- budget

  get taxRate(): number {
    return this.city.taxRate;
  }

  setTaxRate(rate: number) {
    this.city.taxRate = Math.max(BALANCE.minTaxRate, Math.min(BALANCE.maxTaxRate, Math.round(rate)));
    this.edits++;
    this.emitBudget();
    this.emitCity();
  }

  setIncomeTaxRate(rate: number) {
    this.city.incomeTaxRate = Math.max(0, Math.min(100, Math.round(rate)));
    this.edits++;
    this.emitBudget();
    this.emitCity();
  }

  setMinimumWage(amount: number) {
    this.city.minimumWage = Math.max(BALANCE.minMinimumWage, Math.min(BALANCE.maxMinimumWage, Math.round(amount)));
    this.edits++;
    this.emitBudget();
    this.emitCity();
  }

  setPensionPerSenior(amount: number) {
    this.city.pensionPerSenior = Math.max(BALANCE.minPensionPerSenior, Math.min(BALANCE.maxPensionPerSenior, Math.round(amount)));
    this.edits++;
    this.emitBudget();
    this.emitCity();
  }

  setCostTaxRate(kind: import('../sim/systems/livingCosts').CostKind, rate: number) {
    this.city.costTaxRates[kind] = Math.max(0, Math.min(100, Math.round(rate)));
    this.edits++;
    this.emitBudget();
    this.emitCity();
  }

  setDemographicStrategy(strategy: DemographicStrategy) {
    this.city.demography.strategy = strategy;
    this.edits++; this.emitCity(); this.emitBudget();
  }

  setAnnualGrowthTarget(target: number) {
    this.city.demography.annualTarget = Math.max(0, Math.min(10, target));
    this.edits++; this.emitCity(); this.emitBudget();
  }

  setMigrationIncentives(enabled: boolean) {
    this.city.demography.incentivesEnabled = enabled;
    this.edits++; this.emitCity(); this.emitBudget();
  }

  setHousingSubsidy(percent: number) {
    this.city.demography.housingSubsidy = Math.max(0, Math.min(BALANCE.demographicMaxHousingSubsidy, percent / 100));
    this.edits++; this.emitCity(); this.emitBudget();
  }

  setPermitLimits(limits: PermitLimits) {
    for (const zone of ['r', 'c', 'o', 'i'] as const) {
      this.city.demography.permitLimits[zone] = Math.max(0, Math.min(9999, Math.round(limits[zone])));
    }
    this.edits++; this.emitCity(); this.emitBudget();
  }

  enlistMilitary(quantity: number): MilitaryActionResult {
    return this.finishMilitaryAction(enlistSoldiers(this.city, quantity));
  }

  purchaseMilitary(item: MilitaryPurchase, quantity: number): MilitaryActionResult {
    return this.finishMilitaryAction(purchaseMilitary(this.city, item, quantity));
  }

  private finishMilitaryAction(result: MilitaryActionResult): MilitaryActionResult {
    if (result.ok) {
      this.edits++;
      this.events.emit('funds', this.city.funds);
      this.emitBudget();
    }
    return result;
  }

  investAtBank(amount: number, months: number): BankResult {
    const result = openInvestment(this.city, amount, months);
    if (result.ok) { this.edits++; this.events.emit('funds', this.city.funds); this.emitCity(); this.emitBudget(); }
    return result;
  }

  borrowFromBank(amount: number, months: number): BankResult {
    const result = openLoan(this.city, amount, months);
    if (result.ok) { this.edits++; this.events.emit('funds', this.city.funds); this.emitCity(); this.emitBudget(); }
    return result;
  }

  /** Budget panel data: the tax rate, last month's report and what next month looks like now. */
  emitBudget() {
    const u = this.sim.utilities.report;
    this.events.emit('budget', {
      taxRate: this.city.taxRate,
      incomeTaxRate: this.city.incomeTaxRate,
      minimumWage: this.city.minimumWage,
      pensionPerSenior: this.city.pensionPerSenior,
      costTaxRates: { ...this.city.costTaxRates },
      last: this.sim.budget.last,
      forecast: this.sim.budget.forecast(),
      power: u.power,
      water: u.water,
      hour: Math.floor(this.city.hour),
      taxes: this.city.collectsTaxes ? { waiting: Math.round(this.city.uncollected), hasTownHall: townHall(this.world) !== null } : null,
      materials: this.city.needsMaterials ? { ...this.sim.materials.report, stock: this.city.materials, storage: materialStorage(this.city) } : null,
    });
  }

  /** Construction stalled for want of materials: say so, at most once a month (E6). */
  private explainMaterials() {
    const r = this.sim.materials.report;
    if (r.waiting === 0 && this.city.needsMaterials) this.resolve('materials');
    if (r.waiting === 0 || this.city.day - this.materialsNoticeDay < BALANCE.daysPerMonth) return;
    this.materialsNoticeDay = this.city.day;
    this.notify('error', 'As obras aguardam materiais: crie zonas industriais para produzi-los (as importações fornecem só um pouco por dia)', 'materials');
  }

  /**
   * Zoned lots that sit empty because nobody wants them yet look broken. After WAIT_NOTICE_DAYS
   * of that, say why and what raises the demand, at most once a month per zone kind.
   */
  private explainWaitingZones() {
    const diagnostics = this.sim.growth.diagnostics(this.sim.materials.report.imported);
    for (const k of ['r', 'c', 'o', 'i'] as const) {
      const counts = diagnostics[k];
      const blocked = counts.noRoad + counts.noDemand + counts.materials + counts.noModel;
      this.waitingDays[k] = blocked > 0 ? this.waitingDays[k] + 1 : 0;
      if (blocked === 0) this.resolve(`zones-${k}`);
      if (this.waitingDays[k] < WAIT_NOTICE_DAYS || this.city.day - this.waitNoticeDay[k] < BALANCE.daysPerMonth) continue;
      this.waitNoticeDay[k] = this.city.day;
      const what = { r: 'residenciais', c: 'comerciais', o: 'de escritórios', i: 'industriais' }[k];
      this.notify('info', `${blocked} terrenos ${what} vazios não estão crescendo: ${this.sim.growth.explainWithDiagnostics(diagnostics)[k]}`, `zones-${k}`);
    }
  }

  /**
   * A new clock hour: the grid was re-balanced, so refresh the budget panel, and explain the
   * first brownout of each clock day (docs/specs/energy.md).
   */
  private newHour() {
    this.emitBudget();
    const p = this.sim.utilities.report.power;
    const clockDay = Math.floor(this.city.clock / BALANCE.secondsPerClockDay);
    if (p.short === 0) this.resolve('brownout');
    if (p.short === 0 || this.brownoutDay === clockDay) return;
    this.brownoutDay = clockDay;
    const hour = String(Math.floor(this.city.hour)).padStart(2, '0');
    const cause = p.sources.solar === 0 && p.sources.wind < 1 && p.storage === 0 ? ' A energia solar não funciona à noite;' : '';
    this.notify(
      'error',
      `Falta de energia às ${hour}:00: ${p.short} edifício${p.short === 1 ? '' : 's'} sem eletricidade.${cause} adicione bancos de baterias ou uma usina a carvão ou gás.`,
      'brownout',
    );
    this.emitCity();
  }

  /** Push current city stats to listeners (also used by the UI bridge on connect). */
  emitCity() {
    const s = cityStats(this.world, this.city.taxRate, this.city.society, this.city);
    const diagnostics = this.sim.growth.diagnostics(this.sim.materials.report.imported);
    let cars = 0;
    for (const a of this.traffic.agents) if (a.kind !== 'person') cars++;
    this.events.emit('city', {
      ...s,
      economy: economyReport(this.world, this.city.taxRate, this.city),
      society: societyReport(this.city),
      demography: demographicReport(this.city),
      bank: { nextId: this.city.bank.nextId, investments: this.city.bank.investments.map((item) => ({ ...item })), loans: this.city.bank.loans.map((item) => ({ ...item })) },
      demand: this.sim.growth.demand(),
      demandWhy: this.sim.growth.explainWithDiagnostics(diagnostics),
      traffic: this.sim.commute.report,
      needs: this.sim.needs.report,
      power: this.sim.utilities.report.power,
      water: this.sim.utilities.report.water,
      date: this.city.date,
      speed: this.speedIndex,
      cars,
      people: this.traffic.agents.length - cars,
      progress: this.progressInfo(),
      air: this.sim.air.report,
    });
    if (this.inspectedZone) this.emitZoneInspect();
  }

  private progressInfo(): ProgressInfo {
    const stage = this.city.stage;
    const next = nextStage(stage);
    return {
      stage,
      stageName: STAGES[stage].name,
      locked: this.city.locked,
      next: next === null ? null : { name: STAGES[next].name, requirements: stageRequirements(this.world, next) },
      residents: lifestyleReport(this.city).residents,
      research: this.researchInfo(),
      techs: TECHS.slice(0, this.city.research.done).map((t) => t.id),
    };
  }

  private researchInfo(): ProgressInfo['research'] {
    const rate = researchRate(this.city);
    const r = this.city.research;
    if (rate === 0 && r.done === 0 && r.points === 0) return null;
    const tech = currentTech(this.city);
    return {
      current: tech ? { name: tech.name, effect: tech.effect, points: Math.floor(r.points), needed: tech.points } : null,
      done: TECHS.slice(0, r.done).map((t) => t.name),
      rate,
    };
  }

  // ---------------------------------------------------------------- inspect

  private onClick(screen: ScreenPoint) {
    if (this.toolId !== 'select') return;
    const t = this.tileAt(screen);
    const clickedUnit = [...this.city.military.units]
      .map((unit) => ({ unit, distance: Math.hypot(unit.x - (t.x + 0.5), unit.y - (t.y + 0.5)) }))
      .filter(({ distance }) => distance <= 0.78)
      .sort((a, b) => a.distance - b.distance)[0]?.unit;
    if (clickedUnit) {
      this.selectedMilitaryUnit = clickedUnit.id;
      this.inspect(null);
      this.notify('info', `${this.militaryUnitLabel(clickedUnit.kind)} selecionado. Clique no mapa para mover.`);
      return;
    }
    if (this.selectedMilitaryUnit !== null) {
      const result = issueMilitaryMove(this.city, this.selectedMilitaryUnit, t.x, t.y);
      if (result === 'ok') {
        this.selectedMilitaryUnit = null;
        this.notify('info', 'Ordem de deslocamento enviada.');
        return;
      }
      if (result === 'blocked') {
        this.notify('error', 'Destino inacessível: unidades terrestres não atravessam água ou prédios.');
        return;
      }
      this.selectedMilitaryUnit = null;
    }
    const id = this.world.building[this.world.index(t.x, t.y)];
    if (id === -1 && isZoned(this.world.zone[this.world.index(t.x, t.y)])) {
      this.inspected = null;
      this.inspectedZone = t;
      this.emitInspect();
      this.emitZoneInspect();
      this.updatePreview();
    } else this.inspect(id === -1 ? null : id);
  }

  private militaryUnitLabel(kind: string) {
    return ({ soldier: 'Soldado', patrol: 'Viatura', transport: 'Caminhão militar', armored: 'Blindado', helicopter: 'Helicóptero' } as Record<string, string>)[kind] ?? 'Unidade';
  }

  /** Open the info panel for a building (or close it with null). */
  inspect(id: number | null) {
    if (id !== null && id !== this.inspected) this.sound.play('tool');
    this.inspected = id;
    this.inspectedZone = null;
    this.emitInspect();
    this.events.emit('zoneInspect', null);
    this.updatePreview();
  }

  private emitInspect() {
    const b = this.inspected === null ? undefined : this.world.buildings.get(this.inspected);
    this.events.emit('inspect', b ? inspectInfo(this.sim, b) : null);
  }

  private emitZoneInspect() {
    const t = this.inspectedZone;
    const lot = t && this.sim.growth.lotAt(t.x, t.y, this.sim.materials.report.imported);
    if (!lot) this.inspectedZone = null;
    const name = lot && ({
      [ZoneType.Residential]: 'Terreno residencial',
      [ZoneType.ResidentialHigh]: 'Terreno para apartamentos',
      [ZoneType.Commercial]: 'Terreno para lojas',
      [ZoneType.CommercialHigh]: 'Terreno para escritórios',
      [ZoneType.Industrial]: 'Terreno industrial',
    } as Record<number, string>)[lot.zone];
    this.events.emit('zoneInspect', lot ? { x: lot.x, y: lot.y, name: name ?? 'Terreno vazio', title: lot.title, detail: lot.detail, waiting: lot.reason === 'queued' } : null);
  }

  /** Collect the taxes waiting at the Town Hall (info panel and budget panel buttons). */
  collectTaxes() {
    const r = collectTaxes(this.city);
    if (!r.ok) {
      this.sound.play('error');
      const why = {
        'no-town-hall': 'Construa uma Prefeitura para recolher os impostos',
        'town-hall-off-road': 'Conecte a Prefeitura a uma via para recolher os impostos',
        'nothing-waiting': 'Ainda não há impostos a recolher: eles chegam no fim de cada mês',
      } as const;
      this.notify('error', why[r.reason]);
      return;
    }
    this.sound.play('coin');
    this.notify('info', `$${r.amount.toLocaleString()} recolhidos em impostos`);
    this.resolve('taxes');
    this.events.emit('funds', this.city.funds);
    this.renderer.indicators.setTaxesWaiting(false, this.world);
    this.emitCity();
    this.emitBudget();
    this.emitInspect();
  }

  /** Bulldoze a whole building (from the info panel). */
  financeProperty(id: number) {
    const b = this.world.buildings.get(id);
    if (!b || !financeProperty(this.city, b)) { this.notify('error', 'Financiamento indisponível: verifique dívida, prazo e caixa público.'); return; }
    this.notify('info', 'Dívida quitada com financiamento público. As parcelas serão cobradas mensalmente.');
    this.events.emit('funds', this.city.funds);
    this.emitBudget(); this.emitInspect(); this.emitCity();
  }

  acquireProperty(id: number) {
    const b = this.world.buildings.get(id);
    if (!b || !acquireProperty(this.city, b)) { this.notify('error', 'Aquisição indisponível para este imóvel ou sem recursos.'); return; }
    this.notify('info', 'Imóvel adquirido pela cidade. Aluguel e manutenção entram no orçamento público.');
    this.events.emit('funds', this.city.funds);
    this.emitBudget(); this.emitInspect(); this.emitCity();
  }

  privateRecoverProperty(id: number) {
    const b = this.world.buildings.get(id);
    if (!b || !privateRecoverProperty(b)) return;
    this.notify('info', 'O imóvel foi vendido a um novo proprietário privado.');
    this.emitBudget(); this.emitInspect();
  }

  repayPropertyLoan(id: number) {
    const b = this.world.buildings.get(id);
    if (!b || !repayPropertyLoan(this.city, b)) { this.notify('error', 'As reservas do imóvel ainda não cobrem a quitação.'); return; }
    this.notify('info', 'Financiamento quitado com as reservas do imóvel.');
    this.events.emit('funds', this.city.funds);
    this.emitBudget(); this.emitInspect(); this.emitCity();
  }

  demolish(id: number) {
    const b = this.world.buildings.get(id);
    if (!b) return;
    const { w, h } = BUILDINGS[b.def].size;
    const plan = planClear(this.world, rectTiles({ x: b.x, y: b.y }, { x: b.x + w - 1, y: b.y + h - 1 }));
    this.execute({ kind: 'clear', tool: 'clear', plan });
    this.inspect(null);
  }

  /** Restore a damaged power plant immediately, paying its type-specific repair cost. */
  repairBuilding(id: number) {
    const b = this.world.buildings.get(id);
    if (!b) return;
    const energy = buildingDef(b.def).energy;
    const cost = energy?.repairCost;
    if (!energy || energy.source === 'battery' || !cost || b.condition >= 1) return;
    if (this.city.funds < cost) {
      this.notify('error', `Reparar ${BUILDINGS[b.def].name} custa $${cost.toLocaleString()}`);
      return;
    }
    this.city.funds -= cost;
    b.condition = 1;
    b.repairDays = 0;
    this.edits++;
    this.sim.worldChanged({ roads: false });
    this.bumpWorld();
    this.emitInspect();
    this.emitBudget();
    this.emitCity();
    this.notify('info', `${BUILDINGS[b.def].name} reparado e funcionando plenamente`);
  }

  private debrisOf(tiles: readonly PlannedTile[]): Map<number, BurstKind> {
    const w = this.world;
    const out = new Map<number, BurstKind>();
    for (const t of tiles) {
      if (!t.valid) continue;
      const i = w.index(t.x, t.y);
      const d = w.decor[i];
      if (w.tree[i] > 0) out.set(i, 'leaves');
      else if (d === Decor.Rocks || d === Decor.Boulder) out.set(i, 'rocks');
    }
    return out;
  }

  /** Pop + particles rippling along the build order, with matching sound. */
  private buildFeedback(p: ToolPlan, tiles: readonly PlannedTile[], debris: Map<number, BurstKind>) {
    const n = tiles.length;
    if (n === 0) return;
    const fx = this.renderer.effects;
    if (p.kind === 'move') {
      // It lands with a pop and a little dust.
      const b = this.world.buildings.get(p.plan.moving);
      if (b) this.popBuilding(b, 0);
      for (const t of tiles) fx.burst(t.x, t.y, 'dust', 4, Math.random() * 0.15);
      this.sound.play('build');
      return;
    }
    const stagger = Math.min(0.02, MAX_RIPPLE_TIME / n);
    const perTile = Math.max(1, Math.min(6, Math.floor(PARTICLE_BUDGET / n)));

    tiles.forEach((t, k) => {
      const kind = debris.get(this.world.index(t.x, t.y));
      if (kind) fx.burst(t.x, t.y, kind, perTile, k * stagger);
    });

    if (p.kind === 'place') {
      const b = this.world.buildings.get(this.world.building[this.world.index(p.plan.origin.x, p.plan.origin.y)]);
      if (b) this.popBuilding(b, 0);
      tiles.forEach((t, k) => fx.burst(t.x, t.y, 'dust', 6, k * 0.03));
      this.sound.play('build', 0, 0.8);
      return;
    }

    if (p.kind === 'zone') {
      tiles.forEach((t, k) => {
        if (debris.has(this.world.index(t.x, t.y))) fx.burst(t.x, t.y, 'dust', perTile, k * stagger);
      });
      if (debris.size > 0) this.sound.play('clear');
      const ticks = Math.min(6, n);
      for (let k = 0; k < ticks; k++) this.sound.play('tick', (k / ticks) * n * stagger, 1 + (k / ticks) * 0.35);
      return;
    }

    if (p.kind === 'road') {
      const tex = this.renderer.textures;
      const view = this.renderer.view;
      const type = p.roadType;
      // The look the renderer will use: a one-way direction turned into the view, or the pavement.
      const variantOf = (t: PlannedTile) => {
        const i = this.world.index(t.x, t.y);
        const lane = this.world.lane[i];
        const viewLane = lane === 0 ? 0 : Math.log2(view.mask(1 << (lane - 1))) + 1;
        return roadVariant(type, viewLane, this.world.pave[i]);
      };
      fx.pop(
        tiles.map((t) => ({
          x: t.x,
          y: t.y,
          texture: t.bridge
            ? bridgeTexture(tex, type, view.bridgeAxis(t.bridge), variantOf(t))
            : roadTexture(tex, type, view.mask(roadMask(this.world, t.x, t.y)), variantOf(t)),
          anchorY: t.bridge ? BRIDGE_ANCHOR_Y : 0.5,
        })),
        stagger,
      );
      tiles.forEach((t, k) => fx.burst(t.x, t.y, t.bridge ? 'splash' : 'dust', Math.ceil(perTile / 2), k * stagger));
      this.sound.play(tiles.some((t) => t.bridge) ? 'bridge' : 'build');
      // Ticks follow the ripple, rising in pitch.
      const ticks = Math.min(8, n);
      for (let k = 1; k < ticks; k++) this.sound.play('tick', (k / ticks) * n * stagger, 1 + (k / ticks) * 0.35);
    } else {
      tiles.forEach((t, k) => {
        if (!debris.has(this.world.index(t.x, t.y))) fx.burst(t.x, t.y, 'dust', Math.ceil(perTile / 2), k * stagger);
      });
      this.sound.play('clear');
    }
  }

  get muted(): boolean {
    return this.sound.muted;
  }

  setMuted(muted: boolean) {
    this.sound.setMuted(muted);
    this.events.emit('muted', muted);
  }

  /** Right click / Esc: drop the drag if there is one, otherwise put the tool away. */
  cancel() {
    if (this.selectedMilitaryUnit !== null) {
      this.selectedMilitaryUnit = null;
      return;
    }
    if (this.carrying !== null) {
      // Put it back down where it was (nothing moved yet).
      this.carrying = null;
      this.updatePreview();
      return;
    }
    if (this.drag) {
      this.drag = null;
      this.awaitingConfirm = false;
      this.updatePreview();
    } else if (this.toolId !== 'select') {
      this.setTool('select');
    }
  }

  private updatePreview() {
    const p = this.plan(this.drag, this.hovered);
    const inspected = this.toolId === 'select' && this.inspected !== null ? this.world.buildings.get(this.inspected) : undefined;
    if (inspected) {
      // Show both the footprint and the service/power reach of the inspected facility.
      const { w, h } = BUILDINGS[inspected.def].size;
      const tex = this.renderer.textures.selection;
      this.renderer.toolPreview.show(
        [
          ...coveragePreviewTiles(this.world, this.renderer.textures, inspected.def, { x: inspected.x, y: inspected.y }),
          ...rectTiles({ x: inspected.x, y: inspected.y }, { x: inspected.x + w - 1, y: inspected.y + h - 1 }).map((t) => ({
            ...t,
            texture: tex,
            tint: 0x4fd1c5,
            alpha: 0.55,
          })),
        ],
      );
    } else if (!p) this.renderer.toolPreview.clear();
    else this.renderer.toolPreview.show(previewTiles(this.world, this.renderer.textures, p, this.renderer.view, this.pavementChoice));
    this.emitPreviewLabel();
  }

  private emitPreviewLabel() {
    // Drags always show a label; the Build tool also labels the hovered spot before you click.
    const hoverLabel = this.toolId === 'build' || (this.toolId === 'move' && this.carrying !== null);
    const p = this.drag ? this.plan(this.drag, null) : hoverLabel ? this.plan(null, this.hovered) : null;
    if (!p || !this.lastPointer) {
      this.events.emit('toolPreview', null);
      return;
    }
    this.events.emit('toolPreview', {
      tool: this.toolId,
      label:
        p.kind === 'move' ? `Mover ${BUILDINGS[p.plan.building].name}` : p.kind === 'place' ? BUILDINGS[p.plan.building].name : p.kind === 'zone' ? TOOL_LABEL[p.tool] : null,
      blocked: (p.kind === 'place' || p.kind === 'move') && !p.plan.ok,
      screen: this.lastPointer,
      cost: p.plan.cost,
      count: p.plan.count,
      affordable: p.plan.cost <= this.city.funds,
      note: this.previewNote(p),
      awaitingConfirm: this.drag !== null && this.awaitingConfirm,
    });
  }

  private previewNote(p: ToolPlan): string | null {
    const stranded = strandedZoneTiles(this.world, p);
    if (stranded > 0) return stranded === p.plan.count ? 'precisa de uma via próxima para crescer' : `${stranded} quadrado${stranded === 1 ? '' : 's'} precisa${stranded === 1 ? '' : 'm'} de uma via próxima`;
    // Zoning where nobody wants to build yet is fine, but say so, or the empty lots look broken.
    if (p.kind === 'zone' && demandFor(this.sim.growth.demand(), p.zone) <= 0) return 'sem demanda ainda: crescerá quando a barra subir';
    return null;
  }

  /** A toast; with a `key` it is also kept in the alerts inbox until resolved or dismissed. */
  private notify(kind: Notice['kind'], message: string, key?: string) {
    const { year, month, dayOfMonth } = this.city.date;
    const date = `${MONTH_NAMES[month]} ${dayOfMonth}, ano ${year}`;
    this.events.emit('notice', { id: ++noticeSeq, kind, message, ...(key && { key, date }) });
  }

  /** An ongoing problem is gone: clear its alert. */
  private resolve(key: string) {
    this.events.emit('resolve', key);
  }

  // ---------------------------------------------------------------- loop

  /** Fixed-step simulation: runs SIM_TICK_HZ × speed times per second (GameLoop handles speed). */
  private tick() {
    this.simTick++;
    const hour = Math.floor(this.city.hour);
    const out = this.sim.tick();
    if (Math.floor(this.city.hour) !== hour) this.newHour();
    if (out) this.newDay(out);
  }

  private frame(dt: number) {
    this.input.update(dt);
    // The clock and traffic advance every frame, scaled by game speed.
    this.sim.frame(dt * GAME_SPEEDS[this.speedIndex]);
    const hour = this.visibleHour();
    this.renderer.setDaylight(hour === null ? 0xffffff : daylightTint(hour));
    this.renderer.render(dt);

    this.statsFrames++;
    this.statsTime += dt;
    this.statsTimer += dt;
    if (this.statsTimer >= STATS_INTERVAL) {
      const r = this.renderer;
      this.events.emit('clock', this.city.hour);
      this.updateAmbience();
      this.events.emit('stats', {
        fps: this.statsFrames / this.statsTime,
        frameMs: (this.statsTime / this.statsFrames) * 1000,
        drawCalls: r.drawCalls,
        visibleChunks: r.ground.visibleChunks,
        totalChunks: r.ground.totalChunks,
        visibleSprites: r.ground.visibleSprites,
        agents: this.traffic.agents.length,
        agentsDrawn: r.agents.visible,
        bootAtlasMs: r.timings.atlas,
        bootChunksMs: r.timings.chunks,
        zoom: r.camera.zoom,
        mapSize: this.world.width,
        seed: this.world.seed,
        simTick: this.simTick,
        systems: this.sim.timings.snapshot().slice(0, 5),
      });
      this.statsTimer = 0;
      this.statsFrames = 0;
      this.statsTime = 0;
    }
  }

  /** Wind when zoomed out, city hum from the cars on screen, birds by day away from traffic. */
  private updateAmbience() {
    const r = this.renderer;
    const z = r.camera.zoom;
    const running = this.speedIndex > 0;
    const cars = r.agents.visible;
    const city = running ? Math.min(1, cars / 60) : 0;
    const hour = this.visibleHour();
    const night = hour === null ? 0 : nightness(hour);
    this.sound.setAmbience({
      wind: Math.min(1, Math.max(0.25, 1.3 - z * 0.7)),
      city,
      birds: (1 - night) * Math.max(0, 1 - cars / 25) * (z > 0.5 ? 1 : 0.4),
    });
  }

  private updateHover(screen: ScreenPoint | null) {
    let tile: TilePos | null = null;
    if (screen) {
      tile = this.renderer.screenToTile(screen.x, screen.y, false);
    }
    if (screen && this.toolId === 'build') {
      this.lastPointer = screen;
      if (!this.drag) this.emitPreviewLabel();
    }
    if (tile?.x === this.hovered?.x && tile?.y === this.hovered?.y) return;
    this.hovered = tile;
    this.renderer.hover.set(this.toolId === 'select' ? tile : null);
    this.events.emit('hover', tile);
    if (!this.drag) this.updatePreview();
  }

  private onKey(code: string) {
    if (code === 'KeyG') this.setGrid(!this.renderer.ground.gridOn);
    else if (code === 'KeyM') this.setMuted(!this.sound.muted);
    else if (code === 'KeyT') this.setTrafficView(this.dataView !== 'traffic');
    else if (code === 'KeyY') this.setHappinessView(this.dataView !== 'happiness');
    else if (code === 'KeyO') this.setAirView(this.dataView !== 'air');
    else if (code === 'KeyL') this.setDayNight(DAY_NIGHT_MODES[(DAY_NIGHT_MODES.indexOf(this.dayNightMode) + 1) % DAY_NIGHT_MODES.length]);
    else if (code === 'Period') this.rotate(1);
    else if (code === 'Comma') this.rotate(-1);
    else if (code === 'Space') this.togglePause();
    else if (code === 'BracketLeft') this.setSpeed(Math.max(1, this.speedIndex - 1));
    else if (code === 'BracketRight') this.setSpeed(this.speedIndex + 1);
    // P moves the selected building (the info panel's Move button).
    else if (code === TOOL_KEYS.move) {
      if (this.inspected !== null) this.startMove(this.inspected);
    } else if (code === 'Escape') {
      if (this.inspected !== null && !this.drag) this.inspect(null);
      else this.cancel();
    }
    else {
      const tool = (Object.keys(TOOL_KEYS) as ToolId[]).find((t) => TOOL_KEYS[t] === code);
      if (tool) this.setTool(tool === this.toolId ? 'select' : tool);
    }
  }

  setGrid(on: boolean) {
    this.renderer.ground.setGrid(on);
    this.events.emit('grid', on);
  }

  destroy() {
    this.loop.stop();
    this.input.destroy();
    this.events.clear();
    this.sound.destroy();
    this.renderer.destroy();
  }
}

/** The map's data views (one at a time). */
type DataView = 'traffic' | 'happiness' | 'air';

/** The centre of what the player built (roads and buildings), or of the map if nothing yet. */
function builtCentre(world: World): TilePos {
  let x = 0;
  let y = 0;
  let n = 0;
  for (let i = 0; i < world.road.length; i++) {
    if (world.road[i] === RoadType.None && world.building[i] === -1) continue;
    x += i % world.width;
    y += Math.floor(i / world.width);
    n++;
  }
  return n === 0 ? { x: world.width / 2, y: world.height / 2 } : { x: Math.round(x / n), y: Math.round(y / n) };
}
