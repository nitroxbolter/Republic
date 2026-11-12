import { useAtomValue } from 'jotai';
import { cityAtom, trafficViewAtom } from '../atoms';

const STEPS: readonly [string, string][] = [
  ['#4ade80', 'Livre'],
  ['#facc15', 'Movimentado'],
  ['#fb923c', 'Congestionado'],
  ['#ef4444', 'Parado'],
];

/** Legend and commute summary while the traffic overlay is on. */
export function TrafficLegend() {
  const on = useAtomValue(trafficViewAtom);
  const city = useAtomValue(cityAtom);
  if (!on) return null;
  const t = city?.traffic;
  return (
    <div className="panel traffic-legend" aria-label="Legenda do trânsito">
      <strong className="traffic-title">Trânsito</strong>
      <div className="traffic-steps">
        {STEPS.map(([color, label]) => (
          <span key={label} className="traffic-step">
            <i style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
      {t && (
        <p className="traffic-summary">
          {t.commuters.toLocaleString()} passageiros · média de {Math.round(t.avgMinutes)} min
          {t.jammedTiles > 0 ? ` · ${t.jammedTiles} trechos congestionados` : ' · sem congestionamentos'}
        </p>
      )}
      <p className="traffic-hint">Crie outra rota ou uma rodovia onde as vias ficarem laranjas ou vermelhas.</p>
    </div>
  );
}
