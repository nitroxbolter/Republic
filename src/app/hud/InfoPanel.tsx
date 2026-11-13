import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { SERVICE_KINDS as ALL_SERVICES, type ServiceKind } from '../../sim/buildings/catalog';
import type { NeedKind } from '../../sim/systems/needs';
import type { InspectInfo, StationInfo } from '../../game/events';
import { gameAtom, inspectAtom, zoneInspectAtom } from '../atoms';
import { aqiBand } from '../../sim/systems/air';

const NEED_LABEL: Readonly<Record<NeedKind, string>> = {
  jobs: 'Jobs',
  shopping: 'Shopping',
  safety: 'Safety',
  health: 'Health',
  education: 'Education',
  hospital: 'Hospital',
  university: 'University',
  garbage: 'Garbage',
  transit: 'Transit',
  research: 'Research',
  commute: 'Commute',
  traffic: 'Traffic',
  air: 'Clean air',
  parks: 'Parks',
  affordability: 'Affordability',
  workers: 'Workers',
  customers: 'Customers',
};

/** What fixes a weak need, in a few words. */
const NEED_HINT: Readonly<Record<NeedKind, string>> = {
  jobs: 'Zone shops, offices or industry the residents can reach',
  shopping: 'Zone shops within 12 tiles',
  safety: 'Build a police station and a fire station nearby',
  health: 'Build a clinic or hospital nearby',
  education: 'Build a school nearby',
  hospital: 'Build a hospital in reach',
  university: 'Build a university in reach',
  garbage: 'Build a landfill, recycling centre or incinerator in reach',
  transit: 'Build a bus station within 10 tiles or a train station within 8',
  research: 'Build a research centre (Civic → Services)',
  commute: 'Wider roads, or jobs closer to home',
  traffic: 'Wider roads around here',
  air: 'Keep factories, power plants and landfills further away',
  parks: 'Build parks within 6 tiles',
  affordability: 'Lower taxes to restore household spending power',
  workers: 'Zone more homes nearby',
  customers: 'More residents nearby',
};

const SERVICE_LABEL: Readonly<Record<ServiceKind, string>> = {
  police: 'Police',
  fire: 'Fire',
  health: 'Clinic',
  education: 'School',
  hospital: 'Hospital',
  university: 'University',
};

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  residential: 'Home',
  commercial: 'Shops & Offices',
  industrial: 'Industry',
  civic: 'Civic',
};

const pct = (n: number) => Math.round(n * 100);

/** The one thing to know first, with what to do about it (or that all is well). */
function alertFor(info: InspectInfo): { tone: 'ok' | 'warn' | 'building'; title: string; body?: string } {
  if (info.constructionDays > 0) {
    return { tone: 'building', title: `Em construção · faltam ${info.constructionDays} dia${info.constructionDays === 1 ? '' : 's'}` };
  }
  if (info.abandoned) return { tone: 'warn', title: 'Abandoned', body: 'Its people left after a long unhappy spell. Fix the needs below and they come back.' };
  if (!info.hasRoad) return { tone: 'warn', title: 'No road access', body: 'Build a road within 3 tiles of it.' };
  if (info.powerIssue) {
    return {
      tone: 'warn',
      title: `Sem energia: ${info.powerIssue.reason.toLowerCase()}`,
      body: 'Power runs along roads: a plant powers the buildings on the same connected road network. Build another plant there, or link the roads.',
    };
  }
  if (info.needsUtilities && !info.watered) {
    return { tone: 'warn', title: 'No water', body: 'No water tower with water to spare within 14 tiles: build one closer, or another if they are all used up.' };
  }
  if (info.needs?.complaint) {
    const worst = [...info.needs.scores].sort((a, b) => a.score - b.score)[0];
    return { tone: 'warn', title: `“${info.needs.complaint}”`, body: worst && worst.score < 0.5 ? NEED_HINT[worst.kind] : undefined };
  }
  return { tone: 'ok', title: 'Running well' };
}

function Meter({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(value)}>
      <div className={`meter-fill ${warn ? 'is-short' : ''}`} style={{ width: `${pct(Math.max(0, Math.min(1, value)))}%` }} />
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="info-stat">
      <span className="info-stat-label">{label}</span>
      <strong className="info-stat-value">{value}</strong>
      {children}
    </div>
  );
}

/** A train station: its name, riders, and each line through it as a strip of stops. */
function StationSection({ station }: { station: StationInfo }) {
  return (
    <section className="info-section station-section">
      <h3 className="info-section-title">{station.name}</h3>
      <div className="info-stats">
        <Stat label="Riders a day" value={station.riders.toLocaleString()} />
        <Stat label="Trains" value={station.lines.reduce((n, l) => n + l.trains, 0).toLocaleString()} />
      </div>
      {!station.onTrack ? (
        <p className="info-note warn-text">The track beside it is gone: lay rail right next to the station.</p>
      ) : station.lines.length === 0 ? (
        <p className="info-note">Not on a line yet: build another station on the same track.</p>
      ) : (
        station.lines.map((line, k) => (
          <div key={k} className="rail-line" aria-label={`Linha ${k + 1}`}>
            <div className="rail-line-head">
              <span className="rail-line-badge">{k + 1}</span>
              <span>
                {line.stops.length} paradas · {line.trains} trem{line.trains === 1 ? '' : 's'} em cada sentido
              </span>
            </div>
            <ol className="rail-stops">
              {line.stops.map((s, n) => (
                <li key={`${s.name}-${n}`} className={s.here ? 'is-here' : ''}>
                  <i aria-hidden="true" />
                  <span className="rail-stop-name">{s.name}</span>
                  <span className="rail-stop-riders">{s.riders.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
      <p className="info-note">Homes and jobs within 8 tiles of a station take the train when it beats driving.</p>
    </section>
  );
}

/** Slides in when a building is clicked with the Select tool: actions first, then what matters most. */
export function InfoPanel() {
  const info = useAtomValue(inspectAtom);
  const zone = useAtomValue(zoneInspectAtom);
  const game = useAtomValue(gameAtom);
  if (!info && zone) return (
    <aside className="panel info-panel" aria-label={`Detalhes de ${zone.name}`}>
      <header className="info-header">
        <div>
          <h2 className="info-title">{zone.name}</h2>
          <span className="info-chip">Terreno {zone.x + 1}, {zone.y + 1}</span>
        </div>
        <button type="button" className="icon-button" aria-label="Fechar" onClick={() => game?.inspect(null)}>×</button>
      </header>
      <div className={`info-alert ${zone.waiting ? 'building' : 'warn'}`} role={zone.waiting ? undefined : 'status'}>
        <strong>{zone.title}</strong>
        <span>{zone.detail}</span>
      </div>
    </aside>
  );
  if (!info) return null;
  const alert = alertFor(info);
  const needs = info.needs ? [...info.needs.scores].sort((a, b) => a.score - b.score) : [];
  const canRepair = info.condition !== null && (info.repairDays > 0 || info.condition < 1);

  return (
    <aside className="panel info-panel" aria-label={`Detalhes de ${info.name}`}>
      <header className="info-header">
        <div>
          <h2 className="info-title">{info.name}</h2>
          <span className={`info-chip chip-${info.category}`}>{CATEGORY_LABEL[info.category] ?? info.category}</span>
          {info.level > 0 && <span className="info-level" title={`Nível ${info.level}`}>{'★'.repeat(info.level)}</span>}
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => game?.inspect(null)}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="info-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => game?.startMove(info.id)}
          disabled={info.constructionDays > 0}
          title="Pick it up and set it down somewhere else (P) · costs 20% of its price"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Move
        </button>
        {info.taxesWaiting !== null && (
          <button
            type="button"
            className="secondary-button collect-button"
            onClick={() => game?.collectTaxes()}
            disabled={info.taxesWaiting <= 0}
            title="Taxes arrive at the end of each month"
          >
            Recolher ${info.taxesWaiting.toLocaleString()}
          </button>
        )}
        {canRepair && (
          <button type="button" className="secondary-button" onClick={() => game?.repairBuilding(info.id)} disabled={info.repairCost <= 0}>
            Reparar · ${info.repairCost.toLocaleString()}
          </button>
        )}
        <button type="button" className="danger-button" onClick={() => game?.demolish(info.id)}>
          Demolish
        </button>
      </div>

      <div className={`info-alert ${alert.tone}`} role={alert.tone === 'warn' ? 'alert' : undefined}>
        <strong>{alert.title}</strong>
        {alert.body && <span>{alert.body}</span>}
        {info.powerIssue && (
          <dl className="info-alert-stats">
            {info.powerIssue.stats.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="info-stats">
        {info.capacity > 0 && (
          <Stat label={info.occupantLabel} value={`${info.occupants.toLocaleString()} / ${info.capacity.toLocaleString()}`}>
            <Meter value={info.capacity === 0 ? 0 : info.occupants / info.capacity} />
          </Stat>
        )}
        {info.needs && (
          <Stat label="Happiness" value={`${pct(info.needs.happiness)}%`}>
            <Meter value={info.needs.happiness} warn={info.needs.happiness < 0.45} />
          </Stat>
        )}
        {info.lifestyle && <Stat label="Lifestyle" value={info.lifestyle.tier} />}
        {info.commuteMinutes !== null && <Stat label="Commute" value={`${Math.round(info.commuteMinutes)} min`} />}
        {info.garbage !== null && <Stat label="Garbage waiting" value={`${info.garbage.toFixed(1)} t`} />}
        <Stat label="Air quality" value={`IQA ${info.aqi} · ${aqiBand(info.aqi).label}`} />
      </div>
      {info.lifestyle && <p className="info-note">{info.lifestyle.note}</p>}

      {needs.length > 0 && (
        <section className="info-section">
          <h3 className="info-section-title">Needs · worst first</h3>
          <ul className="info-need-list">
            {needs.map((n) => (
              <li key={n.kind} className={n.score < 0.4 ? 'warn' : n.score < 0.7 ? 'mid' : 'ok'}>
                <span className="info-need-label">{NEED_LABEL[n.kind]}</span>
                <Meter value={n.score} warn={n.score < 0.4} />
                <span className="info-need-pct">{pct(n.score)}%</span>
                {n.score < 0.5 && <span className="info-need-hint">{NEED_HINT[n.kind]}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {info.needsUtilities && info.constructionDays === 0 && (
        <section className="info-section">
          <h3 className="info-section-title">Connections</h3>
          <div className="info-services-list">
            <span className={`info-pill ${info.hasRoad ? 'ok' : 'warn'}`}>Road</span>
            <span className={`info-pill ${info.powered ? 'ok' : 'warn'}`}>Power</span>
            <span className={`info-pill ${info.watered ? 'ok' : 'warn'}`}>Water</span>
            {ALL_SERVICES.map((k) => (
              <span key={k} className={`info-pill ${info.services.includes(k) ? 'ok' : 'off'}`}>
                {SERVICE_LABEL[k]}
              </span>
            ))}
          </div>
        </section>
      )}

      {info.station && <StationSection station={info.station} />}
      {info.busStation && (
        <section className="info-section">
          <h3 className="info-section-title">Buses</h3>
          <div className="info-stats">
            <Stat label="Riders a day" value={info.busStation.riders.toLocaleString()} />
            <Stat label="Buses out" value={`${info.busStation.out} de ${info.busStation.fleet}`} />
          </div>
          <p className="info-note">
            {info.hasRoad
              ? `Ônibus saem do terminal, percorrem a cidade e retornam. Moradias a até ${info.busStation.reach} quadrados enviam parte dos trabalhadores de ônibus.`
              : 'Construa ao lado de uma rua para conectar a entrada.'}
          </p>
        </section>
      )}
      {(info.provides || info.facility || info.condition !== null) && (
        <section className="info-section">
          <h3 className="info-section-title">Provides</h3>
          {info.provides?.kind === 'service' && (
            <div className="info-row">
              <span>{SERVICE_LABEL[info.provides.service]} para edifícios a até</span>
              <strong>{info.provides.radius} quadrados</strong>
            </div>
          )}
          {info.provides?.kind === 'utility' && (info.provides.power || info.provides.water) ? (
            <div className="info-row">
              <span>{info.provides.water && info.provides.coverage ? `Abastece edifícios a até ${info.provides.coverage} quadrados com` : 'Abastece sua rede viária com'}</span>
              <strong>
                {[info.provides.power && `${info.provides.power.toLocaleString()} de energia`, info.provides.water && `${info.provides.water.toLocaleString()} de água`]
                  .filter(Boolean)
                  .join(' · ')}
              </strong>
            </div>
          ) : null}
          {info.facility && (
            <>
              <div className="info-row">
                <span>Garbage collected today</span>
                <strong>
                  {Math.round(info.facility.collectedToday)} / {info.facility.trucks} t
                </strong>
              </div>
              {info.facility.holds !== null && info.facility.filled !== null && (
                <Stat label="Landfill full" value={`${pct(info.facility.filled / info.facility.holds)}%`}>
                  <Meter value={info.facility.filled / info.facility.holds} warn={info.facility.filled / info.facility.holds > 0.85} />
                </Stat>
              )}
            </>
          )}
          {info.condition !== null && (
            <Stat label="Plant condition" value={info.repairDays > 0 ? `Parada · reparo em ${info.repairDays} dias` : `${pct(info.condition)}%`}>
              <Meter value={info.condition} warn={info.condition < 0.4} />
            </Stat>
          )}
        </section>
      )}

      <details className="info-details">
        <summary>Details</summary>
        <p className="info-desc">{info.description}</p>
        {info.investorValue > 0 && (
          <div className="info-row dim">
            <span>Investor appeal</span>
            <span>+{info.investorValue}</span>
          </div>
        )}
        {info.upkeep > 0 && (
          <div className="info-row dim">
            <span>Upkeep</span>
            <span title="Custo-base mais uma parcela por mil moradores atendidos, ajustada ao tipo de prédio">${info.upkeep.toLocaleString()}/mês</span>
          </div>
        )}
        <div className="info-row dim">
          <span>Origin</span>
          <span>{info.grown ? 'Grew on a zone' : 'Placed'}</span>
        </div>
        <div className="info-row dim">
          <span>Footprint</span>
          <span>
            {info.size.w}×{info.size.h}
          </span>
        </div>
      </details>
    </aside>
  );
}
