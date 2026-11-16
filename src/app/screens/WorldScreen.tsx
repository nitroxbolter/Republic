import { useEffect, useState } from 'react';
import type { WorldCityMeta } from '../../shared/api';
import { PRESET_IDS, PRESETS } from '../../sim/terrain/presets';
import { api } from '../../save/api';
import { AccountButton } from '../account/AccountButton';
import { appPath } from '../basePath';
import { cityDate, timeAgo } from '../format';

interface WorldScreenProps {
  readonly onBack: () => void;
  readonly onVisit: (id: number) => void;
  readonly notice?: string;
}

export function WorldScreen({ onBack, onVisit, notice }: WorldScreenProps) {
  const [cities, setCities] = useState<readonly WorldCityMeta[] | null>(null);
  const [error, setError] = useState(notice ?? '');

  useEffect(() => {
    let cancelled = false;
    api.listWorldCities().then((result) => {
      if (!cancelled) setCities(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o mundo online.');
    });
    return () => { cancelled = true; };
  }, []);

  return <main className="world-page">
    <header className="world-page-header">
      <div>
        <a className="ng-wiki-link" href={appPath()}>Republic</a>
        <h1>Mundo online</h1>
        <p>Visite cidades que seus prefeitos escolheram compartilhar. Você pode explorar o mapa, mas não alterar a cidade.</p>
      </div>
      <div className="world-page-actions"><AccountButton /><button className="secondary-button" type="button" onClick={onBack}>Voltar às minhas cidades</button></div>
    </header>
    {error && <p className="panel world-error" role="status">{error}</p>}
    <section className="world-city-list" aria-label="Cidades compartilhadas">
      {cities === null ? <div className="panel world-empty">Carregando cidades…</div> : cities.length === 0 ? (
        <div className="panel world-empty"><strong>Ainda não há cidades públicas.</strong><span>Compartilhe sua cidade pelo menu de cidades para aparecer aqui.</span></div>
      ) : cities.map((city) => {
        const preset = PRESETS[PRESET_IDS.find((id) => id === city.preset) ?? 'riverValley'];
        return <article className="panel world-city" key={city.id}>
          <div className="world-city-symbol" aria-hidden="true">🏙️</div>
          <div className="world-city-details">
            <h2>{city.name}</h2>
            <p>{city.population.toLocaleString('pt-BR')} habitantes · Ano {cityDate(city.day)} · {city.size}×{city.size}</p>
            <span>{preset.name} · atualizada {timeAgo(city.updatedAt)}</span>
          </div>
          <button className="ng-start world-visit-button" type="button" onClick={() => onVisit(city.id)}>Visitar cidade</button>
        </article>;
      })}
    </section>
  </main>;
}
