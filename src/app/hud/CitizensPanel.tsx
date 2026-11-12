import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { SMALL_UI } from '../mobile/useMedia';
import type { ComplaintKind } from '../../sim/systems/needs';
import { cityAtom, gameAtom } from '../atoms';

/** A colour per complaint, matching the speech-bubble icons. */
const TONE: Readonly<Record<ComplaintKind, string>> = {
  jobs: '#c08a4f',
  shopping: '#e2574c',
  safety: '#3b6fd8',
  health: '#e23b3b',
  education: '#2f8f5b',
  hospital: '#d23b5a',
  university: '#5b4fc4',
  garbage: '#7d8a3a',
  transit: '#2f7fd6',
  research: '#22b8cf',
  commute: '#f08a24',
  traffic: '#ef6c43',
  air: '#8b9097',
  parks: '#3fa34d',
  affordability: '#d6a84f',
  workers: '#3b6fd8',
  customers: '#e0a514',
  abandoned: '#6f665c',
};

const OPEN_KEY = 'openpolis.citizensOpen';

/** Open or closed, remembered per device; folded by default on phones. */
function initialOpen(): boolean {
  try {
    const saved = localStorage.getItem(OPEN_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // Storage blocked (private mode): fall back to the screen-size default.
  }
  return !window.matchMedia(SMALL_UI).matches;
}

/**
 * "Citizens say…": the city's top complaints and requests, each with a button that shows where.
 * Always on screen as a sticky toggle (user request: it used to vanish whenever the list was
 * momentarily empty), with the complaint count and city happiness in its header.
 */
export function CitizensPanel() {
  const city = useAtomValue(cityAtom);
  const game = useAtomValue(gameAtom);
  const [open, setOpen] = useState(initialOpen);
  if (!city) return null;
  const complaints = city.needs.complaints;
  const total = complaints.reduce((n, c) => n + c.count, 0);
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? '0' : '1');
      } catch {
        // Not remembered this time; the panel still toggles.
      }
      return !o;
    });
  return (
    <aside className={`panel citizens ${open ? 'is-open' : ''}`} aria-label="Os moradores dizem">
      <button type="button" className="citizens-header" aria-expanded={open} onClick={toggle}>
        <span className="citizens-title">Os moradores dizem</span>
        {total > 0 && (
          <span className="citizens-badge" aria-label={`${total} edifícios com reclamações`}>
            {total > 999 ? '999+' : total}
          </span>
        )}
        <span className="citizens-mood">{Math.round(city.needs.happiness * 100)}% felizes</span>
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" style={{ transform: open ? 'none' : 'rotate(-90deg)' }}>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      {open &&
        (complaints.length === 0 ? (
          <p className="citizens-empty">Ninguém está reclamando agora.</p>
        ) : (
          <ul className="citizens-list">
            {complaints.map((c) => (
              <li key={c.kind} className="citizens-item">
                <i style={{ background: TONE[c.kind] }} />
                <span className="citizens-text">
                  “{c.text}”<span className="citizens-count">{c.count}</span>
                  <span className="citizens-stats">
                    {c.stats.map((stat) => (
                      <span key={stat.label}>
                        {stat.label}: {stat.value}
                      </span>
                    ))}
                  </span>
                </span>
                <button type="button" className="citizens-show" onClick={() => game?.focusBuilding(c.building)}>
                  Show me
                </button>
              </li>
            ))}
          </ul>
        ))}
    </aside>
  );
}
