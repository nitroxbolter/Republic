import { useAtomValue } from 'jotai';
import { Fragment, useState, type ReactNode } from 'react';
import type { Game } from '../../game/Game';
import { isRoadTool, isZoneTool, type ToolId } from '../../game/tools';
import { BALANCE } from '../../shared/balance';
import { activeToolAtom, gameAtom } from '../atoms';
import { PHONE, useMedia } from '../mobile/useMedia';

interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
  hint: string;
  icon: ReactNode;
  /** Extra class for the button (zone colours). */
  tone?: string;
  /** Buttons are grouped (select/build, zones, roads), with a divider between groups. */
  group: 'edit' | 'zone' | 'road';
}

/** A lot diamond with the zone's letter. */
function zoneIcon(letter: string): ReactNode {
  return (
    <g>
      <path d="M12 3l9 5v8l-9 5-9-5V8z" fill="currentColor" opacity="0.22" />
      <path d="M12 3l9 5v8l-9 5-9-5V8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="12" y="16.2" textAnchor="middle" fontSize={letter.length > 1 ? 8 : 10} fontWeight="800" fill="currentColor">
        {letter}
      </text>
    </g>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const TOOLS: readonly ToolDef[] = [
  {
    id: 'select',
    group: 'edit',
    label: 'Selecionar',
    key: 'Q',
    hint: 'Inspecionar e mover o mapa',
    icon: <path {...stroke} d="M6 3l12 7-5.5 1.5L10 17z" />,
  },
  {
    id: 'clear',
    group: 'edit',
    label: 'Limpar',
    key: 'B',
    hint: `Arraste para remover árvores, rochas, vias, edifícios e zonas · $${BALANCE.treeClearCost}/árvore`,
    icon: (
      <g {...stroke}>
        <path d="M3 17h11v-5H8l-2 3H3z" />
        <path d="M14 14h3l3-5M20 9v8" />
        <circle cx="6" cy="19" r="1.4" />
        <circle cx="11" cy="19" r="1.4" />
      </g>
    ),
  },
  {
    id: 'build',
    group: 'edit',
    label: 'Serviços',
    key: 'E',
    hint: 'Polícia, bombeiros, clínicas, escolas, energia, água, parques e comércio',
    icon: (
      <g {...stroke}>
        <path d="M3 11l7-6 7 6" />
        <path d="M5 10v10h10V10" />
        <path d="M9 20v-5h3v5" />
        <path d="M17 20h4V7h-4" />
        <path d="M18.5 10h1M18.5 13h1M18.5 16h1" />
      </g>
    ),
  },
  {
    id: 'zone-r',
    group: 'zone',
    label: 'Moradias',
    key: '1',
    hint: `Arraste para criar zona de casas · $${BALANCE.zoneCost}/quadrado · cresce a até ${BALANCE.roadAccessRange} quadrados de uma via`,
    icon: zoneIcon('R'),
    tone: 'tone-r',
  },
  {
    id: 'zone-rh',
    group: 'zone',
    label: 'Apartamentos',
    key: '2',
    hint: `Arraste para criar zona de apartamentos: prédios baixos, blocos e torres · $${BALANCE.zoneCost}/quadrado`,
    icon: zoneIcon('R+'),
    tone: 'tone-rh',
  },
  {
    id: 'zone-c',
    group: 'zone',
    label: 'Lojas',
    key: '3',
    hint: `Arraste para criar zona de lojas e cafés · $${BALANCE.zoneCost}/quadrado · cresce a até ${BALANCE.roadAccessRange} quadrados de uma via`,
    icon: zoneIcon('C'),
    tone: 'tone-c',
  },
  {
    id: 'zone-ch',
    group: 'zone',
    label: 'Escritórios',
    key: '4',
    hint: `Arraste para criar zona de escritórios: pequenos prédios, hotéis e torres · $${BALANCE.zoneCost}/quadrado`,
    icon: zoneIcon('C+'),
    tone: 'tone-ch',
  },
  {
    id: 'zone-i',
    group: 'zone',
    label: 'Indústria',
    key: '5',
    hint: `Arraste para criar zona industrial · $${BALANCE.zoneCost}/quadrado · cresce a até ${BALANCE.roadAccessRange} quadrados de uma via`,
    icon: zoneIcon('I'),
    tone: 'tone-i',
  },
  {
    id: 'road',
    group: 'road',
    label: 'Vias',
    key: 'R',
    hint: 'Ruas, avenidas, bulevares, vias expressas e mais · escolha um tipo acima',
    icon: (
      <g {...stroke}>
        <path d="M8 3L5 21M16 3l3 18" />
        <path d="M12 4v3M12 10.5v3M12 17v3" />
      </g>
    ),
  },
];

/** Every road type lives behind the one Roads button. */
const isActiveIn = (active: ToolId) => (id: ToolId) => (id === 'road' ? isRoadTool(active) || active === 'rail' : active === id);

/** Pressing a tool button: pick it, or drop back to Select if it was already on. */
function press(game: Game | null, id: ToolId, on: boolean) {
  if (!game) return;
  if (on && id !== 'select') game.setTool('select');
  // The Roads button returns to the road type used last (the picker chooses others).
  else game.setTool(id === 'road' ? game.lastRoadTool : id);
}

function ToolGlyph({ t }: { t: ToolDef }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {t.icon}
    </svg>
  );
}

export function Toolbar() {
  const phone = useMedia(PHONE);
  return phone ? <PhoneDock /> : <WideToolbar />;
}

function WideToolbar() {
  const game = useAtomValue(gameAtom);
  const active = useAtomValue(activeToolAtom);
  const isActive = isActiveIn(active);

  return (
    <div className="panel toolbar" role="toolbar" aria-label="Build tools">
      {TOOLS.map((t, k) => (
        <Fragment key={t.id}>
          {k > 0 && TOOLS[k - 1].group !== t.group && <span className="toolbar-divider" aria-hidden="true" />}
          <button
            type="button"
            className={`tool-button ${t.tone ?? ''} ${isActive(t.id) ? 'is-active' : ''}`}
            data-tour={`tool-${t.id}`}
            aria-pressed={isActive(t.id)}
            disabled={!game}
            onClick={() => press(game, t.id, isActive(t.id))}
          >
            <ToolGlyph t={t} />
            <span className="tool-label">{t.label}</span>
            <kbd className="tool-key">{t.key}</kbd>
            <span className="tool-tip" role="tooltip">
              <strong>{t.label}</strong> {t.hint}
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

const ZONES = TOOLS.filter((t) => t.group === 'zone');
const ZONES_BUTTON: ToolDef = {
  id: 'zone-r',
  group: 'zone',
  label: 'Zones',
  key: '',
  hint: 'Homes, shops, offices and industry',
  // Three small lots in the zone colours.
  icon: (
    <g strokeWidth="1.4" strokeLinejoin="round">
      <path d="M7 4l5 2.8-5 2.8-5-2.8z" fill="var(--zone-r)" fillOpacity="0.35" stroke="var(--zone-r)" />
      <path d="M17 4l5 2.8-5 2.8-5-2.8z" fill="var(--zone-c)" fillOpacity="0.35" stroke="var(--zone-c)" />
      <path d="M12 13l5 2.8-5 2.8-5-2.8z" fill="var(--zone-i)" fillOpacity="0.35" stroke="var(--zone-i)" />
    </g>
  ),
};

/**
 * Phones held upright (D-097): one thumb-height row of five (Select, Clear, Civic, Zones, Roads)
 * that fits without scrolling. The five zone types sit in a row that opens above Zones and
 * closes after a type is chosen, leaving the zone tool active on the map.
 */
function PhoneDock() {
  const game = useAtomValue(gameAtom);
  const active = useAtomValue(activeToolAtom);
  const isActive = isActiveIn(active);
  const zoning = isZoneTool(active);
  const [zonesOpen, setZonesOpen] = useState(false);
  const showZones = zonesOpen;
  const byId = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
  /** Another dock tool: the zone row folds away. */
  const pick = (id: ToolId) => {
    setZonesOpen(false);
    press(game, id, id !== 'select' && isActive(id));
  };

  const dockButton = (t: ToolDef, on: boolean, onClick: () => void, tour: string | undefined, expanded?: boolean) => (
    <button
      key={t.label}
      type="button"
      className={`tool-button ${t.tone ?? ''} ${on ? 'is-active' : ''}`}
      data-tour={tour}
      aria-pressed={expanded === undefined ? on : undefined}
      aria-expanded={expanded}
      disabled={!game}
      onClick={onClick}
    >
      <ToolGlyph t={t} />
      <span className="tool-label">{t.label}</span>
    </button>
  );

  return (
    <div className="dock" role="toolbar" aria-label="Build tools">
      {showZones && (
        <div className="panel dock-zones" role="group" aria-label="Zones">
          {ZONES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`zone-chip ${t.tone ?? ''} ${isActive(t.id) ? 'is-active' : ''}`}
              data-tour={`tool-${t.id}`}
              aria-pressed={isActive(t.id)}
              onClick={() => {
                game?.setTool(t.id);
                setZonesOpen(false);
              }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                {t.icon}
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="panel toolbar is-dock">
        {dockButton(byId('select'), isActive('select'), () => pick('select'), 'tool-select')}
        {dockButton(byId('clear'), isActive('clear'), () => pick('clear'), 'tool-clear')}
        {dockButton(byId('build'), isActive('build'), () => pick('build'), 'tool-build')}
        {dockButton(
          ZONES_BUTTON,
          zoning,
          () => {
            setZonesOpen((open) => !open);
          },
          // The tour's "pick Homes" step points here until the row is open.
          showZones ? undefined : 'tool-zone-r',
          showZones,
        )}
        {dockButton(byId('road'), isActive('road'), () => pick('road'), 'tool-road')}
      </div>
    </div>
  );
}
