import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { budgetAtom, cityAtom, gameAtom } from '../atoms';
import type { BudgetInfo, CityInfo } from '../../game/events';
import type { Game } from '../../game/Game';

type AdviceLevel = 'critical' | 'warning' | 'info';
interface Advice {
  key: string;
  level: AdviceLevel;
  title: string;
  problem: string;
  solution: string;
  metric?: string;
}

const levelLabel: Record<AdviceLevel, string> = { critical: 'Urgente', warning: 'Atenção', info: 'Orientação' };
const zoneName = { r: 'moradias', c: 'lojas', o: 'escritórios', i: 'indústrias' } as const;

function makeAdvice(city: CityInfo, budget: BudgetInfo | null, game: Game): Advice[] {
  const advice: Advice[] = [];
  const report = budget?.forecast;
  const rate = budget?.taxRate ?? game.taxRate;
  const housingUse = city.housing > 0 ? city.population / city.housing : 0;

  if (rate >= 95) advice.push({ key: 'company-tax-stop', level: 'critical', title: 'Imposto empresarial quase no máximo', problem: `A alíquota está em ${rate}%. Esse nível reduz fortemente a atividade das empresas e pode interromper a imigração.`, solution: 'Reduza o imposto sobre empresas no painel Orçamento e políticas para recuperar atividade, empregos e poder de compra.', metric: `Poder de compra: ${Math.round(city.economy.purchasingPower * 100)}%` });
  else if (rate >= 35 || city.economy.purchasingPower < 0.65) advice.push({ key: 'company-tax-high', level: 'warning', title: 'Impostos e vendas estão pressionando a economia', problem: `O imposto empresarial está em ${rate}% e o poder de compra está em ${Math.round(city.economy.purchasingPower * 100)}% do nível de referência.`, solution: 'Teste reduzir a alíquota empresarial. Isso pode aumentar as vendas, o emprego e a procura por lojas e escritórios.', metric: `Atividade comercial: ${Math.round(city.economy.commerceActivity * 100)}%` });

  const incomeTaxRate = budget?.incomeTaxRate ?? 0;
  if (incomeTaxRate >= 70) advice.push({ key: 'income-tax', level: incomeTaxRate >= 95 ? 'critical' : 'warning', title: 'Imposto de renda muito alto', problem: `${incomeTaxRate}% é descontado do salário dos trabalhadores e reduz o dinheiro disponível para despesas e consumo.`, solution: 'Reduza a alíquota de imposto de renda no orçamento e compare o poder de compra com a arrecadação para aposentadorias.', metric: `Imposto de renda: ${incomeTaxRate}%` });
  const householdRates = budget?.costTaxRates ?? { energy: 0, water: 0, housing: 0, transport: 0 };
  const highCostTax = (Object.entries(householdRates) as [keyof typeof householdRates, number][]).filter(([, value]) => value >= 70);
  if (highCostTax.length) advice.push({ key: 'resident-bills', level: 'warning', title: 'Contas dos moradores estão muito taxadas', problem: `${highCostTax.map(([kind, value]) => `${kind === 'energy' ? 'energia' : kind === 'water' ? 'água' : kind === 'housing' ? 'moradia' : 'transporte'} ${value}%`).join(', ')}. As taxas reduzem a renda disponível das famílias.`, solution: 'Revise as alíquotas individuais no painel de orçamento. Confira também se a arrecadação dessas contas cobre o custo público correspondente.' });

  const diagnostics = game.sim.growth.diagnostics(game.sim.materials.report.imported);
  const explanations = game.sim.growth.explainWithDiagnostics(diagnostics);
  for (const key of ['r', 'c', 'o', 'i'] as const) {
    const row = diagnostics[key];
    const total = row.noRoad + row.noDemand + row.materials + row.noModel + row.permitLimit + row.queued;
    if (!total) continue;
    const name = zoneName[key];
    const mainReasons = [
      row.noRoad ? `${row.noRoad} sem acesso a uma via` : '',
      row.noDemand ? `${row.noDemand} sem demanda` : '',
      row.materials ? `${row.materials} aguardando materiais` : '',
      row.noModel ? `${row.noModel} sem edifício disponível nesta etapa` : '',
      row.permitLimit ? `${row.permitLimit} bloqueados pelo limite mensal de licenças` : '',
      row.queued ? `${row.queued} aguardando a fila de construção` : '',
    ].filter(Boolean).join('; ');
    const actionable = row.noRoad || row.permitLimit || row.materials || row.noModel;
    const solution = row.noRoad
      ? 'Construa uma via próxima dos terrenos vazios.'
      : row.permitLimit
        ? 'Aumente as licenças dessa zona na Política Demográfica ou aguarde o próximo mês.'
        : row.materials
          ? 'Crie ou amplie zonas industriais e aguarde a produção dos materiais de construção.'
          : row.noModel
            ? 'Avance de etapa ou pesquisa para liberar edifícios desse tipo.'
            : row.noDemand
              ? `Melhore a atratividade e a atividade econômica; confirme se a zona de ${name} corresponde à demanda atual.`
              : 'A construção acontece gradualmente; aguarde os próximos dias do jogo.';
    advice.push({ key: `growth-${key}`, level: actionable ? 'warning' : 'info', title: `${capitalize(name)} não estão avançando`, problem: `${total} terreno(s) alocado(s): ${mainReasons}. ${explanations[key]}`, solution, metric: `Demanda atual: ${Math.round(city.demand[key] * 100)}%` });
  }

  if (city.power.short > 0) advice.push({ key: 'power-shortage', level: 'critical', title: 'Falta energia na cidade', problem: `${city.power.short} edifício(s) estão sem energia; isso impede ocupação e atividade.`, solution: 'Construa uma usina ou fonte de energia e confira a capacidade e o armazenamento no painel de orçamento.', metric: `Déficit atual: ${city.power.short} edifício(s)` });
  if (city.water.short > 0) advice.push({ key: 'water-shortage', level: 'critical', title: 'Falta água na cidade', problem: `${city.water.short} edifício(s) estão sem abastecimento.`, solution: 'Construa ou amplie a captação e o tratamento de água e confira a rede no painel de orçamento.', metric: `Déficit atual: ${city.water.short} edifício(s)` });

  const infra = city.demography.infrastructure;
  for (const [key, value, recommendation] of [
    ['hospital', infra.hospital, 'Construa hospitais para ampliar a cobertura de saúde.'],
    ['school', infra.school, 'Construa escolas para ampliar a cobertura educacional.'],
    ['security', infra.security, 'Amplie a cobertura de delegacias e bombeiros.'],
    ['transport', infra.transport, 'Construa estações e conecte melhor os bairros à rede de transporte.'],
  ] as const) {
    if (value < 0.5 && city.population > 0) advice.push({ key: `infra-${key}`, level: value < 0.2 ? 'critical' : 'warning', title: `Cobertura de ${key === 'hospital' ? 'saúde' : key === 'school' ? 'educação' : key === 'security' ? 'segurança' : 'transporte'} baixa`, problem: `A infraestrutura atende aproximadamente ${Math.round(value * 100)}% da população. A sobrecarga pode piorar satisfação e qualidade de vida.`, solution: recommendation, metric: `${Math.round(value * 100)}% atendida` });
  }
  if (housingUse >= 0.94) advice.push({ key: 'housing-full', level: 'warning', title: 'Poucas moradias disponíveis', problem: `A cidade está usando ${Math.round(housingUse * 100)}% da capacidade residencial.`, solution: 'Zoneie e construa novas moradias ou apartamentos. Confira as vias, licenças e materiais se as obras não começarem.', metric: `${Math.max(0, city.housing - city.population)} vagas residenciais` });
  if (city.unemployed > Math.max(10, city.workers * 0.2)) advice.push({ key: 'unemployment', level: 'warning', title: 'Desemprego elevado', problem: `${city.unemployed.toLocaleString('pt-BR')} trabalhadores estão sem emprego.`, solution: 'Crie zonas comerciais, escritórios e indústrias. Moradias podem crescer sem empregos, mas o desemprego reduz renda, satisfação e consumo.', metric: `${city.jobs.toLocaleString('pt-BR')} empregos · ${city.workers.toLocaleString('pt-BR')} empregados` });
  if (report && report.net < 0) advice.push({ key: 'budget-deficit', level: 'critical', title: 'Previsão mensal negativa', problem: `A previsão aponta déficit de ${money(-report.net)} por mês.`, solution: 'Revise os custos de serviços, obras e aposentadorias; compare cada receita com seu custo no painel Orçamento e políticas.', metric: `Receita ${money(report.income)} · custos ${money(report.expenses)}` });
  else if (report && report.net < Math.max(500, report.expenses * 0.05)) advice.push({ key: 'budget-tight', level: 'warning', title: 'Orçamento com pouca margem', problem: 'A previsão mensal está perto do equilíbrio; uma nova despesa pode deixar o caixa negativo.', solution: 'Confira os custos das instituições e serviços antes de expandi-los e acompanhe a previsão do próximo mês.', metric: `Saldo previsto: ${money(report.net)}/mês` });

  if (!advice.length) advice.push({ key: 'city-healthy', level: 'info', title: 'A cidade está em equilíbrio', problem: 'Não encontrei bloqueios importantes neste momento.', solution: 'Continue acompanhando demanda, infraestrutura e previsão mensal. Se um terreno específico estiver parado, selecione-o para ver o diagnóstico daquele lote.', metric: `População ${city.population.toLocaleString('pt-BR')} · poder de compra ${Math.round(city.economy.purchasingPower * 100)}%` });

  const rank = { critical: 0, warning: 1, info: 2 };
  return advice.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 6);
}

function capitalize(value: string) { return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1); }
function money(value: number) { return `$${Math.round(value).toLocaleString('pt-BR')}`; }

export function CityAssistant() {
  const city = useAtomValue(cityAtom);
  const budget = useAtomValue(budgetAtom);
  const game = useAtomValue(gameAtom);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const advice = useMemo(() => city && game ? makeAdvice(city, budget, game) : [], [city, budget, game]);
  const visible = advice.filter((item) => !hidden.includes(item.key));
  const lead = visible[0];

  if (!city || !game) return null;
  return (
    <aside className={`city-assistant ${open ? 'is-open' : ''}`} aria-label="Assistente da cidade">
      {open && (
        <section className="city-assistant-card panel" aria-labelledby="city-assistant-title">
          <header className="city-assistant-header">
            <span className="assistant-avatar" aria-hidden="true"><AssistantPortrait /></span>
            <div><strong id="city-assistant-title">Lia · Secretária da Cidade</strong><small>{visible.length ? `${visible.length} aviso(s) para acompanhar` : 'Tudo em ordem por enquanto'}</small></div>
            <button className="assistant-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar assistente">×</button>
          </header>
          <div className="city-assistant-list" aria-live="polite">
            {visible.map((item) => (
              <article className={`assistant-advice advice-${item.level}`} key={item.key}>
                <div className="assistant-advice-title"><span className="assistant-status-dot" /><div><small>{levelLabel[item.level]}</small><strong>{item.title}</strong></div><button type="button" className="assistant-dismiss" title="Dispensar aviso" aria-label={`Dispensar: ${item.title}`} onClick={() => setHidden((items) => [...items, item.key])}>×</button></div>
                <p>{item.problem}</p>
                {item.metric && <div className="assistant-metric">{item.metric}</div>}
                <details><summary>O que posso fazer?</summary><p className="assistant-solution">{item.solution}</p></details>
              </article>
            ))}
          </div>
          {hidden.length > 0 && <button className="assistant-show-all" type="button" onClick={() => setHidden([])}>Mostrar todos os avisos</button>}
        </section>
      )}
      <button className={`assistant-bubble ${lead ? `bubble-${lead.level}` : ''}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Recolher assistente da cidade' : 'Abrir assistente da cidade'}>
        <span className="assistant-avatar"><AssistantPortrait /></span>
        {!open && <span className="assistant-bubble-copy"><strong>{lead ? lead.title : 'Lia, sua secretária'}</strong><small>{lead ? 'Toque para ver o problema e a solução' : 'A cidade está sob controle'}</small></span>}
        {!open && visible.length > 0 && <span className="assistant-count">{visible.length}</span>}
        {open && <span className="assistant-bubble-x">−</span>}
      </button>
    </aside>
  );
}

function AssistantPortrait() {
  return <svg viewBox="0 0 40 40" fill="none" role="presentation"><circle cx="20" cy="20" r="20" fill="#45CDBA"/><path d="M8 33c1.8-6.1 5.8-9.2 12-9.2s10.2 3.1 12 9.2" fill="#183448"/><path d="M13.3 16.4c0-6.1 2.8-9.4 6.9-9.4s6.9 3.3 6.9 9.4c0 5-3 8.6-6.9 8.6s-6.9-3.6-6.9-8.6Z" fill="#F2BD9C"/><path d="M12.8 15.5c.2-7 3.3-10.5 8-10.5 4 0 6.3 2.4 6.5 7.1-1.7-.4-3-1.7-3.8-3.2-2.3 2.9-5.9 4.6-10.7 5.1v1.5Z" fill="#473343"/><path d="M17 17.5h.1m5.8 0h.1" stroke="#523D42" strokeWidth="1.6" strokeLinecap="round"/><path d="m18 21.1 2 1 2-1" stroke="#B85B63" strokeWidth="1.3" strokeLinecap="round"/><path d="m17.5 25-2 8m7-8 2 8" stroke="#fff" strokeWidth="1.4"/><path d="M18.5 26.5h3l-1.5 3-1.5-3Z" fill="#F0C94D"/></svg>;
}
