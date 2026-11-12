import { useAtomValue } from 'jotai';
import type { ToolPreviewInfo } from '../../game/events';
import { isZoneTool } from '../../game/tools';
import { gameAtom, toolPreviewAtom } from '../atoms';
import { isRoadTool, ROAD_TOOLS } from '../../game/tools';
import { ROAD_SPECS } from '../../sim/roadTypes';

const CURSOR_GAP = 18;
/** Space the label needs before it flips to the other side of the cursor. */
const LABEL_ROOM_X = 220;
const LABEL_ROOM_Y = 60;

function verbFor(p: ToolPreviewInfo): string {
  return p.label ?? (p.tool === 'clear' ? 'Limpar' : isRoadTool(p.tool) ? ROAD_SPECS[ROAD_TOOLS[p.tool]].name : 'Construir');
}

/** A finished touch drag (D-080): what it is and costs, with Build and Cancel. */
function ConfirmBar({ p }: { p: ToolPreviewInfo }) {
  const game = useAtomValue(gameAtom);
  const blocked = p.blocked || p.count === 0;
  const action = p.tool === 'clear' ? 'Limpar' : isZoneTool(p.tool) ? 'Criar zona' : 'Construir';
  return (
    <div className={`panel draft-confirm ${p.affordable && !blocked ? '' : 'is-unaffordable'}`} role="dialog" aria-label="Confirm">
      <span className="draft-what">
        <span className="cost-verb">{verbFor(p)}</span>
        {blocked ? (
          <span className="cost-dim">{p.blocked ? 'não é possível construir aqui' : 'nada para alterar'}</span>
        ) : (
          <>
            <span className="cost-value">{p.cost === 0 ? 'Free' : `$${p.cost.toLocaleString()}`}</span>
            {p.tool !== 'build' && (
              <span className="cost-dim">
                {p.count} quadrado{p.count === 1 ? '' : 's'}
              </span>
            )}
          </>
        )}
        {p.note && <span className="cost-note">{p.note}</span>}
      </span>
      <button type="button" className="draft-cancel" onClick={() => game?.cancel()}>
        Cancel
      </button>
      <button type="button" className="draft-build" disabled={blocked || !p.affordable} onClick={() => game?.confirmDraft()}>
        {action}
      </button>
    </div>
  );
}

/** Follows the cursor during a drag: what the action costs and how many tiles it touches. */
export function CostLabel() {
  const p = useAtomValue(toolPreviewAtom);
  if (!p) return null;
  if (p.awaitingConfirm) return <ConfirmBar p={p} />;

  const verb = verbFor(p);
  const empty = p.count === 0;
  // Flip to the other side of the cursor near the right/bottom edges so the label never clips.
  const flipX = p.screen.x > window.innerWidth - LABEL_ROOM_X;
  const flipY = p.screen.y > window.innerHeight - LABEL_ROOM_Y;
  const dx = flipX ? `calc(${p.screen.x - CURSOR_GAP}px - 100%)` : `${p.screen.x + CURSOR_GAP}px`;
  const dy = flipY ? `calc(${p.screen.y - CURSOR_GAP}px - 100%)` : `${p.screen.y + CURSOR_GAP}px`;
  return (
    <div
      className={`cost-label ${p.affordable && !p.blocked ? '' : 'is-unaffordable'}`}
      style={{ transform: `translate(${dx}, ${dy})` }}
    >
      <span className="cost-verb">{verb}</span>
      {p.note && <span className="cost-note">{p.note}</span>}
      {p.blocked ? (
        <span className="cost-dim">não é possível construir aqui</span>
      ) : empty ? (
        <span className="cost-dim">nada para {p.tool === 'clear' ? 'limpar' : isZoneTool(p.tool) ? 'marcar' : 'construir'}</span>
      ) : p.tool === 'build' ? (
        <span className="cost-value">${p.cost.toLocaleString()}</span>
      ) : (
        <>
          <span className="cost-value">{p.cost === 0 ? 'Free' : `$${p.cost.toLocaleString()}`}</span>
          <span className="cost-dim">
            {p.count} quadrado{p.count === 1 ? '' : 's'}
          </span>
        </>
      )}
    </div>
  );
}
