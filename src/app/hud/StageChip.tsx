import { useAtomValue } from 'jotai';
import { useRef } from 'react';
import type { CityInfo } from '../../game/events';
import { useDismiss, useOverlay } from '../overlay/overlay';
import { cityAtom } from '../atoms';

/** How far the city is toward its next stage: its weakest requirement (the slowest gate). */
export function stageProgress(p: CityInfo['progress']): number {
  const reqs = p.next?.requirements ?? [];
  return reqs.length === 0 ? 1 : Math.min(...reqs.map((r) => r.have));
}

/** A small ring filled to `progress`, in the current text colour. */
export function StageRing({ progress }: { progress: number }) {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.4" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={`${circumference * progress} ${circumference}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

/**
 * The city's stage in the top bar (docs/specs/evolution.md, E0): its name and a ring for
 * progress toward the next stage. Click it for the checklist of what the next stage needs,
 * so the player always knows what to build next, and residents by lifestyle.
 */
export function StageChip() {
  const city = useAtomValue(cityAtom);
  const { open, toggle, close } = useOverlay('stage');
  const wrap = useRef<HTMLSpanElement>(null);
  useDismiss(wrap, open, close);
  if (!city) return null;
  const p = city.progress;
  return (
    <span className="stage-wrap" ref={wrap}>
      <button
        type="button"
        className={`stage-chip ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={p.next ? `${p.stageName} · next: ${p.next.name}` : p.stageName}
        onClick={toggle}
      >
        <StageRing progress={stageProgress(p)} />
        <span className="stat-value">{p.stageName}</span>
      </button>
      {open && (
        <span className="panel stage-menu" role="dialog" aria-label="City stage">
          <StageDetails progress={p} />
        </span>
      )}
    </span>
  );
}

/** What the next stage needs, research, and residents by lifestyle (the stage menu, and the phone sheet). */
export function StageDetails({ progress: p }: { progress: CityInfo['progress'] }) {
  const reqs = p.next?.requirements ?? [];
  const [basic, comfortable, prosperous] = p.residents;
  const residents = basic + comfortable + prosperous;
  const share = (n: number) => (residents === 0 ? 0 : Math.round((n / residents) * 100));
  return (
    <>
      <strong className="stage-menu-title">{p.stageName}</strong>
      {p.next ? (
        <>
          <span className="stage-menu-sub">
            {p.locked ? `To become a ${p.next.name}, the city needs:` : `Next: ${p.next.name} (this city has every building unlocked)`}
          </span>
          <ul className="stage-reqs">
            {(p.locked ? reqs : reqs.slice(0, 1)).map((q) => (
              <li key={q.label} className={q.met ? 'is-met' : ''}>
                <span className="stage-req-label">
                  <span aria-hidden="true">{q.met ? '✓' : '○'}</span> {q.label}
                </span>
                <span className="stage-req-detail">{q.detail}</span>
                <span className="meter">
                  <span className="meter-fill" style={{ width: `${Math.round(q.have * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span className="stage-menu-sub">The highest stage. Congratulations, mayor!</span>
      )}
      {p.research && (
        <span className="stage-life">
          <span>Research · {p.research.rate.toFixed(1)} points a day</span>
          {p.research.current ? (
            <>
              <span className="stage-req-label">
                {p.research.current.name}: {p.research.current.points} / {p.research.current.needed}
              </span>
              <span className="meter">
                <span className="meter-fill" style={{ width: `${Math.round((p.research.current.points / p.research.current.needed) * 100)}%` }} />
              </span>
              <span className="stage-life-legend">{p.research.current.effect}</span>
            </>
          ) : (
            <span className="stage-life-legend">Every project is finished.</span>
          )}
          {p.research.done.length > 0 && <span className="stage-life-legend">Done: {p.research.done.join(' · ')}</span>}
        </span>
      )}
      {residents > 0 && (
        <span className="stage-life">
          <span>Lifestyle</span>
          <span className="stage-life-bar" aria-label={`Basic ${share(basic)}%, Comfortable ${share(comfortable)}%, Prosperous ${share(prosperous)}%`}>
            <i className="tier-0" style={{ width: `${share(basic)}%` }} />
            <i className="tier-1" style={{ width: `${share(comfortable)}%` }} />
            <i className="tier-2" style={{ width: `${share(prosperous)}%` }} />
          </span>
          <span className="stage-life-legend">
            Basic {share(basic)}% · Comfortable {share(comfortable)}% · Prosperous {share(prosperous)}%
          </span>
        </span>
      )}
    </>
  );
}
