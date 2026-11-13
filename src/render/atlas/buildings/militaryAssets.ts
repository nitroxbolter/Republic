import militaryBaseUrl from './military-assets/military_base.png';
import militaryGarageUrl from './military-assets/military_garage.png';
import armoryUrl from './military-assets/armory.png';
import barracksUrl from './military-assets/barracks.png';
import trainingGroundUrl from './military-assets/training_ground.png';
import { HALF_W } from '../../../shared/constants';
import { BUILDINGS, type BuildingId } from '../../../sim/buildings/catalog';
import { GROUND_PAD } from '../geometry';

const SOURCES = {
  military_base: militaryBaseUrl,
  military_garage: militaryGarageUrl,
  armory: armoryUrl,
  barracks: barracksUrl,
  training_ground: trainingGroundUrl,
} as const satisfies Partial<Record<BuildingId, string>>;

type MilitarySpriteId = keyof typeof SOURCES;
const sprites = new Map<MilitarySpriteId, HTMLImageElement>();
let loading: Promise<void> | undefined;

export function isMilitarySprite(id: BuildingId): id is MilitarySpriteId {
  return id in SOURCES;
}

/** Load cropped military art before painting the atlas or a UI thumbnail. */
export function loadMilitaryAssets(): Promise<void> {
  if (!loading) {
    loading = Promise.all(
      Object.entries(SOURCES).map(([id, src]) => new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          sprites.set(id as MilitarySpriteId, image);
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
