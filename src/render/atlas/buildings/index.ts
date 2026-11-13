import { HALF_H, HALF_W } from '../../../shared/constants';
import { mulberry32 } from '../../../shared/rng';
import { ART_VARIANTS, BUILDINGS, type BuildingId } from '../../../sim/buildings/catalog';
import { castShadow, inFront, IsoFrame, Orient, type Box, type BuildingRotation, type FrameMark } from '../core';
import { CIVIC_ART } from '../civic';
import { paintRotorStill, type RotorSource } from '../energy/rotor';
import type { SmokeSource } from '../civic/lot';
import { GROUND_PAD } from '../geometry';
import { paintAttachments, paintSigns } from './attachments';
import { resolveMasses, totalHeight, type Painting } from './context';
import { paintLot } from './lot/ground';
import { groundProps } from './lot/props';
import { garageAnnex, paintFence, paintSmokestack, stackHeight, stackPositions } from './lot/structures';
import { paintMass } from './massing';
import { ART, type BuildingArt, type CustomArtId, type RecipeId } from './recipes';
import { paintRooftop } from './rooftop';
import { paintMilitaryAsset } from './militaryAssets';

export { BUILDING_ROTATIONS, type BuildingRotation } from '../core';
export type { SmokeSource } from '../civic/lot';

/**
 * Procedural building art (docs/specs/buildings.md, docs/specs/city-art.md, D-066).
 *
 * Every recipe building is a stack of lit iso boxes ("masses") in its own frame, assembled from
 * single-purpose parts: lot/ (ground, props, garage, fence, stacks), massing (walls and light),
 * facades/, roofs/, attachments/ (porches, doors, signs, balconies) and rooftop/. Recipes
 * (recipes/) are written in *local* space with the front at +v; the painter rotates them for
 * each of the 4 view rotations, so front details appear only when the front faces the camera.
 * Parks, the town hall and the utilities have their own painters (civic/).
 */

/** Most variants any building has; the sim picks a variant below this (catalog ART_VARIANTS). */
export const BUILDING_VARIANTS = ART_VARIANTS;

function isCustom(id: BuildingId): id is CustomArtId {
  return id in CIVIC_ART;
}

/** How many distinct variants a building has; instance variants wrap round with `%`. */
export function buildingVariantCount(id: BuildingId): number {
  return isCustom(id) ? CIVIC_ART[id].variants : ART[id].length;
}

function recipe(id: RecipeId, variant: number): BuildingArt {
  const list = ART[id];
  return list[variant % list.length];
}

/** Height above the top of the walls taken by rooftop and tall ground extras (px). */
function extrasAbove(art: BuildingArt, H: number): number {
  const ex = new Set(art.extras);
  let up = art.roofH ?? 0;
  if (ex.has('spire')) up = Math.max(up, 37);
  if (ex.has('antenna')) up = Math.max(up, 23);
  if (ex.has('crown') || ex.has('watertank') || ex.has('hosetower')) up = Math.max(up, 22);
  if (ex.has('smokestack') || ex.has('smokestacks')) up = Math.max(up, 34);
  // Silos stand on the ground, so only the part above the walls needs room.
  if (ex.has('silo')) up = Math.max(up, 46 - H);
  return up;
}

/** Extra space above the footprint for walls, roof and rooftop extras. */
export function buildingHeadroom(id: BuildingId, variant = 0): number {
  if (isCustom(id)) return CIVIC_ART[id].headroom(variant % CIVIC_ART[id].variants);
  const art = recipe(id, variant);
  const H = totalHeight(art);
  return H + extrasAbove(art, H) + 26;
}

export function buildingFrameSize(id: BuildingId, variant = 0): { w: number; h: number } {
  const { w, h } = BUILDINGS[id].size;
  return { w: (w + h) * HALF_W + GROUND_PAD * 2, h: (w + h) * HALF_H + GROUND_PAD * 2 + buildingHeadroom(id, variant) };
}

const smokeCache = new Map<string, readonly SmokeSource[]>();
const rotorCache = new Map<string, readonly RotorSource[]>();
/** Animated marks (lit windows, beacons, fountains) recorded while the atlas paints each frame. */
const markRegistry = new Map<string, readonly FrameMark[]>();
const NO_MARKS: readonly FrameMark[] = [];

const frameKey = (id: BuildingId, variant: number, rot: BuildingRotation) => `${id}:${variant}:${rot}`;

/**
 * Marks of a building frame in frame pixels (render/ambient animates them). Empty until the
 * atlas has painted that frame with `record: true`.
 */
export function buildingMarks(id: BuildingId, variant: number, rot: BuildingRotation): readonly FrameMark[] {
  return markRegistry.get(frameKey(id, variant % buildingVariantCount(id), rot)) ?? NO_MARKS;
}

/** Wind-turbine hubs of a building in view space (render/fx/Rotors.ts spins blades there). */
export function rotorSources(id: BuildingId, variant: number, rot: BuildingRotation): readonly RotorSource[] {
  const key = frameKey(id, variant, rot);
  const hit = rotorCache.get(key);
  if (hit) return hit;
  let out: readonly RotorSource[] = [];
  if (isCustom(id)) {
    const c = CIVIC_ART[id];
    const { w, h } = BUILDINGS[id].size;
    out = c.rotors?.(new Orient(rot, w, h), variant % c.variants) ?? [];
  }
  rotorCache.set(key, out);
  return out;
}

/**
 * Smokestack and cooling-tower tops of a building in view space (tile units from the
 * footprint's view origin, z in px), so render/fx/Smoke.ts can emit plumes from the art.
 */
export function smokeSources(id: BuildingId, variant: number, rot: BuildingRotation): readonly SmokeSource[] {
  const key = frameKey(id, variant, rot);
  const hit = smokeCache.get(key);
  if (hit) return hit;
  const { w, h } = BUILDINGS[id].size;
  const o = new Orient(rot, w, h);
  let out: SmokeSource[];
  if (isCustom(id)) {
    const c = CIVIC_ART[id];
    out = c.smoke?.(o, variant % c.variants) ?? [];
  } else {
    const art = recipe(id, variant);
    const ms = resolveMasses(art, o);
    const slim = art.extras.includes('smokestacks');
    out = stackPositions(art, ms[0].local).map(([lu, lv]) => {
      const [u, v] = o.point(lu, lv);
      return { u, v, z: ms[ms.length - 1].z1 + stackHeight(slim), kind: 'smoke' };
    });
  }
  smokeCache.set(key, out);
  return out;
}

export interface PaintOptions {
  /** Also paint parts that move in the game (turbine blades) as a still frame: thumbnails. */
  stillParts?: boolean;
  /** Record the frame's animated marks (atlas frames only). */
  record?: boolean;
}

export function paintBuilding(ctx: CanvasRenderingContext2D, id: BuildingId, variant: number, rot: BuildingRotation = 0, opts: PaintOptions = {}) {
  const { w, h } = BUILDINGS[id].size;
  const o = new Orient(rot, w, h);
  const marks: FrameMark[] | null = opts.record ? [] : null;
  const frame = buildingFrameSize(id, variant);
  if (paintMilitaryAsset(ctx, id, frame.w, frame.h)) {
    if (marks) markRegistry.set(frameKey(id, variant % buildingVariantCount(id), rot), marks);
    return;
  }
  const iso = new IsoFrame(ctx, GROUND_PAD + o.vh * HALF_W, GROUND_PAD + buildingHeadroom(id, variant), marks);
  const rng = mulberry32(8000 + variant * 101 + id.length * 7 + id.charCodeAt(0));
  if (isCustom(id)) {
    const c = CIVIC_ART[id];
    c.paint(iso, o, rng, variant % c.variants);
    if (opts.stillParts) {
      for (const r of c.rotors?.(o, variant % c.variants) ?? []) {
        const [x, y] = iso.p(r.u, r.v, r.z);
        paintRotorStill(ctx, x + r.dx, y, 0.35 + variant);
      }
    }
  } else {
    paintRecipe(iso, o, recipe(id, variant), rng);
  }
  if (marks) markRegistry.set(frameKey(id, variant % buildingVariantCount(id), rot), marks);
}

function paintRecipe(iso: IsoFrame, o: Orient, art: BuildingArt, rng: () => number) {
  const ms = resolveMasses(art, o);
  const lot: Box = { u0: 0, u1: o.vw, v0: 0, v1: o.vh };
  const p: Painting = { iso, o, art, ms, rng, lot };
  const base = ms[0];
  const top = ms[ms.length - 1];
  const b = base.view;
  const ex = new Set(art.extras);

  paintLot(p);
  castShadow(iso, b, top.z1, lot);

  const props = groundProps(p).sort((a, c) => a.u + a.v - (c.u + c.v));
  for (const pr of props) if (!inFront(pr, b)) pr.draw();

  // Annex (garage) beside the body: drawn before or after it depending on which is nearer.
  const annex = ex.has('garage') ? garageAnnex(p) : null;
  if (annex && !inFront(annex, b)) annex.draw();

  // Smokestacks behind the body are drawn first so the walls cover their base.
  const stacks = stackPositions(art, base.local).map((s) => o.point(s[0], s[1]));
  const stackFront = (s: readonly [number, number]) => s[0] + s[1] > (b.u0 + b.u1 + b.v0 + b.v1) / 2;
  for (const s of stacks) if (!stackFront(s)) paintSmokestack(iso, s, top.z1, ex.has('smokestacks'));

  for (const m of ms) paintMass(p, m);
  paintAttachments(p);
  paintRooftop(p);
  paintSigns(p);

  for (const s of stacks) if (stackFront(s)) paintSmokestack(iso, s, top.z1, ex.has('smokestacks'));
  if (annex && inFront(annex, b)) annex.draw();
  for (const pr of props) if (inFront(pr, b)) pr.draw();
  if (ex.has('fence')) paintFence(iso, lot);
}
