import type { IsoFrame, Orient, Rng } from '../../core';
import { at, drawItems, pole, type Item } from '../lot';

/** Bright litter on the mound. */
const LITTER = ['#e2574c', '#3b6fd8', '#f2c94c', '#f4f1ea', '#5fbf6a', '#c58ae0'] as const;

/**
 * 3×3 landfill (docs/specs/evolution.md, E2): a fenced, dusty lot with a terraced garbage
 * mound (its older side capped with grass), a site office and a yellow bulldozer on the tip.
 * Variants move the mound and change how much of it is capped.
 */
export function paintLandfill(iso: IsoFrame, o: Orient, rng: Rng, variant: number) {
  const ctx = iso.ctx;
  const lot = o.rect({ u0: 0.04, u1: 2.96, v0: 0.04, v1: 2.96 });
  iso.floor(lot.u0, lot.u1, lot.v0, lot.v1, 0, '#a99a7c');
  const inner = o.rect({ u0: 0.14, u1: 2.86, v0: 0.14, v1: 2.86 });
  iso.floor(inner.u0, inner.u1, inner.v0, inner.v1, 0.05, '#9c8b69');
  // Haul road from the front gate to the tip.
  const haul = o.rect({ u0: 2.2, u1: 2.5, v0: 1.6, v1: 2.96 });
  iso.floor(haul.u0, haul.u1, haul.v0, haul.v1, 0.08, '#857a66');

  const mu = variant === 1 ? 1.35 : 1.45;
  const mv = variant === 2 ? 1.35 : 1.4;
  const mound = at(o, mu, mv);
  const capped = variant === 2 ? 0.75 : variant === 1 ? 0.25 : 0.5;

  const items: Item[] = [];
  items.push({
    depth: mound.depth,
    draw: () => {
      // Terraces: each a little smaller and higher, darker garbage below the grass cap.
      const tiers = [
        { z0: 0, z1: 5, r: 0.98, side: '#7d7262', top: '#8f8370' },
        { z0: 5, z1: 9, r: 0.73, side: '#6f6a5e', top: '#857d6c' },
        { z0: 9, z1: 12, r: 0.48, side: '#676357', top: '#7b7465' },
      ];
      tiers.forEach((t, k) => {
        const grassy = k / tiers.length < capped;
        iso.round(mound.u, mound.v, t.z0, t.z1, () => t.r, grassy ? '#6f9a4e' : t.side, grassy ? '#86b35c' : t.top);
      });
      // Litter specks on the uncapped tiers.
      for (let n = 0; n < 46; n++) {
        const a = rng() * Math.PI * 2;
        const k = Math.floor(rng() * 3);
        const r = [0.91, 0.68, 0.44][k] * Math.sqrt(rng());
        if (k / 3 < capped) continue;
        const [x, y] = iso.p(mound.u + Math.cos(a) * r, mound.v + Math.sin(a) * r * 0.9, [5, 9, 12][k]);
        ctx.fillStyle = LITTER[n % LITTER.length];
        ctx.fillRect(x, y, 1.6, 1.1);
      }
      // Gas vent pipes in the capped part.
      if (capped >= 0.5) pole(iso, mound.u - 0.3, mound.v - 0.2, 8, 14, 1.2, '#c9c5bb');
    },
  });

  // Bulldozer on the working face.
  const dozer = at(o, mu + 0.55, mv + 0.45);
  items.push({
    depth: dozer.depth + 0.5,
    draw: () => {
      const z = 4;
      iso.box(dozer.u - 0.12, dozer.u + 0.12, dozer.v - 0.09, dozer.v + 0.09, z, z + 3, '#f2b632', '#c98f1d', '#ffd25e');
      iso.box(dozer.u - 0.05, dozer.u + 0.06, dozer.v - 0.06, dozer.v + 0.05, z + 3, z + 6, '#f2b632', '#c98f1d', '#3a3f45');
      iso.box(dozer.u - 0.14, dozer.u + 0.14, dozer.v + 0.1, dozer.v + 0.13, z, z + 2.5, '#5b6066', '#43474c', '#6f747a');
    },
  });

  // Site office by the gate, and a weighbridge.
  const office = o.rect({ u0: 2.55, u1: 2.85, v0: 2.3, v1: 2.75 });
  items.push({ depth: office.u0 + office.v0, draw: () => iso.solid(office, 0, 8, '#e3ddcf', '#4f6a7c') });
  const scale = o.rect({ u0: 2.22, u1: 2.48, v0: 2.35, v1: 2.75 });
  iso.floor(scale.u0, scale.u1, scale.v0, scale.v1, 0.4, '#5d6168');

  // Chain-link fence posts round the lot.
  for (let t = 0.1; t <= 2.9; t += 0.4) {
    for (const [u, v] of [
      [t, 0.08],
      [0.08, t],
      [2.92, t],
    ] as const) {
      const p = at(o, u, v);
      items.push({ depth: p.depth, draw: () => pole(iso, p.u, p.v, 0, 5, 0.8, '#8b9097') });
    }
  }
  drawItems(items);
}
