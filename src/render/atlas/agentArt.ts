import type { AgentKind } from '../../sim/systems/traffic';
import { IsoFrame, shade } from './core';
import { GROUND_PAD, GROUND_FRAME_H } from './geometry';
import { HALF_H, HALF_W } from '../../shared/constants';

/** Room above the tile diamond for tall vehicles (buses, trucks). */
export const VEHICLE_HEADROOM = 14;
export const VEHICLE_FRAME_H = GROUND_FRAME_H + VEHICLE_HEADROOM;
/** Anchor that puts the tile centre of a vehicle frame on the sprite position. */
export const VEHICLE_ANCHOR_Y = (VEHICLE_HEADROOM + GROUND_PAD + HALF_H) / VEHICLE_FRAME_H;

export const PERSON_W = 8;
export const PERSON_H = 14;

export const VEHICLE_KINDS: readonly Exclude<AgentKind, 'person'>[] = ['car', 'taxi', 'bus', 'truck'];
export const VEHICLE_VARIANTS = 6;
export const PERSON_VARIANTS = 8;

const CAR_COLORS = ['#d93b3b', '#2f6fd6', '#f2f2ee', '#3a3f48', '#2f9e5a', '#f08c2e'] as const;
const BUS_COLORS = ['#f2a922', '#2f7fd6', '#d93b3b', '#2f9e5a', '#f2a922', '#7a4fc9'] as const;
const TRUCK_COLORS = ['#d93b3b', '#2f6fd6', '#f2f2ee', '#3a3f48', '#2f9e5a', '#f08c2e'] as const;

const GLASS = '#253a4f';
const HEADLIGHT = '#fff3b0';
const TAILLIGHT = '#ff4a3d';

interface Dims {
  /** Length and width in tile units. */
  len: number;
  wid: number;
}

const DIMS: Readonly<Record<Exclude<AgentKind, 'person'>, Dims>> = {
  car: { len: 0.32, wid: 0.16 },
  taxi: { len: 0.32, wid: 0.16 },
  bus: { len: 0.56, wid: 0.19 },
  truck: { len: 0.48, wid: 0.18 },
  fire_truck: { len: 0.52, wid: 0.19 },
  ambulance: { len: 0.4, wid: 0.18 },
  police_car: { len: 0.34, wid: 0.16 },
};

/** Emergency vehicles wear one livery each (body, cargo box); cars and trucks pick by variant. */
const LIVERY = {
  fire_truck: { cab: '#d42f2f', body: '#e03b3b' },
  ambulance: { cab: '#f4f4f0', body: '#f7f7f3' },
} as const;

/**
 * A vehicle centred on the tile, facing `dir` (0 NE, 1 SE, 2 SW, 3 NW).
 * Only the SE and SW faces are visible, so for NE/NW we see the back (taillights).
 */
export function paintVehicle(ctx: CanvasRenderingContext2D, kind: Exclude<AgentKind, 'person'>, variant: number, dir: number) {
  const iso = new IsoFrame(ctx, GROUND_PAD + HALF_W, GROUND_PAD + VEHICLE_HEADROOM);
  const { len, wid } = DIMS[kind];
  const alongU = dir === 1 || dir === 3;
  // Box extents: `a` along the direction of travel, `b` across it.
  const a0 = 0.5 - len / 2;
  const a1 = 0.5 + len / 2;
  const b0 = 0.5 - wid / 2;
  const b1 = 0.5 + wid / 2;
  // Light always comes from the left, so the SW face is lit whichever way the vehicle points.
  const box = (s0: number, s1: number, z0: number, z1: number, lit: string, dark: string, top: string) =>
    alongU ? iso.box(s0, s1, b0, b1, z0, z1, lit, dark, top) : iso.box(b0, b1, s0, s1, z0, z1, lit, dark, top);
  /** Visible face across the vehicle's front or back (whichever the camera sees). */
  const endFace = alongU ? 'se' : 'sw';
  const endAt = a1;
  /** Visible long side. */
  const sideFace = alongU ? 'sw' : 'se';
  const sideAt = b1;
  const forward = dir === 1 || dir === 2; // front faces the camera
  // Map an interval along the travel axis to the visible side's coordinates.
  const side = (s0: number, s1: number, z0: number, z1: number, fill: string) => iso.wall(sideFace, sideAt, s0, s1, z0, z1, fill);
  const end = (c0: number, c1: number, z0: number, z1: number, fill: string) => iso.wall(endFace, endAt, c0, c1, z0, z1, fill);

  // Shadow.
  iso.floor(alongU ? a0 + 0.03 : b0 + 0.03, alongU ? a1 + 0.05 : b1 + 0.05, alongU ? b0 + 0.03 : a0 + 0.03, alongU ? b1 + 0.05 : a1 + 0.05, 0, 'rgba(0,0,0,0.28)');

  if (kind === 'bus') {
    const c = BUS_COLORS[variant % BUS_COLORS.length];
    box(a0, a1, 1, 10, c, shade(c, -0.25), shade(c, 0.2));
    side(a0 + 0.03, a1 - 0.03, 5, 8.5, GLASS);
    for (let s = a0 + 0.1; s < a1 - 0.05; s += 0.09) side(s, s + 0.01, 5, 8.5, c);
    side(a0, a1, 2.5, 3.3, '#f4f4f0');
    end(b0 + 0.02, b1 - 0.02, 5, 8.5, GLASS);
    end(b0 + 0.02, b0 + 0.05, 2, 3.5, forward ? HEADLIGHT : TAILLIGHT);
    end(b1 - 0.05, b1 - 0.02, 2, 3.5, forward ? HEADLIGHT : TAILLIGHT);
  } else if (kind === 'truck' || kind === 'fire_truck' || kind === 'ambulance') {
    const livery = kind === 'truck' ? null : LIVERY[kind];
    const c = livery ? livery.cab : TRUCK_COLORS[variant % TRUCK_COLORS.length];
    const cargo = livery ? livery.body : '#eceae4';
    // Cargo box at the back, cab at the front.
    const cabFront = forward;
    const split = cabFront ? a1 - 0.14 : a0 + 0.14;
    const [boxS0, boxS1] = cabFront ? [a0, split] : [split, a1];
    const [cabS0, cabS1] = cabFront ? [split + 0.01, a1] : [a0, split - 0.01];
    box(cabS0, cabS1, 1, 6.5, c, shade(c, -0.25), shade(c, 0.2));
    box(boxS0, boxS1, 1, 10, cargo, shade(cargo, -0.18), shade(cargo, 0.1));
    side(cabS0 + 0.02, cabS1 - 0.02, 3.8, 6, GLASS);
    // A stripe along the side, and a light bar on the cab roof.
    if (livery) {
      side(boxS0 + 0.02, boxS1 - 0.02, 4, 5, kind === 'ambulance' ? '#d23b3b' : '#f4f4f0');
      const mid = (cabS0 + cabS1) / 2;
      box(mid - 0.03, mid + 0.03, 6.5, 7.6, '#3b82f6', '#2a5fb8', '#ff4a3d');
    }
    if (cabFront) end(b0 + 0.02, b1 - 0.02, 3.8, 6, GLASS);
    end(b0 + 0.02, b0 + 0.05, 1.8, 3, forward ? HEADLIGHT : TAILLIGHT);
    end(b1 - 0.05, b1 - 0.02, 1.8, 3, forward ? HEADLIGHT : TAILLIGHT);
  } else {
    const c = kind === 'taxi' ? '#f5c518' : kind === 'police_car' ? '#1f3a68' : CAR_COLORS[variant % CAR_COLORS.length];
    box(a0, a1, 1, 4.5, c, shade(c, -0.25), shade(c, 0.15));
    // Cabin sits slightly behind centre.
    const back = forward ? a0 : a1;
    const front = forward ? a1 : a0;
    const cab0 = Math.min(back + (front - back) * 0.18, back + (front - back) * 0.68);
    const cab1 = Math.max(back + (front - back) * 0.18, back + (front - back) * 0.68);
    box(cab0, cab1, 4.5, 7.5, shade(c, 0.05), shade(c, -0.2), shade(c, 0.25));
    side(cab0 + 0.015, cab1 - 0.015, 4.9, 7, GLASS);
    end(b0 + 0.02, b1 - 0.02, 4.9, 7, GLASS);
    end(b0 + 0.015, b0 + 0.045, 2.2, 3.4, forward ? HEADLIGHT : TAILLIGHT);
    end(b1 - 0.045, b1 - 0.015, 2.2, 3.4, forward ? HEADLIGHT : TAILLIGHT);
    if (kind === 'taxi') {
      const mid = (cab0 + cab1) / 2;
      box(mid - 0.03, mid + 0.03, 7.5, 9, '#ffffff', '#d8d8d8', '#ffffff');
    } else if (kind === 'police_car') {
      side(a0 + 0.02, a1 - 0.02, 2.2, 3.4, '#f4f4f0');
      const mid = (cab0 + cab1) / 2;
      box(mid - 0.04, mid + 0.04, 7.5, 8.6, '#3b82f6', '#2a5fb8', '#ff4a3d');
    }
  }
  // Wheels on the visible side.
  const wheelAt = [a0 + len * 0.18, a1 - len * 0.18];
  for (const s of wheelAt) side(s - 0.03, s + 0.03, 0, 1.8, '#1d1f23');
}

const SKIN = ['#f1c9a5', '#d9a47a', '#a8714a', '#7a4a2e'] as const;
const SHIRTS = ['#e04848', '#3d7dd8', '#f2c43a', '#4bb36b', '#f3f1ea', '#9b59b6', '#ef8a3a', '#2a2f3a'] as const;

/** A tiny pedestrian, 8×14 px, standing on the frame's bottom edge. `frame` 0/1 = walk cycle. */
export function paintPerson(ctx: CanvasRenderingContext2D, variant: number, frame: number) {
  const cx = PERSON_W / 2;
  const base = PERSON_H - 1;
  const skin = SKIN[variant % SKIN.length];
  const shirt = SHIRTS[variant % SHIRTS.length];
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, base, 2.6, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs.
  ctx.fillStyle = '#2b3140';
  if (frame === 0) {
    ctx.fillRect(cx - 1.5, base - 4, 1.2, 4);
    ctx.fillRect(cx + 0.3, base - 4, 1.2, 4);
  } else {
    ctx.fillRect(cx - 2, base - 4, 1.2, 3.6);
    ctx.fillRect(cx + 0.8, base - 3.6, 1.2, 3.6);
  }
  // Body and arms.
  ctx.fillStyle = shirt;
  ctx.fillRect(cx - 1.8, base - 8.5, 3.6, 4.8);
  ctx.fillStyle = shade(shirt.startsWith('#') ? shirt : '#888888', -0.2);
  ctx.fillRect(cx + 0.2, base - 8.5, 1.6, 4.8);
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, base - 10.2, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2a1e';
  ctx.fillRect(cx - 1.7, base - 12, 3.4, 1.1);
}

/** Parts of a train (docs/specs/evolution.md, E7b): one per tile along the track. */
export const RAIL_CAR_PARTS = ['engine', 'carriage'] as const;
export type RailCarPart = (typeof RAIL_CAR_PARTS)[number];

/**
 * One rail vehicle centred on the tile, facing `dir` (0 NE, 1 SE, 2 SW, 3 NW), nearly a tile
 * long: a red-nosed locomotive or a silver carriage with a band of windows.
 */
export function paintRailCar(ctx: CanvasRenderingContext2D, part: RailCarPart, dir: number) {
  const iso = new IsoFrame(ctx, GROUND_PAD + HALF_W, GROUND_PAD + VEHICLE_HEADROOM);
  const len = 0.86;
  // Narrow enough that two trains pass side by side on the double track (lanes 0.22 apart).
  const wid = 0.17;
  const alongU = dir === 1 || dir === 3;
  const a0 = 0.5 - len / 2;
  const a1 = 0.5 + len / 2;
  const b0 = 0.5 - wid / 2;
  const b1 = 0.5 + wid / 2;
  const box = (s0: number, s1: number, z0: number, z1: number, lit: string, dark: string, top: string) =>
    alongU ? iso.box(s0, s1, b0, b1, z0, z1, lit, dark, top) : iso.box(b0, b1, s0, s1, z0, z1, lit, dark, top);
  const sideFace = alongU ? 'sw' : 'se';
  const endFace = alongU ? 'se' : 'sw';
  const side = (s0: number, s1: number, z0: number, z1: number, fill: string) => iso.wall(sideFace, b1, s0, s1, z0, z1, fill);
  const end = (c0: number, c1: number, z0: number, z1: number, fill: string) => iso.wall(endFace, a1, c0, c1, z0, z1, fill);
  const forward = dir === 1 || dir === 2;

  iso.floor(alongU ? a0 + 0.03 : b0 + 0.03, alongU ? a1 + 0.05 : b1 + 0.05, alongU ? b0 + 0.03 : a0 + 0.03, alongU ? b1 + 0.05 : a1 + 0.05, 0, 'rgba(0,0,0,0.3)');
  if (part === 'engine') {
    const body = '#c8382f';
    box(a0, a1, 1.5, 10, body, shade(body, -0.28), shade(body, 0.18));
    box(a0 + 0.1, a1 - 0.1, 10, 11.5, '#3a3f46', '#2a2e33', '#4b5158'); // roof gear
    side(a0 + 0.05, a1 - 0.05, 3, 4, '#f2d24a'); // yellow stripe
    side(forward ? a1 - 0.2 : a0 + 0.04, forward ? a1 - 0.04 : a0 + 0.2, 6, 8.5, GLASS);
    end(b0 + 0.03, b1 - 0.03, 6, 8.5, GLASS);
    end(b0 + 0.03, b0 + 0.07, 2.5, 4, forward ? HEADLIGHT : TAILLIGHT);
    end(b1 - 0.07, b1 - 0.03, 2.5, 4, forward ? HEADLIGHT : TAILLIGHT);
  } else {
    const body = '#d9dee4';
    box(a0, a1, 1.5, 10, body, shade(body, -0.2), shade(body, 0.08));
    side(a0 + 0.04, a1 - 0.04, 5.5, 8.5, GLASS);
    for (let s = a0 + 0.14; s < a1 - 0.06; s += 0.14) side(s, s + 0.015, 5.5, 8.5, body);
    side(a0 + 0.04, a1 - 0.04, 3, 3.8, '#1f6fb2'); // blue band
    end(b0 + 0.04, b1 - 0.04, 2, 9.5, shade(body, -0.12)); // gangway end
  }
}
