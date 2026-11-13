import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { Agent, BusStop, TrafficLight } from '../sim/systems/traffic';
import type { RailCarPose } from '../sim/systems/trains';
import { QuadBatch, tintColor } from './ground/TileMesh';
import { tileQuadPoints } from './view/lift';
import type { World } from '../sim/World';
import type { TileRect } from './view/ViewTransform';
import { ViewTransform, type Point, type Rotation } from './view/ViewTransform';
import { ViewWorld } from './view/ViewWorld';
import { Camera } from './Camera';
import { Bubbles } from './overlays/Bubbles';
import type { BuildingNeeds } from '../sim/systems/needs';
import { BorderRenderer } from './BorderRenderer';
import { borderRing, generateBorderlands } from '../sim/terrain/borderlands';
import { releaseTileShaders } from './ground/TileMesh';
import { HEIGHT_STEP, TILE_W } from '../shared/constants';
import { surfaceHeight } from '../sim/terrain/elevation';
import { ChunkRenderer } from './ChunkRenderer';
import { buildTerrainTextures, type TerrainTextures } from './atlas/tiles';
import { loadMilitaryAssets } from './atlas/buildings/militaryAssets';
import { mapWorldBounds, tileToWorld, worldToTileFloat } from './iso';
import { HoverHighlight } from './overlays/HoverHighlight';
import { ToolPreview } from './overlays/ToolPreview';
import { Effects } from './fx/Effects';
import { Rotors } from './fx/Rotors';
import { Smoke } from './fx/Smoke';
import { AgentRenderer } from './agents/AgentRenderer';
import { Indicators } from './overlays/Indicators';
import { Ambient } from './ambient/Ambient';
import { MilitaryRenderer } from './agents/MilitaryRenderer';
import type { MilitaryUnit } from '../sim/systems/military';

/** Mutable handle to the current view, shared with overlays, effects and agents. */
export interface ViewRef {
  current: ViewTransform;
  /** The world re-laid out in view space (heights for lifting things onto the terrain). */
  ground: World;
}

/** One tile of a data view: a world tile index and its colour. */
export interface OverlayTile {
  tile: number;
  color: number;
}

/** Happiness colour: red (miserable) → yellow → green (happy); abandoned is near-black. */
export function happinessColor(h: number, abandoned: boolean): number {
  if (abandoned) return 0x2b2b30;
  return h < 0.3 ? 0xef4444 : h < 0.45 ? 0xfb923c : h < 0.6 ? 0xfacc15 : h < 0.75 ? 0xa3e635 : 0x22c55e;
}

/** Congestion colour: green, yellow, orange, red (docs/specs/traffic.md). */
export function congestionColor(c: number): number {
  return c < 0.6 ? 0x4ade80 : c < 1 ? 0xfacc15 : c < 1.5 ? 0xfb923c : 0xef4444;
}

/** Opacity of buildings and trees while the traffic overlay is on. */
const TRAFFIC_VIEW_FADE = 0.25;

/** Seconds for the fade-in after a rotation. */
const ROTATE_FADE = 0.28;
/** Zone layer strength outside the zone view (zone tools show it at full strength). */
const ZONE_ALPHA = 0.45;

/**
 * Owns the Pixi application and the world scene graph:
 *   stage
 *   └─ worldRoot (camera transform)
 *      ├─ terrain  (slab, dual-grid ground masked to the map, roads, grid; rebuilt on rotation)
 *      ├─ agents   (cars; below buildings)
 *      ├─ daylight (multiply: night darkens the ground and traffic)
 *      ├─ objects  (trees, decorations, buildings, lit windows; night is a per-sprite tint here)
 *      ├─ pedestrians (above objects so buildings don't hide people on the streets)
 *      ├─ ambient lower, rotors, smoke, fx (tinted for night)
 *      ├─ ambient upper (beacons, birds)
 *      └─ overlay  (tool ghosts, hover, warning badges)
 *
 * Everything below worldRoot is drawn in *view* space (the map after the current
 * number of quarter turns). Callers pass world tile coordinates; this class and
 * the overlays convert through `viewRef`. See docs/decisions.md D-032.
 */
export class Renderer {
  readonly app: Application;
  readonly camera = new Camera();
  readonly worldRoot = new Container();
  private readonly terrain = new Container();
  readonly objects = new Container();
  readonly overlay = new Container();
  readonly viewRef: ViewRef;
  readonly toolPreview: ToolPreview;
  ground!: ChunkRenderer;
  hover!: HoverHighlight;
  textures!: TerrainTextures;
  effects!: Effects;
  /** Animated plumes from smokestacks and cooling towers. */
  smoke!: Smoke;
  /** Spinning wind-turbine blades. */
  rotors!: Rotors;
  /** Blade speed in radians per real second (set by the game from wind and game speed). */
  private rotorSpin: () => number = () => 0;
  agents!: AgentRenderer;
  military!: MilitaryRenderer;
  indicators!: Indicators;
  /** Clouds, fountains, beacons and birds (render/ambient). */
  ambient!: Ambient;
  private daylightColor = 0xffffff;
  private viewWorld!: ViewWorld;
  /** Borderlands: decorative land round the map (render-only), regenerated if the map edge changes. */
  private ext!: World;
  private readonly ring: number;
  border!: BorderRenderer;
  private agentSource: () => readonly Agent[] = () => [];
  private stopSource: () => readonly BusStop[] = () => [];
  private lightSource: () => readonly TrafficLight[] = () => [];
  private trainSource: () => readonly RailCarPose[] = () => [];
  private militarySource: () => readonly MilitaryUnit[] = () => [];
  private selectedMilitarySource: () => number | null = () => null;
  private needsSource: () => ReadonlyMap<number, BuildingNeeds> = () => new Map();
  bubbles!: Bubbles;
  /** Traffic overlay: road tiles tinted by congestion (null = off). */
  private readonly trafficLayer = new Container();
  private overlayTiles: readonly OverlayTile[] | null = null;
  private rotateFade = 0;
  /** Multiply layer for the day/night tint, over the world but under tool overlays. */
  private readonly daylight = new Sprite(Texture.WHITE);
  private zoneView = false;
  /** Boot timings (ms) for the debug overlay. */
  readonly timings = { atlas: 0, chunks: 0 };

  /** Draw calls issued during the last rendered frame (WebGL only). */
  drawCalls = 0;
  private drawCallCounter = 0;

  private constructor(
    app: Application,
    private readonly world: World,
  ) {
    this.app = app;
    this.viewRef = { current: new ViewTransform(world.width, world.height, 0), ground: world };
    this.ring = borderRing(world.width);
    this.toolPreview = new ToolPreview(this.viewRef);
  }

  /**
   * Start the graphics, paint the art atlas and build the map. `stage` hears each step as it
   * starts (the game's loading screen) and may hold creation for a painted frame.
   */
  static async create(host: HTMLElement, world: World, stage?: (s: 'graphics' | 'art' | 'map') => Promise<void>): Promise<Renderer> {
    await stage?.('graphics');
    const app = new Application();
    await app.init({
      resizeTo: host,
      // WebGL, else WebGPU, never Pixi's Canvas fallback: it can't draw the ground meshes, so a
      // browser without WebGL got a silent black map. Without either, Game.create fails and the
      // game screen says how to fix it.
      preference: ['webgl', 'webgpu'],
      background: '#0d1117',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false,
      powerPreference: 'high-performance',
    });
    const r = new Renderer(app, world);
    try {
      await loadMilitaryAssets().catch(() => undefined);
      await stage?.('art');
      r.setupArt();
      await stage?.('map');
      r.setupMap();
    } catch (err) {
      // Don't leave a live WebGL context behind: browsers allow only a few.
      app.destroy(true, { children: true });
      throw err;
    }
    host.appendChild(app.canvas);
    return r;
  }

  get view(): ViewTransform {
    return this.viewRef.current;
  }

  /** Where the agent layer reads cars, people and bus stops from each frame. */
  setAgentSource(
    source: () => readonly Agent[],
    stops: () => readonly BusStop[],
    lights: () => readonly TrafficLight[],
    trains: () => readonly RailCarPose[] = () => [],
  ) {
    this.agentSource = source;
    this.stopSource = stops;
    this.lightSource = lights;
    this.trainSource = trains;
  }

  setMilitarySource(units: () => readonly MilitaryUnit[], selected: () => number | null) {
    this.militarySource = units;
    this.selectedMilitarySource = selected;
  }

  /** Where the complaint bubbles read each building's needs from. */
  /** How fast turbine blades turn, in radians per real second. */
  setRotorSpin(spin: () => number) {
    this.rotorSpin = spin;
  }

  setNeedsSource(source: () => ReadonlyMap<number, BuildingNeeds>) {
    this.needsSource = source;
  }

  /** Show road congestion (per world tile, volume ÷ capacity) as coloured road tiles, or hide it with null. */
  setTrafficOverlay(congestion: Float32Array | null) {
    if (!congestion) return this.setDataOverlay(null);
    const w = this.world;
    const tiles: OverlayTile[] = [];
    for (let i = 0; i < w.road.length; i++) {
      if (w.road[i] === 0 || w.bridge[i] !== 0) continue;
      tiles.push({ tile: i, color: congestionColor(congestion[i]) });
    }
    this.setDataOverlay(tiles);
  }

  /**
   * A data view (traffic, happiness …): world tiles tinted on the ground, with buildings and
   * trees faded so the colours show between them. null hides it. Call again whenever the
   * numbers change; rotation redraws it automatically.
   */
  setDataOverlay(tiles: readonly OverlayTile[] | null) {
    this.overlayTiles = tiles;
    this.trafficLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.objects.alpha = tiles ? TRAFFIC_VIEW_FADE : 1;
    if (!tiles) return;
    const w = this.world;
    const batch = new QuadBatch();
    for (const t of tiles) {
      const x = t.tile % w.width;
      const y = (t.tile - x) / w.width;
      const v = this.view.tileToView(x, y);
      const color = tintColor(t.color, 1);
      batch.add({ texture: this.textures.selection, points: tileQuadPoints(this.viewWorld, v.x, v.y), colors: [color, color, color, color, color], grow: 0 });
    }
    if (!batch.empty) this.trafficLayer.addChild(batch.build());
  }

  /** Paint the texture atlas (terrain, buildings, vehicles, effects): the longest boot step. */
  private setupArt() {
    const t0 = performance.now();
    this.textures = buildTerrainTextures();
    this.timings.atlas = performance.now() - t0;
  }

  /** Build the layers and the ground meshes, and put the camera over the map. */
  private setupMap() {
    const tex = this.textures;
    this.effects = new Effects(tex.fx, this.viewRef);
    this.smoke = new Smoke(tex.fx.puff, this.viewRef);
    this.rotors = new Rotors(this.viewRef);
    this.ambient = new Ambient(tex.ambient, this.viewRef);
    this.agents = new AgentRenderer(tex, this.viewRef);
    this.military = new MilitaryRenderer(this.viewRef);
    this.indicators = new Indicators({ road: tex.warnRoad, power: tex.warnPower, water: tex.warnWater, coin: tex.taxCoin }, this.viewRef);
    this.hover = new HoverHighlight(tex.hover, this.viewRef);
    const t0 = performance.now();
    this.ext = generateBorderlands(this.world, this.ring);
    this.buildTerrain();
    this.timings.chunks = performance.now() - t0;
    this.bubbles = new Bubbles(tex.bubbles, this.viewRef);
    this.overlay.addChild(this.toolPreview.container, this.hover.container, this.indicators.container, this.bubbles.container);

    this.daylight.blendMode = 'multiply';
    this.daylight.visible = false;
    // The multiply layer darkens ground and traffic only; objects take the night as a tint so lit windows can shine.
    this.worldRoot.addChild(
      this.terrain,
      this.agents.container,
      this.daylight,
      this.objects,
      this.agents.people,
      this.military.container,
      this.agents.raised,
      this.ambient.lower,
      this.rotors.container,
      this.smoke.container,
      this.effects.container,
      this.ambient.upper,
      this.overlay,
    );
    this.app.stage.addChild(this.worldRoot);

    this.camera.setScreenSize(this.app.screen.width, this.app.screen.height);
    const b = mapWorldBounds(this.view.viewW, this.view.viewH);
    this.camera.jumpTo((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 1);

    this.instrumentDrawCalls();
  }

  /** (Re)build the view-space copy of the world and its chunked terrain for the current rotation. */
  private buildTerrain() {
    const grid = this.ground?.gridOn ?? false;
    if (this.ground) this.ground.destroy();
    this.border?.destroy();
    this.viewWorld = new ViewWorld(this.view, this.world.seed);
    this.viewWorld.sync(this.world);
    this.viewRef.ground = this.viewWorld;
    this.smoke?.invalidate();
    this.rotors?.invalidate();
    this.ambient?.invalidate();
    this.ground = new ChunkRenderer(this.viewWorld, this.textures, (id) => this.world.buildings.get(id));
    this.ground.setNight(this.daylightColor);
    this.border = new BorderRenderer(this.ext, this.ring, this.viewWorld, this.view.r, this.textures);
    this.terrain.addChild(
      this.border.ground,
      this.ground.groundMask,
      this.ground.groundRoot,
      this.border.line,
      this.ground.zonesRoot,
      this.ground.roadsRoot,
      this.ground.gridRoot,
      this.trafficLayer,
    );
    if (this.overlayTiles) this.setDataOverlay(this.overlayTiles);
    this.ground.zonesRoot.alpha = this.zoneView ? 1 : ZONE_ALPHA;
    // Ring trees behind the map draw before its objects, the ones in front after.
    this.objects.addChild(this.border.backObjects, this.ground.objectsRoot, this.border.frontObjects);
    this.border.backObjects.tint = this.daylightColor;
    this.border.frontObjects.tint = this.daylightColor;
    this.ground.setGrid(grid);
    // Allow panning a quarter of the way into the borderlands.
    const b = mapWorldBounds(this.view.viewW, this.view.viewH);
    this.camera.setFitWidth(b.maxX - b.minX);
    const m = this.ring * 0.25 * TILE_W;
    this.camera.setBounds({ minX: b.minX - m, maxX: b.maxX + m, minY: b.minY - m / 2, maxY: b.maxY + m / 2 });
  }

  get rotation(): Rotation {
    return this.view.r;
  }

  /** Turn the view, keeping the world point at the centre of the screen where it is. */
  setRotation(r: Rotation) {
    if (r === this.view.r) return;
    const cam = this.camera;
    const before = worldToTileFloat(cam.x, cam.y);
    const centre = this.view.pointToWorld(before.x, before.y);
    this.viewRef.current = new ViewTransform(this.world.width, this.world.height, r);
    this.buildTerrain();
    const after = this.view.pointToView(centre.x, centre.y);
    const p = tileToWorld(after.x, after.y);
    cam.jumpTo(p.x, p.y, cam.zoom);
    this.indicators.sync(this.world);
    this.rotateFade = ROTATE_FADE;
  }

  /** World changed inside these rects (world tiles): re-sync the view copy once and rebuild touched chunks. */
  refreshWorld(...rects: TileRect[]) {
    if (rects.length === 0) return;
    this.viewWorld.sync(this.world);
    this.ground.refresh(
      rects.map((rect) => {
        const r = this.view.rectToView(rect);
        return { minX: r.x, minY: r.y, maxX: r.x + r.w - 1, maxY: r.y + r.h - 1 };
      }),
    );
  }

  /** Day/night colour (0xffffff = plain daylight, which hides the layer). */
  setDaylight(color: number) {
    this.daylight.tint = color;
    this.daylight.visible = color !== 0xffffff;
    if (color === this.daylightColor) return;
    this.daylightColor = color;
    this.agents.setDaylight(color);
    this.ground.setNight(color);
    for (const c of [this.border.backObjects, this.border.frontObjects, this.ambient.lower, this.rotors.container, this.smoke.container, this.effects.container]) c.tint = color;
  }

  /** Corners of the screen as continuous *view* tile coordinates (for the minimap). */
  viewportTiles(): Point[] {
    const cam = this.camera;
    return [
      [0, 0],
      [cam.screenW, 0],
      [cam.screenW, cam.screenH],
      [0, cam.screenH],
    ].map(([sx, sy]) => {
      const w = cam.screenToWorld(sx, sy);
      return worldToTileFloat(w.x, w.y);
    });
  }

  /** Glide the camera to a continuous view-tile point. */
  panToViewTile(p: Point) {
    const w = tileToWorld(p.x, p.y);
    this.camera.panTo(w.x, w.y);
  }

  /** Show zones at full strength (while a zone tool is active). */
  setZoneView(on: boolean) {
    this.zoneView = on;
    this.ground.zonesRoot.alpha = on ? 1 : ZONE_ALPHA;
  }

  /**
   * World tile under a screen point (CSS px), clamped to the map. On sloped ground this
   * iterates: guess a height, project to a tile point at that height, read the surface
   * there, repeat. It converges because slopes rise less than HALF_H per tile.
   */
  screenToTile(sx: number, sy: number, clamp: boolean): Point | null {
    const w = this.camera.screenToWorld(sx, sy);
    let t = worldToTileFloat(w.x, w.y);
    let h = 0;
    for (let k = 0; k < 8; k++) {
      t = worldToTileFloat(w.x, w.y + h * HEIGHT_STEP);
      const next = surfaceHeight(this.viewWorld, t.x, t.y);
      if (Math.abs(next - h) < 0.01) break;
      h = next;
    }
    const vx = Math.floor(t.x);
    const vy = Math.floor(t.y);
    const v = this.view;
    if (!clamp && (vx < 0 || vy < 0 || vx >= v.viewW || vy >= v.viewH)) return null;
    const cx = Math.min(v.viewW - 1, Math.max(0, vx));
    const cy = Math.min(v.viewH - 1, Math.max(0, vy));
    return v.tileToWorld(cx, cy);
  }

  /** Wrap the GL draw functions so the debug overlay can show draw calls per frame. */
  private instrumentDrawCalls() {
    const gl = (this.app.renderer as { gl?: WebGL2RenderingContext }).gl;
    if (!gl) return;
    const names = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const;
    for (const name of names) {
      const original = gl[name] as (...args: unknown[]) => void;
      if (typeof original !== 'function') continue;
      // Safe: we replace a method with a wrapper of the same arity that forwards all args.
      // The GL context type has no index signature, so a double cast is needed to assign by name.
      (gl as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        this.drawCallCounter++;
        original.apply(gl, args);
      };
    }
  }

  render(dt: number) {
    const cam = this.camera;
    cam.setScreenSize(this.app.screen.width, this.app.screen.height);
    cam.update(dt);

    this.worldRoot.scale.set(cam.zoom);
    this.worldRoot.position.set(cam.screenW / 2 - cam.x * cam.zoom, cam.screenH / 2 - cam.y * cam.zoom);
    if (this.rotateFade > 0) {
      this.rotateFade = Math.max(0, this.rotateFade - dt);
      const t = 1 - this.rotateFade / ROTATE_FADE;
      this.worldRoot.alpha = 0.35 + 0.65 * t * (2 - t);
    } else if (this.worldRoot.alpha !== 1) this.worldRoot.alpha = 1;

    const viewRect = cam.viewRect();
    if (this.daylight.visible) {
      this.daylight.position.set(viewRect.minX, viewRect.minY);
      this.daylight.width = viewRect.maxX - viewRect.minX;
      this.daylight.height = viewRect.maxY - viewRect.minY;
    }
    this.ground.cull(viewRect);
    this.ground.animate(dt, cam.zoom);
    this.border.cull(viewRect);
    this.border.update(dt);
    this.agents.update(this.world, this.agentSource(), this.stopSource(), this.lightSource(), viewRect, cam.zoom, this.trainSource());
    this.military.update(this.world, this.militarySource(), this.selectedMilitarySource(), viewRect);
    this.ground.update(dt);
    this.hover.update(dt);
    this.toolPreview.update(dt);
    this.effects.update(dt);
    this.smoke.update(dt, viewRect, cam.zoom);
    this.rotors.update(dt, viewRect, this.rotorSpin());
    this.ambient.update(dt, viewRect, cam.zoom, this.daylightColor);
    this.indicators.update(dt);
    this.bubbles.update(dt, this.world, this.needsSource(), viewRect, cam.zoom);

    this.drawCallCounter = 0;
    this.app.render();
    this.drawCalls = this.drawCallCounter;
  }

  destroy() {
    // Shaders hold the atlas pages; let go of them before the textures are destroyed.
    this.ground.destroy();
    releaseTileShaders(this.textures.sources);
    this.app.destroy(true, { children: true, texture: true, textureSource: true });
  }
}
