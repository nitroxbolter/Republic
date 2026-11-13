import militaryBaseUrl from './military-assets/military_base.png';
import militaryGarageUrl from './military-assets/military_garage.png';
import militaryDepotUrl from './military-assets/military_depot.png';
import armoryUrl from './military-assets/armory.png';
import barracksUrl from './military-assets/barracks.png';
import trainingGroundUrl from './military-assets/training_ground.png';
import soldierUrl from './military-assets/unit_soldier.png';
import patrolUrl from './military-assets/unit_patrol.png';
import transportUrl from './military-assets/unit_transport.png';
import armoredUrl from './military-assets/unit_armored.png';
import helicopterUrl from './military-assets/unit_helicopter.png';
import { Texture } from 'pixi.js';
import type { MilitaryUnitKind } from '../../../sim/systems/military';
import { HALF_W } from '../../../shared/constants';
import { BUILDINGS, type BuildingId } from '../../../sim/buildings/catalog';
import { GROUND_PAD } from '../geometry';

const SOURCES = {
  military_base: militaryBaseUrl,
  military_garage: militaryGarageUrl,
  military_depot: militaryDepotUrl,
  armory: armoryUrl,
  barracks: barracksUrl,
  training_ground: trainingGroundUrl,
} as const satisfies Partial<Record<BuildingId, string>>;

const UNIT_SOURCES: Readonly<Record<MilitaryUnitKind, string>> = {
  soldier: soldierUrl,
  patrol: patrolUrl,
  transport: transportUrl,
  armored: armoredUrl,
  helicopter: helicopterUrl,
};

type MilitarySpriteId = keyof typeof SOURCES;
const sprites = new Map<MilitarySpriteId, HTMLImageElement>();
const unitImages = new Map<MilitaryUnitKind, HTMLImageElement>();
const unitTextures = new Map<MilitaryUnitKind, Texture>();
let loading: Promise<void> | undefined;

export function isMilitarySprite(id: BuildingId): id is MilitarySpriteId {
  return id in SOURCES;
}

/** Load cropped military art before painting the atlas or a UI thumbnail. */
export function loadMilitaryAssets(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      [...Object.entries(SOURCES).map(([id, src]) => [id, src] as const), ...Object.entries(UNIT_SOURCES).map(([id, src]) => [id, src] as const)].map(([id, src]) => new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          if (id in UNIT_SOURCES) unitImages.set(id as MilitaryUnitKind, image);
          else sprites.set(id as MilitarySpriteId, image);
          resolve();
        };
        image.onerror = () => reject(new Error(`Não foi possível carregar o asset militar: ${id}`));
        image.src = src;
      })),
    ).then(() => undefined).catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}

/** Pixi texture for one of the cropped unit sprites. */
export function militaryUnitTexture(kind: MilitaryUnitKind): Texture {
  let texture = unitTextures.get(kind);
  if (!texture) {
    const image = unitImages.get(kind);
    if (!image) throw new Error(`Asset militar ainda não carregado: ${kind}`);
    texture = Texture.from(image);
    unitTextures.set(kind, texture);
  }
  return texture;
}

/** Paint the supplied isometric sprite inside its lot; return false until it has loaded. */
export function paintMilitaryAsset(ctx: CanvasRenderingContext2D, id: BuildingId, frameW: number, frameH: number): boolean {
  if (!isMilitarySprite(id)) return false;
  const image = sprites.get(id);
  if (!image) return false;
  const { w, h } = BUILDINGS[id].size;
  const width = (w + h) * HALF_W;
  const scale = width / image.naturalWidth;
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  ctx.drawImage(image, (frameW - drawW) / 2, frameH - GROUND_PAD - drawH, drawW, drawH);
  return true;
}
