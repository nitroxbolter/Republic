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
  const costs: [string, number][] = [
    ['Vias', r.breakdown.roads],
    ['Transporte público e trilhos', r.breakdown.transport],
    ['Serviços', r.breakdown.services],
    ['Infraestrutura', r.breakdown.utilities],
    ['Parques e outros prédios públicos', r.breakdown.parks],
    ['Aposentadorias', r.breakdown.pensions],
  ];
  return (
    <div className="budget-card budget-lines">
      <h4 className="budget-heading">Arrecadação</h4>
      <div className="budget-line income"><span>Imposto sobre empresas</span><strong>+{money(r.businessTaxRevenue)}</strong></div>
      <div className="budget-line income"><span>Imposto de renda</span><strong>+{money(r.incomeTaxRevenue)}</strong></div>
      <div className="budget-line income"><span>Impostos das contas dos habitantes</span><strong>+{money(r.residentTaxRevenue - r.incomeTaxRevenue)}</strong></div>
      <div className="budget-line income"><span>Contas de energia e água</span><strong>+{money(r.utilityRevenue)}</strong></div>
      {r.recycling > 0 && <div className="budget-line income"><span>Reciclagem</span><strong>+{money(r.recycling)}</strong></div>}
      <div className="budget-line total income"><span>Arrecadação total</span><strong>+{money(r.income)}</strong></div>

      <h4 className="budget-heading">Custos</h4>
      {costs.map(([label, v]) => (
        <div key={label} className="budget-line">
          <span>{label}</span>
          <span>−{money(v)}</span>
        </div>
      ))}
      <div className="budget-line total"><span>Custo total</span><strong>−{money(r.expenses)}</strong></div>
      <div className={`budget-line total ${r.net >= 0 ? 'gain' : 'loss'}`}>
        <span>Arrecadação − custo = resultado previsto</span>
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
  const incomeTaxPerWorker = info.minimumWage * info.incomeTaxRate / 100;
  const worker = livingCosts(info.minimumWage - incomeTaxPerWorker, info.costTaxRates);
  const senior = livingCosts(info.pensionPerSenior, info.costTaxRates);
  const pensionGap = info.forecast.incomeTaxRevenue - info.forecast.breakdown.pensions;
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
        <div className="budget-line dim"><span>Faturamento bruto estimado</span><strong>{money(info.forecast.businessTurnover)}/mês</strong></div>
        <div className="budget-line income"><span>Imposto previsto das empresas</span><strong>{money(info.forecast.businessTaxRevenue)}/mês</strong></div>
        <div className="budget-line total"><span>Faturamento estimado após imposto</span><strong>{money(info.forecast.businessTurnoverAfterTax)}/mês</strong></div>
        <p className="tax-hint">O valor após imposto acompanha a alíquota. As vendas brutas dependem da atividade e do poder de compra; impostos altos também reduzem empregos.</p>
      </div>

      <h3 className="budget-heading">Salários e aposentadorias</h3>
      <div className="budget-card">
        <div className="budget-line"><span>Adultos em idade de trabalhar (87%)</span><strong>{info.forecast.workers.toLocaleString('pt-BR')}</strong></div>
        <div className="budget-line"><span>Empregados</span><strong>{info.forecast.employed.toLocaleString('pt-BR')}</strong></div>
        <div className="budget-line"><span>Desempregados</span><strong>{info.forecast.unemployed.toLocaleString('pt-BR')}</strong></div>
        <div className="budget-line dim"><span>Afastados por doença ou prisão</span><strong>{info.forecast.unavailable.toLocaleString('pt-BR')}</strong></div>
        <div className="budget-line"><span>Idosos (13%)</span><strong>{info.forecast.seniors.toLocaleString('pt-BR')}</strong></div>
        <label className="tax">
          <span className="budget-line"><span>Salário mínimo mensal</span><strong>{money(info.minimumWage)}</strong></span>
          <input type="range" min={BALANCE.minMinimumWage} max={BALANCE.maxMinimumWage} step={10}
            value={info.minimumWage} onChange={(e) => game?.setMinimumWage(Number(e.target.value))} />
        </label>
        <label className="tax">
          <span className="budget-line"><span>Imposto de renda sobre salários</span><strong>{info.incomeTaxRate}% · −{money(incomeTaxPerWorker)}</strong></span>
          <input type="range" min={0} max={100} step={1} value={info.incomeTaxRate}
            aria-label="Imposto de renda sobre salários" onChange={(e) => game?.setIncomeTaxRate(Number(e.target.value))} />
        </label>
        <p className="tax-hint">Descontado do salário bruto dos empregados. Desempregados, afastados e aposentados não pagam imposto de renda.</p>
        <label className="tax">
          <span className="budget-line"><span>Aposentadoria por idoso</span><strong>{money(info.pensionPerSenior)}/mês</strong></span>
          <input type="range" min={BALANCE.minPensionPerSenior} max={BALANCE.maxPensionPerSenior} step={1}
            value={info.pensionPerSenior} onChange={(e) => game?.setPensionPerSenior(Number(e.target.value))} />
        </label>
        <div className="budget-line dim"><span>Total de aposentadorias</span><strong>{money(info.forecast.breakdown.pensions)}/mês</strong></div>
        <div className="budget-line income"><span>Imposto de renda arrecadado</span><strong>{money(info.forecast.incomeTaxRevenue)}/mês</strong></div>
        <div className={`budget-line total ${pensionGap >= 0 ? 'gain' : 'loss'}`}><span>Imposto de renda − aposentadorias</span><strong>{money(pensionGap)}/mês</strong></div>
        <p className="tax-hint">Comparação para planejar a previdência; a arrecadação entra no caixa geral da cidade.</p>
      </div>

      <h3 className="budget-heading">Descontos mensais dos habitantes</h3>
      <div className="budget-card">
        <div className="budget-line"><span>Alimentação importada · valor fixo</span><strong>{money(BASE_COSTS.food)}</strong></div>
        {COST_KINDS.map((kind) => {
          const tax = BASE_COSTS[kind] * info.costTaxRates[kind] / 100;
          const balance = info.forecast.costBalances[kind];
          return <label className="tax budget-tax-item" key={kind}>
            <span className="budget-line"><span>{costLabels[kind]} · conta {money(BASE_COSTS[kind])}</span><strong>{info.costTaxRates[kind]}% · −{money(tax)}</strong></span>
            <input type="range" min={0} max={100} step={1} value={info.costTaxRates[kind]}
              aria-label={`Imposto sobre ${costLabels[kind]}`} onChange={(e) => game?.setCostTaxRate(kind, Number(e.target.value))} />
            <span className="tax-hint">Total da conta: {money(BASE_COSTS[kind] + tax)}/mês por pessoa</span>
            <span className={`tax-hint ${balance.net < 0 ? 'warn-text' : ''}`}>Governo: arrecada {money(balance.revenue)}, custa {money(balance.upkeep)}, saldo {money(balance.net)}/mês.</span>
          </label>;
        })}
        <div className="budget-line total"><span>Custo básico por pessoa</span><strong>{money(worker.base)}/mês</strong></div>
        <div className="budget-line"><span>Impostos das contas por pessoa</span><strong>{money(worker.categoryTax)}/mês</strong></div>
      </div>

      <h3 className="budget-heading">Resultado mensal de cada conta</h3>
      <div className="budget-card">
        {COST_KINDS.map((kind) => {
          const b = info.forecast.costBalances[kind];
          const publicBill = kind === 'energy' || kind === 'water';
          return <details className="budget-category-balance" key={kind} open={publicBill}>
            <summary className={`budget-line ${b.net >= 0 ? 'income' : ''}`}>
              <strong>{costLabels[kind]}</strong><strong>{b.net >= 0 ? '+' : ''}{money(b.net)}/mês</strong>
            </summary>
            <div className="budget-line dim"><span>Moradores cobrados</span><strong>{b.residents.toLocaleString('pt-BR')}</strong></div>
            <div className="budget-line dim"><span>{b.residents.toLocaleString('pt-BR')} × {money(b.billPerResident)} de conta base</span><strong>{money(b.nominalBase)}</strong></div>
            <div className="budget-line dim"><span>Taxa prevista de {b.taxRate}%</span><strong>{money(b.nominalTax)}</strong></div>
            {publicBill ? <div className="budget-line income"><span>Conta base recebida</span><strong>+{money(b.baseRevenue)}</strong></div>
              : <p className="tax-hint">A conta base é paga a terceiros; não entra na receita do governo.</p>}
            <div className="budget-line income"><span>Taxa efetivamente recebida</span><strong>+{money(b.taxRevenue)}</strong></div>
            <div className="budget-line"><span>Arrecadação do governo</span><strong>{money(b.revenue)}</strong></div>
            <div className="budget-line"><span>Manutenção pública</span><strong>−{money(b.upkeep)}</strong></div>
            {b.residents > 0 && b.upkeep > 0 && <div className="budget-line dim"><span>Custo por morador cobrado</span><strong>{money(b.upkeep / b.residents)}</strong></div>}
            <div className={`budget-line total ${b.net >= 0 ? 'gain' : 'loss'}`}><span>Arrecadação − manutenção</span><strong>{money(b.net)}</strong></div>
            {(b.taxRevenue < b.nominalTax - 1 || (publicBill && b.revenue < b.nominalBase + b.nominalTax - 1))
              ? <p className="tax-hint warn-text">A arrecadação ficou abaixo da cobrança nominal por renda insuficiente.</p> : null}
          </details>;
        })}
        <p className="tax-hint">Alimentação importada: {money(BASE_COSTS.food)} por morador; sem imposto ou receita pública. Energia e água só são cobradas de moradias abastecidas.</p>
      </div>

      <div className="budget-card budget-income-cards">
        <div><span>Após descontos do salário</span><strong>{money(worker.disposable)}/mês</strong></div>
        <div><span>Após descontos da aposentadoria</span><strong>{money(senior.disposable)}/mês</strong></div>
        {(worker.shortfall > 0 || senior.shortfall > 0) && <p className="tax-hint warn-text">Renda insuficiente: faltam {money(worker.shortfall)} por trabalhador e {money(senior.shortfall)} por idoso. A arrecadação é limitada ao valor que podem pagar.</p>}
      </div>

      <div className="budget-card budget-tax-totals">
        <strong>Impostos totais previstos por mês</strong>
        <div className="budget-line"><span>Empresas</span><strong>{money(info.forecast.businessTaxRevenue)}</strong></div>
        <div className="budget-line"><span>Renda dos trabalhadores</span><strong>{money(info.forecast.incomeTaxRevenue)}</strong></div>
        <div className="budget-line"><span>Contas dos habitantes</span><strong>{money(info.forecast.residentTaxRevenue - info.forecast.incomeTaxRevenue)}</strong></div>
        <div className="budget-line total"><span>Total dos habitantes</span><strong>{money(info.forecast.residentTaxRevenue)}</strong></div>
      </div>

      <h3 className="budget-heading">Próximo mês (previsão)</h3>
      <Lines r={info.forecast} />
      <p className="tax-hint">A manutenção de energia e água já aparece nos saldos por conta acima. Outras infraestruturas continuam no resultado geral.</p>
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
