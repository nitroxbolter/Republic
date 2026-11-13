import { useEffect, useRef } from 'react';
import { buildingFrameSize, paintBuilding } from '../../../render/atlas/buildings';
import type { BuildingId } from '../../../sim/buildings/catalog';

/** Same procedural artwork used by the in-game building picker. */
export function BuildingThumb({ id, size = 64 }: { id: BuildingId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const frame = buildingFrameSize(id);
    const scale = Math.min(size / frame.w, size / frame.h);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ((size - frame.w * scale) / 2) * dpr, (size - frame.h * scale) * dpr);
    paintBuilding(ctx, id, 0, 0, { stillParts: true });
  }, [id, size]);
  return <canvas ref={ref} className="building-thumb" style={{ width: size, height: size }} aria-hidden="true" />;
}
