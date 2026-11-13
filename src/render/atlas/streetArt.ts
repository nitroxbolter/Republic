import { HALF_W } from '../../shared/constants';
import { GROUND_FRAME_H, GROUND_FRAME_W, GROUND_PAD } from './geometry';
import { IsoFrame, shade, type Box } from './core';
import { paintRoundTree } from './nature/trees';
import { paintAvenueFurniture } from './roads/avenueFurniture';
import { paintPedestrianFurniture } from './roads/pedestrianFurniture';
import { paintBoulevardFurniture, paintExpresswayFurniture } from './roads/wideFurniture';

/**
 * Street furniture (docs/specs/city-art.md): one sprite per road tile, drawn in the objects
 * layer so it sorts with buildings and trees. All positions are in view tile space; a road
 * "along u" has mask 0b1010, "along v" has 0b0101. The near side of a road is its +lateral
 * side (larger u or v), the side facing the camera. Junction traffic lights are live
 * (AgentRenderer draws them from the traffic sim's phases), so they aren't furniture.
 */

export const FURNITURE_HEADROOM = 40;
export const FURNITURE_FRAME_W = GROUND_FRAME_W;
export const FURNITURE_FRAME_H = GROUND_FRAME_H + FURNITURE_HEADROOM;

export type RoadAxis = 'u' | 'v';
export const ROAD_AXES: readonly RoadAxis[] = ['u', 'v'];
/** Straight-street layouts: 0 tree + far lamp, 1 near lamp + tree, 2 a pair of trees. */
export const STREET_STYLES = 3;

export type FurniturePiece =
  | { kind: 'street'; axis: RoadAxis; style: number }
  | { kind: 'cornerLamp'; mask: number }
  | { kind: 'highwayLamp'; axis: RoadAxis }
  | { kind: 'gantry'; axis: RoadAxis }
  | { kind: 'overbridge'; axis: RoadAxis }
  | { kind: 'avenue'; axis: RoadAxis; style: number }
  | { kind: 'boulevard'; dir: number; style: number }
  | { kind: 'expressway'; dir: number; style: number }
  | { kind: 'pedestrian'; axis: RoadAxis; style: number };

export const POLE = '#545b64';
export const LAMP = '#fff1b8';

/** (along, lateral) on a road → view (u, v). Lateral is measured from the centre line. */
export function onRoad(axis: RoadAxis, s: number, o: number): [number, number] {
  return axis === 'u' ? [s, 0.5 + o] : [0.5 + o, s];
}

export function pole(iso: IsoFrame, u: number, v: number, z0: number, z1: number, w = 1) {
  const [x, y] = iso.p(u, v, z0);
  iso.ctx.fillStyle = POLE;
  iso.ctx.fillRect(x - w / 2, y - (z1 - z0), w, z1 - z0);
  iso.ctx.fillStyle = 'rgba(255,255,255,0.25)';
  iso.ctx.fillRect(x - w / 2, y - (z1 - z0), w / 2, z1 - z0);
}

/** Street lamp at lateral `o`, its arm reaching toward the road centre. */
function lamp(iso: IsoFrame, axis: RoadAxis, s: number, o: number, h = 15) {
  const [u, v] = onRoad(axis, s, o);
  const [hu, hv] = onRoad(axis, s, o - Math.sign(o) * 0.1);
  iso.disc(u, v, 0.025, 0, 'rgba(0,0,0,0.25)');
  pole(iso, u, v, 0, h, 1.2);
  const a = iso.p(u, v, h);
  const b = iso.p(hu, hv, h + 1);
  const c = iso.ctx;
  c.strokeStyle = POLE;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.stroke();
  c.fillStyle = 'rgba(255, 236, 160, 0.3)';
  c.beginPath();
  c.ellipse(b[0], b[1] + 1.5, 3, 1.6, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = LAMP;
  c.fillRect(b[0] - 1.4, b[1] - 0.2, 2.8, 1.4);
}

function streetTree(iso: IsoFrame, u: number, v: number, tone: number) {
  iso.floor(u - 0.04, u + 0.04, v - 0.04, v + 0.04, 0.2, '#6b6256');
  iso.floor(u - 0.03, u + 0.03, v - 0.03, v + 0.03, 0.3, '#5a4c3c');
  const [x, y] = iso.p(u, v, 0);
  paintRoundTree(iso.ctx, x, y, 0.58, tone);
}

const CORNER = 0.42;

/** Paint one piece into a FURNITURE frame (tile diamond's top vertex FURNITURE_HEADROOM below the top). */
export function paintFurniture(ctx: CanvasRenderingContext2D, piece: FurniturePiece) {
  const iso = new IsoFrame(ctx, GROUND_PAD + HALF_W, GROUND_PAD + FURNITURE_HEADROOM);
  switch (piece.kind) {
    case 'street': {
      const { axis, style } = piece;
      if (style === 0) {
        lamp(iso, axis, 0.5, -0.42);
        streetTree(iso, ...onRoad(axis, 0.5, 0.41), 0);
      } else if (style === 1) {
        streetTree(iso, ...onRoad(axis, 0.3, 0.41), 1);
        lamp(iso, axis, 0.75, 0.43);
      } else {
        streetTree(iso, ...onRoad(axis, 0.22, 0.41), 2);
        streetTree(iso, ...onRoad(axis, 0.74, 0.41), 3);
      }
      return;
    }
    case 'cornerLamp': {
      // The corner opposite the two arms is the outside of the bend.
      const m = piece.mask;
      const u = m & 0b0010 ? 0.5 - CORNER : 0.5 + CORNER;
      const v = m & 0b0100 ? 0.5 - CORNER : 0.5 + CORNER;
      if (u < 0.5 && v < 0.5) return;
      iso.disc(u, v, 0.025, 0, 'rgba(0,0,0,0.25)');
      pole(iso, u, v, 0, 15, 1.2);
      const [hx, hy] = iso.p(u + (0.5 - u) * 0.25, v + (0.5 - v) * 0.25, 16);
      const [px, py] = iso.p(u, v, 15);
      const c = iso.ctx;
      c.strokeStyle = POLE;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(hx, hy);
      c.stroke();
      c.fillStyle = LAMP;
      c.fillRect(hx - 1.4, hy - 0.2, 2.8, 1.4);
      return;
    }
    case 'highwayLamp': {
      lamp(iso, piece.axis, 0.5, 0.48, 19);
      return;
    }
    case 'gantry':
      paintGantry(iso, piece.axis);
      return;
    case 'overbridge':
      paintOverbridge(iso, piece.axis);
      return;
    case 'avenue':
      paintAvenueFurniture(iso, piece.axis, piece.style);
      return;
    case 'boulevard':
      paintBoulevardFurniture(iso, piece.dir, piece.style);
      return;
    case 'expressway':
      paintExpresswayFurniture(iso, piece.dir, piece.style);
      return;
    case 'pedestrian':
      paintPedestrianFurniture(iso, piece.axis, piece.style);
      return;
  }
}

/** Overhead sign gantry: two posts, a truss, and two green direction boards facing the traffic. */
function paintGantry(iso: IsoFrame, axis: RoadAxis) {
  const s = 0.5;
  const Z = 20;
  const far = onRoad(axis, s, -0.49);
  const near = onRoad(axis, s, 0.49);
  pole(iso, far[0], far[1], 0, Z + 2, 1.6);
  // Truss across the road.
  const a = iso.p(far[0], far[1], Z);
  const b = iso.p(near[0], near[1], Z);
  const c = iso.ctx;
  c.strokeStyle = '#7d848c';
  c.lineWidth = 1.3;
  for (const dz of [0, 3]) {
    c.beginPath();
    c.moveTo(a[0], a[1] - dz);
    c.lineTo(b[0], b[1] - dz);
    c.stroke();
  }
  // Boards: planes across the road (u = const for a u road, so they show on the SE face).
  const face = axis === 'u' ? 'se' : 'sw';
  for (const [o0, o1, label] of [
    [-0.44, -0.06, 'CITY'],
    [0.06, 0.44, 'EXIT'],
  ] as const) {
    const lo = 0.5 + o0;
    const hi = 0.5 + o1;
    iso.wall(face, s, lo, hi, Z - 6, Z + 4, '#ffffff');
    iso.wall(face, s, lo + 0.01, hi - 0.01, Z - 5.4, Z + 3.4, face === 'se' ? '#1f7a45' : '#2a9457');
    iso.text(face, s, (lo + hi) / 2, Z - 0.5, label, 3.6, '#ffffff');
  }
  pole(iso, near[0], near[1], 0, Z + 2, 1.6);
}

/**
 * Foot overbridge across a highway: a stair tower on each verge, a covered deck between them
 * and a slim pier on the median. Cars pass underneath (vehicle agents draw below the objects layer).
 */
function paintOverbridge(iso: IsoFrame, axis: RoadAxis) {
  const Z = 18;
  const T = 3;
  const deckHalf = 0.08;
  const box = (s0: number, s1: number, o0: number, o1: number): Box => {
    const [u0, v0] = onRoad(axis, s0, o0);
    const [u1, v1] = onRoad(axis, s1, o1);
    return { u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) };
  };
  const tower = (o0: number, o1: number) => {
    const t = box(0.5 - 0.13, 0.5 + 0.13, o0, o1);
    iso.solid(t, 0, Z + 7, '#dcd6c8');
    // Glazed stair windows on both visible faces.
    iso.wall('sw', t.v1, t.u0 + 0.03, t.u1 - 0.03, 4, Z + 4, 'rgba(70, 110, 140, 0.75)');
    iso.wall('se', t.u1, t.v0 + 0.03, t.v1 - 0.03, 4, Z + 4, 'rgba(50, 85, 110, 0.75)');
    for (let z = 6; z < Z + 4; z += 4) {
      iso.wall('sw', t.v1, t.u0 + 0.03, t.u1 - 0.03, z, z + 0.6, 'rgba(255,255,255,0.4)');
      iso.wall('se', t.u1, t.v0 + 0.03, t.v1 - 0.03, z, z + 0.6, 'rgba(255,255,255,0.25)');
    }
    iso.box(t.u0 - 0.02, t.u1 + 0.02, t.v0 - 0.02, t.v1 + 0.02, Z + 7, Z + 9, '#2f7fd6', '#24609f', '#4a95e4');
  };
  // Far tower, median pier, deck, near tower.
  tower(-0.5, -0.36);
  const pier = box(0.5 - 0.03, 0.5 + 0.03, -0.03, 0.03);
  iso.solid(pier, 0, Z - T, '#b9b6ad');
  const deck = box(0.5 - deckHalf, 0.5 + deckHalf, -0.38, 0.38);
  iso.solid(deck, Z - T, Z, '#c9c4b8');
  iso.floor(deck.u0, deck.u1, deck.v0, deck.v1, Z, '#9a9488');
  // Railings / glazed sides and a light canopy.
  const lit = axis === 'u' ? 'se' : 'sw';
  const at = lit === 'se' ? deck.u1 : deck.v1;
  const [a0, a1] = lit === 'se' ? [deck.v0, deck.v1] : [deck.u0, deck.u1];
  iso.wall(lit, at, a0, a1, Z, Z + 5, 'rgba(150, 200, 230, 0.55)');
  for (let a = a0; a <= a1 + 1e-6; a += (a1 - a0) / 6) iso.wall(lit, at, a - 0.006, a + 0.006, Z, Z + 5, '#e8e4da');
  iso.box(deck.u0 - 0.01, deck.u1 + 0.01, deck.v0, deck.v1, Z + 5, Z + 6, '#f2efe8', shade('#f2efe8', -0.2), '#f7f5f0');
  tower(0.36, 0.5);
}
