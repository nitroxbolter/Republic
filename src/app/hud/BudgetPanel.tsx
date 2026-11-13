import { useAtomValue } from 'jotai';
import { useRef } from 'react';
import type { UtilityTotals } from '../../sim/systems/utilities';
import { BALANCE } from '../../shared/balance';
import type { BudgetReport } from '../../sim/systems/budget';
import { BASE_COSTS, COST_KINDS, livingCosts, type CostKind } from '../../sim/systems/livingCosts';
import { budgetAtom, gameAtom } from '../atoms';
import { SLIM_BAR, useMedia } from '../mobile/useMedia';
import { useDismiss, useOverlay } from '../overlay/overlay';
import { Sheet } from './Sheet';
import { EnergyMix } from './EnergyMix';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
const costLabels: Record<CostKind, string> = { energy: 'Energia', water: 'Água', housing: 'Moradia / aluguel', transport: 'Transporte' };

function Lines({ r }: { r: BudgetReport }) {
  const rows: [string, number][] = [
    ['Vias', r.breakdown.roads],
    ['Serviços', r.breakdown.services],
    ['Infraestrutura', r.breakdown.utilities],
    ['Parques e serviços públicos', r.breakdown.parks],
    ['Aposentadorias', r.breakdown.pensions],
  ];
  return (
    <div className="budget-lines">
      <div className="budget-line income">
        <span>Imposto sobre empresas</span>
        <strong>+{money(r.businessTaxRevenue)}</strong>
      </div>
      <div className="budget-line income"><span>Impostos dos habitantes</span><strong>+{money(r.residentTaxRevenue)}</strong></div>
      <div className="budget-line income"><span>Contas de energia e água</span><strong>+{money(r.utilityRevenue)}</strong></div>
      {r.recycling > 0 && <div className="budget-line income"><span>Reciclagem</span><strong>+{money(r.recycling)}</strong></div>}
      {rows.map(([label, v]) => (
        <div key={label} className="budget-line">
          <span>{label}</span>
          <span>−{money(v)}</span>
        </div>
      ))}
      <div className={`budget-line total ${r.net >= 0 ? 'gain' : 'loss'}`}>
        <span>Resultado mensal</span>
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
          {t.short > 0 ? ` · ${t.short} sem abastecimento` : ''}
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
    <Sheet label="Orçamento da cidade" onClose={close}>
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
    <aside ref={ref} className="panel budget-panel" aria-label="Orçamento da cidade">
      <BudgetBody onClose={onClose} />
    </aside>
  );
}

function BudgetBody({ onClose }: { onClose: () => void }) {
  const info = useAtomValue(budgetAtom);
  const game = useAtomValue(gameAtom);
  if (!info) return null;
  const worker = livingCosts(info.minimumWage, info.costTaxRates);
  const senior = livingCosts(info.pensionPerSenior, info.costTaxRates);
  return (
    <>
      <header className="info-header">
        <h2 className="info-title">Orçamento e políticas</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {info.taxes && (
        <div className="tax-chest">
          <span className="budget-line">
            <span>Receitas aguardando na Prefeitura</span>
            <strong>{money(info.taxes.waiting)}</strong>
          </span>
          {info.taxes.hasTownHall ? (
            <button type="button" className="primary-button" disabled={info.taxes.waiting <= 0} onClick={() => game?.collectTaxes()}>
              Recolher receitas
            </button>
          ) : (
            <span className="tax-hint">Construa uma Prefeitura para recolher as receitas.</span>
          )}
          <span className="tax-hint">As receitas chegam no fim do mês. O cofre comporta seis meses.</span>
        </div>
      )}

      <h3 className="budget-heading">Imposto sobre empresas</h3>
      <div className="budget-card">
        <label className="tax">
          <span className="budget-line"><span>Alíquota geral</span><strong>{info.taxRate}%</strong></span>
          <input type="range" min={BALANCE.minTaxRate} max={BALANCE.maxTaxRate} step={1}
            value={info.taxRate} aria-label="Imposto sobre empresas" onChange={(e) => game?.setTaxRate(Number(e.target.value))} />
        </label>
        <div className="budget-line dim"><span>Faturamento estimado</span><strong>{money(info.forecast.businessTurnover)}/mês</strong></div>
        <div className="budget-line income"><span>Imposto previsto das empresas</span><strong>{money(info.forecast.businessTaxRevenue)}/mês</strong></div>
        <p className="tax-hint">Cobrado das lojas, escritórios e indústrias. Alíquotas altas reduzem a atividade, os empregos e o poder de compra.</p>
      </div>

      <h3 className="budget-heading">Salários e aposentadorias</h3>
      <div className="budget-card">
        <div className="budget-line"><span>Trabalhadores (87%)</span><strong>{info.forecast.workers.toLocaleString('pt-BR')}</strong></div>
        <div className="budget-line"><span>Idosos (13%)</span><strong>{info.forecast.seniors.toLocaleString('pt-BR')}</strong></div>
        <label className="tax">
          <span className="budget-line"><span>Salário mínimo mensal</span><strong>{money(info.minimumWage)}</strong></span>
          <input type="range" min={BALANCE.minMinimumWage} max={BALANCE.maxMinimumWage} step={10}
            value={info.minimumWage} onChange={(e) => game?.setMinimumWage(Number(e.target.value))} />
        </label>
        <label className="tax">
          <span className="budget-line"><span>Aposentadoria por idoso</span><strong>{money(info.pensionPerSenior)}/mês</strong></span>
          <input type="range" min={BALANCE.minPensionPerSenior} max={BALANCE.maxPensionPerSenior} step={1}
            value={info.pensionPerSenior} onChange={(e) => game?.setPensionPerSenior(Number(e.target.value))} />
        </label>
        <div className="budget-line dim"><span>Total de aposentadorias</span><strong>{money(info.forecast.breakdown.pensions)}/mês</strong></div>
      </div>

      <h3 className="budget-heading">Descontos mensais dos habitantes</h3>
      <div className="budget-card">
        <div className="budget-line"><span>Alimentação importada · valor fixo</span><strong>{money(BASE_COSTS.food)}</strong></div>
        {COST_KINDS.map((kind) => {
          const tax = BASE_COSTS[kind] * info.costTaxRates[kind] / 100;
          return <label className="tax budget-tax-item" key={kind}>
            <span className="budget-line"><span>{costLabels[kind]} · conta {money(BASE_COSTS[kind])}</span><strong>{info.costTaxRates[kind]}% · −{money(tax)}</strong></span>
            <input type="range" min={0} max={100} step={1} value={info.costTaxRates[kind]}
              aria-label={`Imposto sobre ${costLabels[kind]}`} onChange={(e) => game?.setCostTaxRate(kind, Number(e.target.value))} />
            <span className="tax-hint">Total da conta: {money(BASE_COSTS[kind] + tax)}/mês por pessoa</span>
          </label>;
        })}
        <div className="budget-line total"><span>Custo básico por pessoa</span><strong>{money(worker.base)}/mês</strong></div>
        <div className="budget-line"><span>Impostos por pessoa</span><strong>{money(worker.categoryTax)}/mês</strong></div>
      </div>

      <div className="budget-card budget-income-cards">
        <div><span>Após descontos do salário</span><strong>{money(worker.disposable)}/mês</strong></div>
        <div><span>Após descontos da aposentadoria</span><strong>{money(senior.disposable)}/mês</strong></div>
        {(worker.shortfall > 0 || senior.shortfall > 0) && <p className="tax-hint warn-text">Renda insuficiente: faltam {money(worker.shortfall)} por trabalhador e {money(senior.shortfall)} por idoso. A arrecadação é limitada ao valor que podem pagar.</p>}
      </div>

      <div className="budget-card budget-tax-totals">
        <strong>Impostos totais previstos por mês</strong>
        <div className="budget-line"><span>Empresas</span><strong>{money(info.forecast.businessTaxRevenue)}</strong></div>
        <div className="budget-line"><span>Habitantes</span><strong>{money(info.forecast.residentTaxRevenue)}</strong></div>
      </div>

      <h3 className="budget-heading">Próximo mês (previsão)</h3>
      <Lines r={info.forecast} />
      <div className="budget-line"><span>Saldo da infraestrutura</span><strong>{money(info.forecast.utilityRevenue - info.forecast.breakdown.utilities)}</strong></div>
      <p className="tax-hint">Energia e água geram receita com as contas dos moradores. A manutenção das usinas e torres aparece em infraestrutura.</p>
      {info.last && (
        <p className="tax-hint">
          Mês anterior: {info.last.net >= 0 ? '+' : ''}
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
