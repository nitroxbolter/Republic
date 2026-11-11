import { useAtomValue } from 'jotai';
import { useRef } from 'react';
import type { UtilityTotals } from '../../sim/systems/utilities';
import { BALANCE } from '../../shared/balance';
import type { BudgetReport } from '../../sim/systems/budget';
import { budgetAtom, gameAtom } from '../atoms';
import { SLIM_BAR, useMedia } from '../mobile/useMedia';
import { useDismiss, useOverlay } from '../overlay/overlay';
import { Sheet } from './Sheet';
import { EnergyMix } from './EnergyMix';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString()}`;

function Lines({ r }: { r: BudgetReport }) {
  const rows: [string, number][] = [
    ['Roads', r.breakdown.roads],
    ['Services', r.breakdown.services],
    ['Utilities', r.breakdown.utilities],
    ['Parks & civic', r.breakdown.parks],
  ];
  return (
    <div className="budget-lines">
      <div className="budget-line income">
        <span>Taxes</span>
        <strong>+{money(r.income)}</strong>
      </div>
      {rows.map(([label, v]) => (
        <div key={label} className="budget-line">
          <span>{label}</span>
          <span>−{money(v)}</span>
        </div>
      ))}
      <div className={`budget-line total ${r.net >= 0 ? 'gain' : 'loss'}`}>
        <span>Net per month</span>
        <strong>
          {r.net >= 0 ? '+' : ''}
          {money(r.net)}
        </strong>
      </div>
    </div>
  );
}

function Supply({ label, t }: { label: string; t: UtilityTotals }) {
  const pct = t.supply === 0 ? (t.demand > 0 ? 100 : 0) : Math.min(100, Math.round((t.demand / t.supply) * 100));
  const short = t.demand > t.supply;
  return (
    <div className="supply">
      <div className="budget-line">
        <span>{label}</span>
        <span className={short ? 'warn' : ''}>
          {t.demand.toLocaleString()} used of {t.supply.toLocaleString()}
          {t.short > 0 ? ` · ${t.short} without` : ''}
        </span>
      </div>
      <div className="meter">
        <div className={`meter-fill ${short ? 'is-short' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Opened from the funds in the top bar: tax rate, monthly budget and utility supply. A panel
 * under the top bar on wide screens (Escape closes it; the map stays usable around it), a
 * bottom sheet on phones.
 */
export function BudgetPanel() {
  const { open, close } = useOverlay('budget');
  const phone = useMedia(SLIM_BAR);
  const info = useAtomValue(budgetAtom);
  if (!open || !info) return null;
  return phone ? (
    <Sheet label="City budget" onClose={close}>
      <BudgetBody onClose={close} />
    </Sheet>
  ) : (
    <WideBudget onClose={close} />
  );
}

function WideBudget({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  // Escape only: the panel stays while the player looks around the map.
  useDismiss(ref, true, onClose, { outside: false });
  return (
    <aside ref={ref} className="panel budget-panel" aria-label="City budget">
      <BudgetBody onClose={onClose} />
    </aside>
  );
}

function BudgetBody({ onClose }: { onClose: () => void }) {
  const info = useAtomValue(budgetAtom);
  const game = useAtomValue(gameAtom);
  if (!info) return null;
  return (
    <>
      <header className="info-header">
        <h2 className="info-title">Budget</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {info.taxes && (
        <div className="tax-chest">
          <span className="budget-line">
            <span>Taxes waiting at the Town Hall</span>
            <strong>{money(info.taxes.waiting)}</strong>
          </span>
          {info.taxes.hasTownHall ? (
            <button type="button" className="primary-button" disabled={info.taxes.waiting <= 0} onClick={() => game?.collectTaxes()}>
              Collect taxes
            </button>
          ) : (
            <span className="tax-hint">Build a Town Hall (Civic → Parks & Places) to collect them.</span>
          )}
          <span className="tax-hint">Taxes arrive at the end of each month. The chest holds six months; collect before it overflows.</span>
        </div>
      )}

      <label className="tax">
        <span className="budget-line">
          <span>Tax rate</span>
          <strong>{info.taxRate}%</strong>
        </span>
        <input
          type="range"
          min={0}
          max={BALANCE.maxTaxRate}
          step={1}
          value={info.taxRate}
          onChange={(e) => game?.setTaxRate(Number(e.target.value))}
        />
        <span className="tax-hint">Higher taxes earn more but slow the city's growth.</span>
      </label>

      <h3 className="budget-heading">Next month (forecast)</h3>
      <Lines r={info.forecast} />
      {info.last && (
        <p className="tax-hint">
          Last month: {info.last.net >= 0 ? '+' : ''}
          {money(info.last.net)}
        </p>
      )}

      {info.materials && (
        <>
          <h3 className="budget-heading">Construction materials</h3>
          <div className="budget-line">
            <span>In stock</span>
            <strong>
              {Math.round(info.materials.stock).toLocaleString()} / {info.materials.storage.toLocaleString()} t
            </strong>
          </div>
          <div className="budget-line dim">
            <span>Today: made · imported · used</span>
            <span>
              {info.materials.made.toFixed(1)} · {info.materials.imported.toFixed(1)} · {info.materials.used.toFixed(1)} t
            </span>
          </div>
          {info.materials.waiting > 0 && <span className="tax-hint warn-text">{info.materials.waiting} construction{info.materials.waiting === 1 ? '' : 's'} waiting for materials: industry makes them.</span>}
          <span className="tax-hint">Every new building and upgrade needs materials. Industry makes them; imports cover a little a day at $25/t; warehouses add storage.</span>
        </>
      )}

      <h3 className="budget-heading">Utilities</h3>
      <EnergyMix power={info.power} hour={info.hour} />
      <Supply label="💧 Water" t={info.water} />
    </>
  );
}
