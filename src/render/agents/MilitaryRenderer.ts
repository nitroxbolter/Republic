import { Container, Graphics, Sprite } from 'pixi.js';
import type { MilitaryUnit } from '../../sim/systems/military';
import type { World } from '../../sim/World';
import { militaryUnitTexture } from '../atlas/buildings/militaryAssets';
import { liftView } from '../view/lift';
import type { ViewRef } from '../Renderer';
import type { Rect } from '../Camera';

/** Draws player-controlled military units above the city and shows selected movement routes. */
export class MilitaryRenderer {
  readonly container = new Container({ sortableChildren: true });
  private readonly sprites = new Map<number, Sprite>();
  private readonly route = new Graphics();

  constructor(private readonly viewRef: ViewRef) {
    this.container.addChild(this.route);
  }

  update(_world: World, units: readonly MilitaryUnit[], selectedId: number | null, view: Rect) {
    const alive = new Set<number>();
    this.route.clear();
    let selected: MilitaryUnit | undefined;
    const vt = this.viewRef.current;
    for (const unit of units) {
      alive.add(unit.id);
      const vp = vt.pointToView(unit.x, unit.y);
      const point = liftView(this.viewRef.ground, vp.x, vp.y);
      if (point.x < view.minX - 70 || point.x > view.maxX + 70 || point.y < view.minY - 90 || point.y > view.maxY + 50) {
        const hidden = this.sprites.get(unit.id);
        if (hidden) hidden.visible = false;
        continue;
      }
      let sprite = this.sprites.get(unit.id);
      if (!sprite) {
        sprite = new Sprite(militaryUnitTexture(unit.kind));
        sprite.anchor.set(0.5, 1);
        sprite.eventMode = 'none';
        this.sprites.set(unit.id, sprite);
        this.container.addChild(sprite);
      }
      const height = unit.kind === 'soldier' ? 18 : unit.kind === 'helicopter' ? 36 : 27;
      const width = height * sprite.texture.width / Math.max(1, sprite.texture.height);
      sprite.width = width;
      sprite.height = height;
      sprite.position.set(point.x, point.y - (unit.kind === 'helicopter' ? 17 : 0));
      sprite.rotation = 0;
      sprite.zIndex = (vp.x + vp.y) * 100 + 1;
      sprite.visible = true;
      if (unit.id === selectedId) selected = unit;
    }
    for (const [id, sprite] of this.sprites) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    if (selected) {
      const vp = vt.pointToView(selected.x, selected.y);
      const p = liftView(this.viewRef.ground, vp.x, vp.y);
      this.route.zIndex = Number.MAX_SAFE_INTEGER;
      this.route.ellipse(p.x, p.y - 2, 12, 6).fill({ color: 0x2dd4bf, alpha: 0.18 }).stroke({ color: 0x5eead4, alpha: 0.95, width: 1.5 });
      if (selected.path.length > selected.pathIndex) {
        this.route.moveTo(p.x, p.y - 2).stroke({ color: 0x5eead4, alpha: 0.85, width: 1.6 });
        for (let i = selected.pathIndex; i < selected.path.length; i++) {
          const waypoint = selected.path[i];
          const pos = vt.pointToView(waypoint.x, waypoint.y);
          const q = liftView(this.viewRef.ground, pos.x, pos.y);
          this.route.lineTo(q.x, q.y - 2);
        }
        this.route.stroke({ color: 0x5eead4, alpha: 0.85, width: 1.6 });
      }
    }
    this.container.sortChildren();
  }
}
