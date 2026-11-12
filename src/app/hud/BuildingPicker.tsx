import { useAtomValue } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { buildingFrameSize, paintBuilding } from '../../render/atlas/buildings';
import { BUILDINGS, PLACEABLE_IDS, type BuildingDef, type BuildingId, type CivicGroup } from '../../sim/buildings/catalog';
import type { ZoneToolId } from '../../game/tools';
import { STAGES, unlockStage, unlockTech } from '../../sim/stages';
import { TECHS } from '../../sim/research';
import { activeToolAtom, buildingChoiceAtom, cityAtom, fundsAtom, gameAtom } from '../atoms';
import { PickerChip, usePickerFold } from './pickerFold';

const CARD_THUMB = 64;

/** Paints the building with the same code as the in-game atlas, scaled to fit the card. */
function BuildingThumb({ id, size = CARD_THUMB }: { id: BuildingId; size?: number }) {
  const THUMB = size;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const f = buildingFrameSize(id);
    const scale = Math.min(THUMB / f.w, THUMB / f.h);
    canvas.width = THUMB * dpr;
    canvas.height = THUMB * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ((THUMB - f.w * scale) / 2) * dpr, (THUMB - f.h * scale) * dpr);
    paintBuilding(ctx, id, 0, 0, { stillParts: true });
  }, [id, THUMB]);
  return <canvas ref={ref} className="building-thumb" style={{ width: THUMB, height: THUMB }} aria-hidden="true" />;
}

const GROUPS: readonly { id: CivicGroup; label: string; hint: string }[] = [
  { id: 'services', label: 'Serviços', hint: 'Cada serviço atende a área ao redor. Casas atendidas são mais felizes; polícia, bombeiros, clínica e escola permitem o crescimento de torres.' },
  { id: 'transport', label: 'Transporte', hint: 'Estações ao lado dos trilhos (Vias → Trilhos, Z). Moradias e empregos próximos usam o trem quando ele é mais rápido que dirigir.' },
  { id: 'utilities', label: 'Infraestrutura', hint: 'Energia, água e coleta de lixo atendem os edifícios nas vias conectadas, até o limite de capacidade.' },
  { id: 'parks', label: 'Parques e atrações', hint: 'Parques, mercados, comércio e Prefeitura.' },
];

const ZONE_LINKS: readonly { tool: ZoneToolId; label: string; key: string; tone: string }[] = [
  { tool: 'zone-r', label: 'Moradias', key: '1', tone: 'tone-r' },
  { tool: 'zone-rh', label: 'Apartamentos', key: '2', tone: 'tone-rh' },
  { tool: 'zone-c', label: 'Lojas', key: '3', tone: 'tone-c' },
  { tool: 'zone-ch', label: 'Escritórios', key: '4', tone: 'tone-ch' },
  { tool: 'zone-i', label: 'Indústria', key: '5', tone: 'tone-i' },
];

/** Sections within a tab (others show as one grid). */
const SECTIONS: Readonly<Partial<Record<CivicGroup, readonly { label: string; ids: readonly BuildingId[] }[]>>> = {
  services: [
    { label: 'Segurança', ids: ['police_station', 'fire_station'] },
    { label: 'Saúde', ids: ['clinic', 'hospital'] },
    { label: 'Educação e pesquisa', ids: ['school', 'university', 'research_centre'] },
  ],
  utilities: [
    { label: 'Energia', ids: ['power_plant', 'gas_plant', 'wind_turbine', 'solar_farm', 'battery_bank', 'substation'] },
    { label: 'Água', ids: ['water_tower'] },
    { label: 'Lixo', ids: ['landfill', 'recycling_centre', 'incinerator'] },
  ],
};

/** The key number on a card: coverage radius, utility capacity, or footprint. */
function cardStat(d: BuildingDef): string {
  if (d.radius) return `alcance de ${d.radius} quadrados`;
  if (d.garbage) return `${d.garbage.trucks} t/dia`;
  if (d.railStation) return 'junto aos trilhos';
  if (d.energy?.coverage) return `alcance de ${d.energy.coverage} quadrados`;
  if (d.substation) return `alcance de ${d.substation.radius} quadrados`;
  if (d.supplies?.power) return `${d.supplies.power} ⚡`;
  if (d.supplies?.water) return `alcance de ${d.radius ?? 0} quadrados`;
  return `${d.size.w}×${d.size.h}`;
}

/** Panel above the toolbar while the Civic tool is active: services, utilities, parks. */
export function BuildingPicker() {
  const tool = useAtomValue(activeToolAtom);
  return tool === 'build' ? <BuildingPickerPanel /> : null;
}

function BuildingPickerPanel() {
  const game = useAtomValue(gameAtom);
  const choice = useAtomValue(buildingChoiceAtom);
  const funds = useAtomValue(fundsAtom);
  const progress = useAtomValue(cityAtom)?.progress;
  // Opens on the tab of the building chosen last, so "Change" lands where the player was.
  const [tab, setTab] = useState<CivicGroup>(() => {
    const d: BuildingDef = BUILDINGS[choice];
    return d.group ?? 'services';
  });
  const fold = usePickerFold();

  if (fold.drafting) return null;
  if (fold.folded) {
    const d: BuildingDef = BUILDINGS[choice];
    return <PickerChip kind="building-picker" picture={<BuildingThumb id={choice} size={36} />} name={d.name} cost={`$${d.cost.toLocaleString()}`} onChange={fold.unfold} />;
  }
  // Locked buildings (D-086) come last, greyed, with the stage that unlocks them.
  const isLocked = (id: BuildingId) => {
    if (!progress?.locked) return false;
    const tech = unlockTech(id);
    return unlockStage(id) > progress.stage || (tech !== null && !progress.techs.includes(tech));
  };
  /** What a locked card waits for: a stage, or a research project. */
  const lockLabel = (id: BuildingId) => {
    const tech = unlockTech(id);
    if (progress && unlockStage(id) <= progress.stage && tech) return TECHS.find((t) => t.id === tech)?.name ?? tech;
    return STAGES[unlockStage(id)].name;
  };
  const ids = PLACEABLE_IDS.filter((id) => {
    const d: BuildingDef = BUILDINGS[id];
    return d.group === tab;
  }).sort((a, b) => Number(isLocked(a)) - Number(isLocked(b)) || unlockStage(a) - unlockStage(b));

  const card = (id: BuildingId) => {
    const d: BuildingDef = BUILDINGS[id];
    const affordable = d.cost <= funds;
    const locked = isLocked(id);
    const stage = STAGES[unlockStage(id)];
    return (
      <button
        key={id}
        type="button"
        className={`building-card ${id === choice ? 'is-active' : ''} ${affordable ? '' : 'is-unaffordable'} ${locked ? 'is-locked' : ''}`}
        title={
          locked
            ? unlockTech(id) && progress && unlockStage(id) <= progress.stage
              ? `Exige a pesquisa ${lockLabel(id)}`
              : `Desbloqueia no estágio ${stage.name} (${stage.population.toLocaleString()} moradores e serviços básicos)`
            : d.description
        }
        aria-disabled={locked}
        onClick={() => {
          if (locked) return;
          game?.setBuilding(id);
          fold.chosen();
        }}
      >
        <BuildingThumb id={id} />
        <span className="card-name">{d.name}</span>
        <span className="card-meta">
          {locked ? (
            <span className="card-lock">🔒 {lockLabel(id)}</span>
          ) : (
            <>
              <span className="card-cost">${d.cost.toLocaleString()}</span>
              <span className="card-size">{cardStat(d)}</span>
            </>
          )}
        </span>
      </button>
    );
  };
  // Headed sections where the tab has them; anything they don't list goes last.
  const listed = new Set((SECTIONS[tab] ?? []).flatMap((sec) => sec.ids));
  const sections = [
    ...(SECTIONS[tab] ?? []).map((sec) => ({ label: sec.label, ids: ids.filter((id) => sec.ids.includes(id)) })),
    { label: SECTIONS[tab] ? 'More' : '', ids: ids.filter((id) => !listed.has(id)) },
  ].filter((sec) => sec.ids.length > 0);

  return (
    <div className="panel building-picker" role="dialog" aria-label="Choose a civic building">
      <div className="picker-tabs" role="tablist">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === tab}
            className={`picker-tab ${g.id === tab ? 'is-active' : ''}`}
            data-tour={`civic-${g.id}`}
            onClick={() => setTab(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="picker-hint">{GROUPS.find((g) => g.id === tab)?.hint}</p>
      <div className="picker-sections">
        {sections.map((sec) => (
          // Small sections sit side by side; bigger ones take the full width.
          <section key={sec.label} className={`picker-section ${sec.ids.length > 2 ? 'is-wide' : ''}`} aria-label={sec.label || undefined}>
            {sec.label && <h3 className="picker-section-title">{sec.label}</h3>}
            <div className="picker-grid">{sec.ids.map(card)}</div>
          </section>
        ))}
      </div>
      <div className="picker-note">
        <span>Houses, apartments, shops, offices and industry grow on zones next to roads.</span>
        <span className="picker-zone-links">
          {ZONE_LINKS.map((z) => (
            <button key={z.tool} type="button" className={`zone-link ${z.tone}`} onClick={() => game?.setTool(z.tool)}>
              {z.label} <kbd>{z.key}</kbd>
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
