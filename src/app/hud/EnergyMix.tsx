import type { PowerReport } from '../../sim/systems/energy';
import type { EnergySource } from '../../sim/buildings/catalog';

/** Display order, label and colour per source (colours match the meter segments in app.css). */
const SOURCES: readonly { readonly id: Exclude<EnergySource, 'battery'>; readonly label: string }[] = [
  { id: 'coal', label: 'Carvão' },
  { id: 'gas', label: 'Gás' },
  { id: 'wind', label: 'Vento' },
  { id: 'solar', label: 'Solar' },
];

/**
 * The grid this hour (docs/specs/energy.md): a stacked meter of output by source against
 * demand, battery charge, and what's short.
 */
export function EnergyMix({ power, hour }: { power: PowerReport; hour: number }) {
  const fromBattery = Math.max(0, power.sources.battery);
  const charging = Math.max(0, -power.sources.battery);
  const total = SOURCES.reduce((sum, s) => sum + power.sources[s.id], 0) + fromBattery;
  const scale = Math.max(total, power.demand, 1);
  const short = power.short > 0;
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const time = `${String(hour).padStart(2, '0')}:00`;

  return (
    <div className="energy-mix">
      <div className="budget-line">
        <span>⚡ Power at {time}</span>
        <span className={short ? 'warn' : ''}>
          {power.demand.toLocaleString()} needed · {total.toLocaleString()} made
          {short ? ` · ${power.short} sem energia` : ''}
          {power.repair > 0 ? ` · ${power.repair} usina${power.repair === 1 ? '' : 's'} precisa${power.repair === 1 ? '' : 'm'} de reparo` : ''}
        </span>
      </div>
      <div className="energy-meter" role="img" aria-label={`Energia às ${time}: ${total} produzidos, ${power.demand} necessários`}>
        {SOURCES.map((s) =>
          power.sources[s.id] > 0 ? <span key={s.id} className={`energy-seg is-${s.id}`} style={{ width: pct(power.sources[s.id]) }} /> : null,
        )}
        {fromBattery > 0 && <span className="energy-seg is-battery" style={{ width: pct(fromBattery) }} />}
        <span className="energy-demand" style={{ left: pct(power.demand) }} title="Demand now" />
      </div>
      <ul className="energy-legend">
        {SOURCES.filter((s) => power.sources[s.id] > 0).map((s) => (
          <li key={s.id}>
            <i className={`energy-dot is-${s.id}`} />
            {s.label} {power.sources[s.id].toLocaleString()}
          </li>
        ))}
        {power.storage > 0 && (
          <li>
            <i className="energy-dot is-battery" />
            Baterias {Math.round((power.stored / power.storage) * 100)}%{fromBattery > 0 ? ` · fornecendo ${fromBattery}` : charging > 0 ? ` · carregando` : ''}
          </li>
        )}
      </ul>
    </div>
  );
}
