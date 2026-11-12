import { BALANCE } from '../../shared/balance';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import {
  isRoadTool,
  ROAD_TOOL_IDS,
  ROAD_TOOLS,
  TOOL_KEYS,
  type RoadToolId,
} from '../../game/tools';
import { PAVEMENTS, ROAD_SPECS, type PavementStyle } from '../../sim/roadTypes';
import { activeToolAtom, gameAtom, pavementAtom, flyoverAtom } from '../atoms';
import { PickerChip, usePickerFold } from './pickerFold';

/** One line under each road's name (docs/specs/transport.md). */
const BLURB: Readonly<Record<RoadToolId, string>> = {
  pedestrian: 'Calçadão sem carros · pedestres e lojas',
  road: '2 faixas · calçadas e árvores',
  avenue: '4 faixas · canteiro central arborizado',
  boulevard: '6 faixas em 2 quadrados · arborizada',
  ramp: 'Alça de acesso · conecta vias expressas',
  highway: '4 faixas · rápida, sem calçadas',
  expressway: '8 faixas em 2 quadrados · apenas alças de acesso',
};

const PAVEMENT_LABEL: Readonly<Record<PavementStyle, string>> = {
  concrete: 'Concreto',
  brick: 'Tijolos',
  setts: 'Paralelepípedos',
  promenade: 'Calçadão',
};

/** Swatch colours for the pavement chips (match render/atlas/roads/paving.ts). */
const PAVEMENT_SWATCH: Readonly<Record<PavementStyle, string>> = {
  concrete: '#d8d2c5',
  brick: '#d9a27c',
  setts: '#9ea2a8',
  promenade: '#e6e0d2',
};

/** A tiny cross-section: footpaths, lanes and medians, so the types read at a glance. */
function CrossSection({ tool }: { tool: RoadToolId }): ReactNode {
  const asphalt = '#454a52';
  const lanes = (x0: number, x1: number, n: number, dash = '#e6e9ec') =>
    Array.from({ length: n - 1 }, (_, k) => {
      const x = x0 + ((x1 - x0) * (k + 1)) / n;
      return (
        <line
          key={`${x0}-${k}`}
          x1={x}
          x2={x}
          y1={3}
          y2={21}
          stroke={dash}
          strokeWidth={0.8}
          strokeDasharray="2.5 2.5"
        />
      );
    });
  const path = (x: number, w: number, fill = '#cfc6b6') => (
    <rect x={x} y={2} width={w} height={20} fill={fill} rx={1} />
  );
  const road = (x: number, w: number) => <rect x={x} y={2} width={w} height={20} fill={asphalt} />;
  const green = (x: number, w: number) => <rect x={x} y={2} width={w} height={20} fill="#5aa843" />;
  const barrier = (x: number) => <rect x={x} y={2} width={1.6} height={20} fill="#c9ced4" />;
  switch (tool) {
    case 'pedestrian':
      return (
        <>
          {path(2, 36, '#b9bcc2')}
          <line x1={20} x2={20} y1={2} y2={22} stroke="#7b8088" strokeWidth={1.2} />
        </>
      );
    case 'road':
      return (
        <>
          {path(4, 5)}
          {road(9, 22)}
          {path(31, 5)}
          <line
            x1={20}
            x2={20}
            y1={3}
            y2={21}
            stroke="#f3d548"
            strokeWidth={0.9}
            strokeDasharray="3 2.5"
          />
        </>
      );
    case 'avenue':
      return (
        <>
          {path(2, 4)}
          {road(6, 13)}
          {green(19, 2.4)}
          {road(21.4, 13)}
          {path(34.4, 4)}
          {lanes(6, 19, 2)}
          {lanes(21.4, 34.4, 2)}
        </>
      );
    case 'boulevard':
      return (
        <>
          {path(1, 3, '#e6e0d2')}
          {road(4, 15)}
          {green(19, 2.6)}
          {road(21.6, 15)}
          {path(36.6, 3, '#e6e0d2')}
          {lanes(4, 19, 3)}
          {lanes(21.6, 36.6, 3)}
        </>
      );
    case 'ramp':
      return (
        <>
          {green(8, 3)}
          {barrier(11)}
          {road(12.6, 15)}
          {barrier(27.6)}
          {green(29.2, 3)}
          <line
            x1={20}
            x2={20}
            y1={3}
            y2={21}
            stroke="#f1d54a"
            strokeWidth={0.9}
            strokeDasharray="3 2.5"
          />
        </>
      );
    case 'highway':
      return (
        <>
          {barrier(5)}
          {road(6.6, 13)}
          {barrier(19.6)}
          {road(21.2, 13)}
          {barrier(34.2)}
          {lanes(6.6, 19.6, 2)}
          {lanes(21.2, 34.2, 2)}
        </>
      );
    case 'expressway':
      return (
        <>
          {barrier(1)}
          {road(2.6, 16.6)}
          {barrier(19.2)}
          {road(20.8, 16.6)}
          {barrier(37.4)}
          {lanes(2.6, 19.2, 4)}
          {lanes(20.8, 37.4, 4)}
        </>
      );
  }
}

/** Panel above the toolbar while a road tool is active: every road type, and the footpath style. */
export function RoadPicker() {
  const tool = useAtomValue(activeToolAtom);
  return isRoadTool(tool) || tool === 'rail' ? <RoadPickerPanel /> : null;
}

function RoadPickerPanel() {
  const game = useAtomValue(gameAtom);
  const tool = useAtomValue(activeToolAtom);
  const pavement = useAtomValue(pavementAtom);
  const flyover = useAtomValue(flyoverAtom);
  const fold = usePickerFold();
  const spec = isRoadTool(tool) ? ROAD_SPECS[ROAD_TOOLS[tool]] : null;
  if (fold.drafting) return null;
  if (fold.folded && isRoadTool(tool) && spec) {
    return (
      <PickerChip
        kind="road-picker"
        picture={
          <svg viewBox="0 0 40 24" width="40" height="24" className="road-section">
            <CrossSection tool={tool} />
          </svg>
        }
        name={spec.name}
        cost={`$${(spec.cost * spec.width).toLocaleString()}/quadrado`}
        onChange={fold.unfold}
      />
    );
  }

  return (
    <div className="panel road-picker" role="dialog" aria-label="Choose a road">
      <div className="road-cards">
        {ROAD_TOOL_IDS.map((id) => {
          const s = ROAD_SPECS[ROAD_TOOLS[id]];
          return (
            <button
              key={id}
              type="button"
              className={`road-card ${tool === id ? 'is-active' : ''}`}
              aria-pressed={tool === id}
              onClick={() => {
                game?.setTool(id);
                fold.chosen();
              }}
              title={`${s.name}: ${BLURB[id]} · suporta ${s.cars ? `${(s.capacity * s.width).toLocaleString()} carros por dia` : 'apenas pedestres'}`}
            >
              <svg
                viewBox="0 0 40 24"
                width="56"
                height="34"
                aria-hidden="true"
                className="road-section"
              >
                <CrossSection tool={id} />
              </svg>
              <span className="road-name">{s.name}</span>
              <span className="road-blurb">{BLURB[id]}</span>
              <span className="road-meta">
                <span className="card-cost">${(s.cost * s.width).toLocaleString()}</span>
                <span className="road-unit">/tile</span>
                <kbd>{TOOL_KEYS[id].replace('Key', '')}</kbd>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className={`road-card ${tool === 'rail' ? 'is-active' : ''}`}
          aria-pressed={tool === 'rail'}
          onClick={() => game?.setTool('rail')}
          title="Rail: trains between stations take commuters off the roads. Crosses streets at right angles. Needs the Rapid transit research in new cities."
        >
          <svg viewBox="0 0 40 24" width="56" height="34" aria-hidden="true" className="road-section">
            <rect x="4" y="9" width="32" height="6" rx="1" fill="#968b79" />
            {[7, 12, 17, 22, 27, 32].map((x) => (
              <rect key={x} x={x} y="8" width="2" height="8" fill="#6e4b30" />
            ))}
            <rect x="4" y="10" width="32" height="1" fill="#cfd5dc" />
            <rect x="4" y="13" width="32" height="1" fill="#cfd5dc" />
          </svg>
          <span className="road-name">Rail</span>
          <span className="road-blurb">Trains between stations</span>
          <span className="road-meta">
            <span className="card-cost">${BALANCE.railCost}</span>
            <span className="road-unit">/tile</span>
            <kbd>Z</kbd>
          </span>
        </button>
      </div>
      {spec && spec.width === 1 && spec.cars && (
        <div className="pavement-row" role="radiogroup" aria-label="Where this road crosses another">
          <span className="pavement-label">At crossings</span>
          <button type="button" role="radio" aria-checked={!flyover} className={`pavement-chip ${!flyover ? 'is-active' : ''}`} onClick={() => game?.setFlyover(false)}>
            Junction
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={flyover}
            className={`pavement-chip ${flyover ? 'is-active' : ''}`}
            onClick={() => game?.setFlyover(true)}
            title={`Passe esta via sobre outras em cruzamentos retos: sem semáforos nem espera. +$${BALANCE.flyoverCost} por cruzamento`}
          >
            Flyover
          </button>
        </div>
      )}
      {spec?.pavement && (
        <div className="pavement-row" role="radiogroup" aria-label="Footpath paving">
          <span className="pavement-label">Paving</span>
          <button
            type="button"
            role="radio"
            aria-checked={pavement === 0}
            className={`pavement-chip ${pavement === 0 ? 'is-active' : ''}`}
            onClick={() => game?.setPavement(0)}
          >
            <i style={{ background: PAVEMENT_SWATCH[spec.pavement] }} />
            Default
          </button>
          {PAVEMENTS.map((p, k) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={pavement === k + 1}
              className={`pavement-chip ${pavement === k + 1 ? 'is-active' : ''}`}
              onClick={() => game?.setPavement(k + 1)}
            >
              <i style={{ background: PAVEMENT_SWATCH[p] }} />
              {PAVEMENT_LABEL[p]}
            </button>
          ))}
        </div>
      )}
      <p className="road-hint">
        {!spec
          ? 'Drag to lay track (Shift for straight). It crosses streets at right angles and bridges water in straight runs. Build a Train Station beside it (Civic → Services).'
          : spec.width === 2
          ? 'Drag in a straight line: the row you drag carries traffic your way, the row beside it comes back. Drag over a road to upgrade it.'
          : tool === 'ramp'
            ? 'Join an expressway to local roads with a ramp; nothing else connects to an expressway.'
            : 'Drag to build (Shift for straight). Drag a bigger road over a smaller one to upgrade it, paying the difference.'}
      </p>
    </div>
  );
}
