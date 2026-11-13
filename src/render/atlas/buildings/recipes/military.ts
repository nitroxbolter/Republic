import { one, variants, type BuildingArt } from './types';

/** Military civic structures use the existing fence, garage, loading bay and rooftop kits. */
export const barracks: readonly BuildingArt[] = variants(
  {
    floorH: 10,
    masses: [one(2, 0.12, 'siding')],
    wall: '#b9b39a', trim: '#77775f',
    roof: 'gable', roofH: 9, roofColor: '#53614a', facade: 'siding',
    ground: 'paved', extras: ['canopy', 'fence'], sign: 'QUARTEL', signColor: '#42533f',
  },
  { wall: '#c3bda5', roofColor: '#687354' },
  { wall: '#aaa88e', roof: 'hip', roofH: 7, roofColor: '#555c4b', extras: ['canopy', 'fence', 'antenna'] },
  { wall: '#c2b9a3', facade: 'brick', roof: 'gable', roofH: 10, roofColor: '#706451' },
);

export const military_garage: readonly BuildingArt[] = variants(
  {
    floorH: 10,
    masses: [one(2, 0.1, 'industrial')],
    wall: '#9ca38d', trim: '#737b68',
    roof: 'flat', roofColor: '#626b5c', facade: 'industrial',
    ground: 'paved', extras: ['garagedoor', 'garage', 'fence'], sign: 'GARAGEM', signColor: '#465642',
  },
  { wall: '#b6ad92', roof: 'gable', roofH: 8, roofColor: '#5a654e', extras: ['garagedoor', 'patrolcars'] },
  { wall: '#929c91', masses: [one(2, 0.06, 'industrial')], extras: ['garagedoor', 'garage', 'loadingdock'] },
  { wall: '#b6b99f', facade: 'bands', extras: ['garagedoor', 'garage', 'fence', 'antenna'] },
);

export const military_depot: readonly BuildingArt[] = variants(
  {
    floorH: 10,
    masses: [one(1, 0.1, 'industrial')],
    wall: '#aaa58f', trim: '#69745f',
    roof: 'flat', roofColor: '#52614c', facade: 'industrial',
    ground: 'paved', extras: ['loadingdock', 'crates', 'fence'], sign: 'SUPRIMENTOS', signColor: '#455640',
  },
  { wall: '#b9b49b', roof: 'gable', roofH: 8, roofColor: '#59654e', extras: ['loadingdock', 'crates'] },
);

export const armory: readonly BuildingArt[] = variants(
  {
    floorH: 10,
    masses: [one(1, 0.16, 'industrial')],
    wall: '#a8a68c', trim: '#6c735f',
    roof: 'hip', roofH: 6, roofColor: '#4e5e48', facade: 'industrial',
    ground: 'paved', extras: ['fence', 'loadingdock', 'crates'], sign: 'PAIOL', signColor: '#41513f',
  },
  { wall: '#b7b098', roof: 'gable', roofH: 9, roofColor: '#625b49' },
  { wall: '#8d9988', extras: ['fence', 'loadingdock', 'crates', 'antenna'] },
  { wall: '#b9ad91', facade: 'brick', roof: 'flat', roofColor: '#69705f', extras: ['fence', 'loadingdock'] },
);

export const military_base: readonly BuildingArt[] = variants(
  {
    floorH: 11,
    masses: [
      { floors: 2, box: { u0: 0.18, u1: 2.82, v0: 0.16, v1: 1.35 }, facade: 'bands' },
      { floors: 3, box: { u0: 0.72, u1: 2.28, v0: 1.28, v1: 2.42 }, facade: 'grid', wall: '#aeb39f' },
    ],
    wall: '#b6b39b', trim: '#69735f',
    roof: 'flat', roofColor: '#59634f', facade: 'bands',
    ground: 'paved', extras: ['fence', 'garage', 'antenna'], sign: 'BASE', signColor: '#40503d',
  },
  { wall: '#c0b79b', masses: [{ floors: 2, box: { u0: 0.14, u1: 2.86, v0: 0.18, v1: 1.4 }, facade: 'siding' }, { floors: 3, box: { u0: 0.72, u1: 2.28, v0: 1.3, v1: 2.48 }, facade: 'grid', wall: '#c1c2ad' }] },
  { wall: '#9fa995', roofColor: '#66715d', extras: ['fence', 'garage', 'antenna', 'helipad'] },
  { wall: '#c1b59b', facade: 'brick', roof: 'hip', roofH: 8, roofColor: '#645b49', extras: ['fence', 'garage'] },
);

export const training_ground: readonly BuildingArt[] = variants(
  {
    floorH: 10,
    masses: [
      { floors: 2, box: { u0: 0.14, u1: 1.48, v0: 0.16, v1: 1.12 }, facade: 'siding' },
      { floors: 1, box: { u0: 1.56, u1: 2.82, v0: 0.18, v1: 2.18 }, facade: 'industrial', wall: '#b1ad91' },
    ],
    wall: '#aeb39c', trim: '#6e7862',
    roof: 'gable', roofH: 8, roofColor: '#57654e', facade: 'siding',
    ground: 'field', extras: ['fence', 'antenna'], sign: 'TREINO', signColor: '#42543e',
  },
  { wall: '#bfb69a', roof: 'hip', roofH: 7, roofColor: '#68634f', extras: ['fence', 'helipad'] },
  { wall: '#9ea994', masses: [{ floors: 2, box: { u0: 0.12, u1: 1.42, v0: 0.18, v1: 1.08 }, facade: 'siding' }, { floors: 1, box: { u0: 1.54, u1: 2.86, v0: 0.14, v1: 2.22 }, facade: 'industrial' }], extras: ['fence', 'antenna', 'patrolcars'] },
  { wall: '#c2bcaa', facade: 'bands', roof: 'flat', roofColor: '#596650', extras: ['fence', 'antenna'] },
);
