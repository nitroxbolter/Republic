import { useAtom, useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { SYSTEM_BUDGETS_MS } from '../../sim/core/timings';
import { debugStatsAtom, debugVisibleAtom, gridOnAtom, hoveredTileAtom } from '../atoms';

/** Toggle with F3. Shows the numbers we use to check the 60 FPS budget. */
export function DebugOverlay() {
  const [visible, setVisible] = useAtom(debugVisibleAtom);
  const stats = useAtomValue(debugStatsAtom);
  const hovered = useAtomValue(hoveredTileAtom);
  const grid = useAtomValue(gridOnAtom);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setVisible]);

  if (!visible || !stats) return null;

  const fpsClass = stats.fps >= 55 ? 'good' : stats.fps >= 40 ? 'warn' : 'bad';

  return (
    <div className="panel debug-overlay">
      <div className="debug-fps">
        <span className={`fps-value ${fpsClass}`}>{Math.round(stats.fps)}</span>
        <span className="fps-label">FPS</span>
        <span className="debug-dim">{stats.frameMs.toFixed(1)} ms</span>
      </div>
      <dl>
        <dt>Draw calls</dt>
        <dd>{stats.drawCalls}</dd>
        <dt>Chunks</dt>
        <dd>
          {stats.visibleChunks}/{stats.totalChunks}
        </dd>
        <dt>Sprites</dt>
        <dd>{stats.visibleSprites.toLocaleString()}</dd>
        <dt>Agents</dt>
        <dd>
          {stats.agentsDrawn}/{stats.agents}
        </dd>
        <dt>Boot</dt>
        <dd>
          atlas {Math.round(stats.bootAtlasMs)} · mapa {Math.round(stats.bootChunksMs)} ms
        </dd>
        <dt>Zoom</dt>
        <dd>{stats.zoom.toFixed(2)}×</dd>
        <dt>Map</dt>
        <dd>
          {stats.mapSize}×{stats.mapSize}
        </dd>
        <dt>Seed</dt>
        <dd>{stats.seed}</dd>
        <dt>Tile</dt>
        <dd>{hovered ? `${hovered.x}, ${hovered.y}` : '—'}</dd>
        <dt>Grid</dt>
        <dd>{grid ? 'on' : 'off'}</dd>
        <dt>Sim tick</dt>
        <dd>{stats.simTick}</dd>
      </dl>
      {stats.systems.length > 0 && (
        <>
          <div className="debug-section">Sim · avg / max ms</div>
          <dl>
            {stats.systems.map((t) => {
              const budget = SYSTEM_BUDGETS_MS[t.name];
              const cls = budget === undefined || t.avgMs <= budget ? '' : t.avgMs > budget * 1.5 ? 'bad' : 'warn';
              return (
                <div key={t.name} className="debug-row">
                  <dt>{t.name}</dt>
                  <dd className={cls} title={budget === undefined ? undefined : `limite ${budget} ms`}>
                    {t.avgMs.toFixed(1)} / {t.maxMs.toFixed(0)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </div>
  );
}
