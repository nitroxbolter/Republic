import { useAtomValue } from 'jotai';
import { useRef, useState } from 'react';
import { cityAtom, gameAtom } from '../atoms';
import { SLIM_BAR, useMedia } from '../mobile/useMedia';
import { useDismiss, useOverlay } from '../overlay/overlay';
import { Sheet } from './Sheet';
import type { DemographicStrategy, PermitLimits, PermitZone } from '../../sim/systems/demography';
import { suggestedPermitLimit } from '../../sim/systems/demography';
import { BALANCE } from '../../shared/balance';

const strategyNames: Record<DemographicStrategy, string> = { stimulate: 'Estimular crescimento', balanced: 'Crescimento equilibrado', slow: 'Desacelerar crescimento' };
const zoneNames: Record<PermitZone, string> = { r: 'Moradias', c: 'Lojas', o: 'Escritórios', i: 'Indústrias' };
const money = (n: number) => `$${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;

export function DemographyPanel() {
  const { open, close } = useOverlay('demography');
  const phone = useMedia(SLIM_BAR);
  const ref = useRef<HTMLElement>(null);
  useDismiss(ref, open && !phone, close, { outside: false });
  if (!open) return null;
  return phone ? <Sheet label="Política Demográfica" onClose={close}><Body onClose={close} /></Sheet>
    : <aside ref={ref} className="panel budget-panel" aria-label="Política Demográfica"><Body onClose={close} /></aside>;
}

function Body({ onClose }: { onClose: () => void }) {
  const city = useAtomValue(cityAtom);
  const game = useAtomValue(gameAtom);
  const [selectedLimits, setSelectedLimits] = useState<PermitLimits>(() => ({ ...(city?.demography.permitLimits ?? { r: 9999, c: 9999, o: 9999, i: 9999 }) }));
  if (!city) return null;
  const p = city.demography;
  const measures = p.infrastructure;
  const suggestedLimit = suggestedPermitLimit(measures.score);
  const limitsChanged = (Object.keys(zoneNames) as PermitZone[]).some((zone) => selectedLimits[zone] !== p.permitLimits[zone]);
  const monthly = p.monthImmigration + p.monthEmigration + p.monthBirths + p.monthDeaths > 0;
  const migration = monthly ? [p.monthImmigration, p.monthEmigration, p.monthBirths, p.monthDeaths] : [p.lastImmigration, p.lastEmigration, p.lastBirths, p.lastDeaths];
  const pressureRows: [string, number][] = [['Moradias livres', measures.housing], ['Hospitais', measures.hospital], ['Escolas', measures.school], ['Água', measures.water], ['Energia', measures.energy], ['Segurança', measures.security], ['Transporte', measures.transport], ['Empregos', measures.employment]];
  return <>
    <header className="info-header"><h2 className="info-title">Política Demográfica</h2><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button></header>
    <div className="budget-card">
      <h3 className="budget-heading">Estratégia</h3>
      <div className="info-actions">
        {(Object.keys(strategyNames) as DemographicStrategy[]).map((mode) => <button key={mode} type="button" className={p.strategy === mode ? 'primary-button' : 'secondary-button'} aria-pressed={p.strategy === mode} onClick={() => game?.setDemographicStrategy(mode)}>{strategyNames[mode]}</button>)}
      </div>
      <p className="tax-hint">Os incentivos alteram gradualmente a chegada de novos moradores. A desaceleração não expulsa a população existente.</p>
      <label className="tax"><span className="budget-line"><span>Meta anual indicativa</span><strong>{p.annualTarget.toFixed(1)}%</strong></span><input type="range" min={0} max={10} step={0.5} value={p.annualTarget} onChange={(e) => game?.setAnnualGrowthTarget(Number(e.target.value))} /></label>
      <div className="budget-line"><span>Crescimento anual observado</span><strong>{p.annualGrowth.toFixed(1)}%</strong></div>
      <div className="budget-line"><span>Intensidade atual dos incentivos</span><strong>{Math.round(p.incentiveLevel * 100)}%</strong></div>
      <label className="budget-line"><span>Programas de atração de moradores</span><input type="checkbox" checked={p.incentivesEnabled} onChange={(e) => game?.setMigrationIncentives(e.target.checked)} /></label>
      <label className="tax"><span className="budget-line"><span>Subsídio habitacional</span><strong>{Math.round(p.housingSubsidy * 100)}%</strong></span><input type="range" min={0} max={20} step={1} value={Math.round(p.housingSubsidy * 100)} onChange={(e) => game?.setHousingSubsidy(Number(e.target.value))} /><span className="tax-hint">Incentiva novas moradias mesmo sem demanda normal. Cada obra iniciada recebe um apoio único de até 20% do custo; o desconto no aluguel é pago mensalmente. Ambos saem do caixa no fechamento. Exige terreno, via, materiais e licença.</span></label>
      <div className="budget-line total"><span>Custo estimado dos incentivos</span><strong>{money(p.monthlyCost)}/mês</strong></div>
      <div className="budget-line"><span>Apoio a obras iniciado neste mês</span><strong>{money(p.monthConstructionGrants)}</strong></div>
    </div>
    <div className="budget-card">
      <h3 className="budget-heading">Movimento populacional {monthly ? 'neste mês' : 'no último mês'}</h3>
      <div className="budget-line"><span>Imigração</span><strong>+{migration[0].toLocaleString('pt-BR')}</strong></div>
      <div className="budget-line"><span>Emigração</span><strong>−{migration[1].toLocaleString('pt-BR')}</strong></div>
      <div className="budget-line"><span>Nascimentos</span><strong>+{migration[2].toLocaleString('pt-BR')}</strong></div>
      <div className="budget-line"><span>Mortes</span><strong>−{migration[3].toLocaleString('pt-BR')}</strong></div>
    </div>
    <div className="budget-card">
      <h3 className="budget-heading">Capacidade da infraestrutura</h3>
      {pressureRows.map(([label, value]) => <div key={label}><div className="budget-line"><span>{label}</span><strong>{Math.round(value * 100)}%</strong></div><div className="meter"><div className={`meter-fill ${value < 0.75 ? 'is-short' : ''}`} style={{ width: `${Math.round(value * 100)}%` }} /></div></div>)}
      {measures.alerts.length > 0 ? <p className="tax-hint warn-text">Crescimento sob pressão: {measures.alerts.join('; ')}. Os efeitos sobre satisfação e economia são graduais.</p> : <p className="tax-hint">A infraestrutura acompanha a população.</p>}
    </div>
    <div className="budget-card">
      <h3 className="budget-heading">Licenças e plano de expansão</h3>
      <p className="tax-hint">Escolha quantas novas obras ou melhorias podem começar por zona a cada mês e clique em Aplicar limites. As {BALANCE.constructionDays} jornadas de construção não mudam; o subsídio pode criar demanda residencial, mas via e materiais também precisam estar disponíveis.</p>
      {(Object.keys(zoneNames) as PermitZone[]).map((zone) => <label key={zone} className="budget-line"><span>{zoneNames[zone]} · {p.permitUsed[zone]} usadas{p.permitLimits[zone] < 9999 ? ` · ${Math.max(0, p.permitLimits[zone] - p.permitUsed[zone])} restantes` : ''}</span><select value={selectedLimits[zone]} onChange={(e) => setSelectedLimits((current) => ({ ...current, [zone]: Number(e.target.value) }))}><option value={9999}>Sem limite</option>{[0, 1, 2, 4, 8, 16].map((v) => <option value={v} key={v}>{v} por mês</option>)}</select></label>)}
      <div className="info-actions">
        <button type="button" className="primary-button" disabled={!limitsChanged} onClick={() => game?.setPermitLimits(selectedLimits)}>Aplicar limites escolhidos</button>
        <button type="button" className="secondary-button" onClick={() => setSelectedLimits({ r: suggestedLimit, c: suggestedLimit, o: suggestedLimit, i: suggestedLimit })}>Preencher sugestão: {suggestedLimit}/mês por zona</button>
      </div>
      {limitsChanged && <p className="tax-hint">Seleção pendente. Clique em Aplicar limites escolhidos para confirmar.</p>}
    </div>
  </>;
}
