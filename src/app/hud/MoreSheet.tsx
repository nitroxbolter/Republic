import { useAtom, useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { AccountButton } from '../account/AccountButton';
import { airViewAtom, cityAtom, dayNightAtom, gameAtom, happinessViewAtom, mutedAtom, trafficViewAtom } from '../atoms';
import { PHONE, SLIM_BAR, useMedia } from '../mobile/useMedia';
import { useOverlay } from '../overlay/overlay';
import { useStartTour } from '../tour/tourState';
import { aqiBand } from '../../sim/systems/air';
import { minimapShownAtom } from './Minimap';
import { SaveStatus } from './SaveStatus';
import { Sheet } from './Sheet';
import { StageDetails, StageRing, stageProgress } from './StageChip';
import { BRIEFCASE, CAR, CITIES, DAY_NIGHT_OPTIONS, DemandList, HELP, ROTATE_LEFT, ROTATE_RIGHT, faceGlyph, speakerGlyph, useClockText } from './TopBar';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

const MAP_GLYPH = (
  <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" />
    <path d="M9 4v13M15 7v13" />
  </g>
);

interface MoreSheetProps {
  cityName: string;
  onNewCity: () => void;
  onSave: () => void;
  beforeLogout: () => Promise<void>;
}

function Toggle({ on, onClick, glyph, label }: { on: boolean; onClick: () => void; glyph: ReactNode; label: string }) {
  return (
    <button type="button" className={`more-toggle ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {glyph}
      </svg>
      {label}
    </button>
  );
}

/**
 * Phones only (D-097): everything the slim top bar leaves out, in one sheet. The city's numbers
 * first (with what demand means, since there's no hover), then the map views, then the rest.
 */
export function MoreSheet({ cityName, onNewCity, onSave, beforeLogout }: MoreSheetProps) {
  const phone = useMedia(SLIM_BAR);
  const { open, close } = useOverlay('more');
  if (!phone || !open) return null;
  return (
    <Sheet label="City menu" onClose={close} className="more-sheet">
      <MoreBody cityName={cityName} onNewCity={onNewCity} onSave={onSave} beforeLogout={beforeLogout} onClose={close} />
    </Sheet>
  );
}

function MoreBody({ cityName, onNewCity, onSave, beforeLogout, onClose }: MoreSheetProps & { onClose: () => void }) {
  const city = useAtomValue(cityAtom);
  const game = useAtomValue(gameAtom);
  const budget = useOverlay('budget');
  const muted = useAtomValue(mutedAtom);
  const dayNight = useAtomValue(dayNightAtom);
  const trafficView = useAtomValue(trafficViewAtom);
  const happinessView = useAtomValue(happinessViewAtom);
  const airView = useAtomValue(airViewAtom);
  const [minimap, setMinimap] = useAtom(minimapShownAtom);
  // Only upright screens hide the minimap; landscape phones always show a small one.
  const minimapOptional = useMedia(PHONE);
  const startTour = useStartTour();
  const clock = useClockText();
  if (!city) return null;

  const aqi = Math.round(city.air.cityAqi);
  const band = aqiBand(aqi);
  const date = `${city.date.dayOfMonth} ${MONTHS[city.date.month]}, ano ${city.date.year}`;
  // A view toggle closes the sheet so the player sees the map it changed.
  const view = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div className="more-body">
      <header className="more-head">
        <span className="more-title">
          <strong>{cityName}</strong>
          <span className="more-sub">
            {date} · {clock.text}
          </span>
        </span>
        <SaveStatus onSave={onSave} />
      </header>

      <button type="button" className="primary-button" onClick={budget.show}>Orçamento, salário mínimo e aposentadorias</button>

      <div className="more-stats">
        <span className="more-stat"><span className="air-dot" style={{ background: '#7b8da4' }} aria-hidden="true" /><span>
          <strong>População por idade</strong>
          <small>Crianças {city.society.children.toLocaleString()} · jovens {city.society.youth.toLocaleString()} · adultos {city.society.adults.toLocaleString()} · idosos {city.society.seniors.toLocaleString()}</small>
        </span></span>
        <span className="more-stat"><span className="air-dot" style={{ background: '#d23b5a' }} aria-hidden="true" /><span>
          <strong>Saúde e segurança</strong>
          <small>Doentes {city.society.sick.toLocaleString()} · presos {city.society.prisoners.toLocaleString()}/{city.society.prisonCapacity.toLocaleString()} · sem vaga {city.society.prisonOverflow.toLocaleString()} · mortes {city.society.deaths.toLocaleString()}</small>
        </span></span>
        <span className="more-stat">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {BRIEFCASE}
          </svg>
          <span>
            <strong>
              {city.workers.toLocaleString()} / {city.jobs.toLocaleString()}
            </strong>
            <small>trabalhadores / empregos · {city.unemployed.toLocaleString()} desempregados</small>
          </span>
        </span>
        <span className="more-stat">
          <span className="air-dot" style={{ background: '#d6a84f' }} aria-hidden="true" />
          <span>
            <strong>Poder de compra {Math.round(city.economy.purchasingPower * 100)}%</strong>
            <small>Faturamento estimado do comércio: {money(city.economy.commerceRevenue)}/mês · indústria {Math.round(city.economy.industrialProduction * 100)}%</small>
          </span>
        </span>
        <span className="more-stat">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            {faceGlyph(city.needs.happiness)}
          </svg>
          <span>
            <strong>{Math.round(city.needs.happiness * 100)}% felizes</strong>
            <small>{city.needs.abandoned ? `${city.needs.abandoned} abandonados` : 'Ninguém foi embora'}</small>
          </span>
        </span>
        <span className="more-stat">
          <span className="air-dot" style={{ background: `#${band.color.toString(16).padStart(6, '0')}` }} aria-hidden="true" />
          <span>
            <strong>IQA {aqi}</strong>
            <small>Qualidade do ar onde as pessoas moram: {band.label.toLowerCase()}</small>
          </span>
        </span>
        <span className="more-stat">
          <StageRing progress={stageProgress(city.progress)} />
          <span>
            <strong>{city.progress.stageName}</strong>
            <small>{city.progress.next ? `Próximo: ${city.progress.next.name}` : 'Estágio máximo'}</small>
          </span>
        </span>
      </div>

      <details className="more-section">
        <summary>What the city wants</summary>
        <DemandList demand={city.demand} why={city.demandWhy} />
      </details>
      <details className="more-section">
        <summary>Next stage</summary>
        <div className="more-stage">
          <StageDetails progress={city.progress} />
        </div>
      </details>

      <h3 className="more-heading">Map views</h3>
      <div className="more-grid">
        <Toggle on={happinessView} glyph={faceGlyph(0.7)} label="Happiness" onClick={view(() => game?.setHappinessView(!happinessView))} />
        <Toggle
          on={airView}
          glyph={<circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.8" />}
          label="Air quality"
          onClick={view(() => game?.setAirView(!airView))}
        />
        <Toggle on={trafficView} glyph={CAR} label="Traffic" onClick={view(() => game?.setTrafficView(!trafficView))} />
        {minimapOptional && <Toggle on={minimap} glyph={MAP_GLYPH} label="Minimap" onClick={view(() => setMinimap(!minimap))} />}
      </div>

      <h3 className="more-heading">Look</h3>
      <div className="more-row">
        <div className="more-seg" role="radiogroup" aria-label="Day and night">
          {DAY_NIGHT_OPTIONS.map((o) => (
            <button key={o.mode} type="button" role="radio" aria-checked={dayNight === o.mode} className={dayNight === o.mode ? 'is-on' : ''} onClick={() => game?.setDayNight(o.mode)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="more-row">
        <button type="button" className="more-button" onClick={() => game?.rotate(-1)} aria-label="Rotate view left">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {ROTATE_LEFT}
          </svg>
          Turn left
        </button>
        <button type="button" className="more-button" onClick={() => game?.rotate(1)} aria-label="Rotate view right">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {ROTATE_RIGHT}
          </svg>
          Turn right
        </button>
        <button type="button" className={`more-button ${muted ? '' : 'is-on'}`} aria-pressed={!muted} onClick={() => game?.setMuted(!muted)}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {speakerGlyph(muted)}
          </svg>
          {muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>

      <h3 className="more-heading">Game</h3>
      <div className="more-row">
        <button type="button" className="more-button" onClick={startTour}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {HELP}
          </svg>
          Tour the basics
        </button>
        <button
          type="button"
          className="more-button"
          onClick={() => {
            onClose();
            onNewCity();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {CITIES}
          </svg>
          Your cities
        </button>
      </div>
      <div className="more-account">
        <AccountButton inline beforeLogout={beforeLogout} />
      </div>
    </div>
  );
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
