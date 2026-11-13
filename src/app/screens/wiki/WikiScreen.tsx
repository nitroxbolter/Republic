import { useMemo, useState } from 'react';
import { BALANCE } from '../../../shared/balance';
import { BUILDING_IDS, BUILDINGS, Lifestyle, type BuildingDef, type BuildingId } from '../../../sim/buildings/catalog';
import { BASE_COSTS, COST_KINDS, defaultCostTaxRates, livingCosts, type CostKind, type CostTaxRates } from '../../../sim/systems/livingCosts';
import { STAGES, unlockStage } from '../../../sim/stages';
import { appPath } from '../../basePath';
import { BuildingThumb } from './BuildingThumb';

type Tab = 'guia' | 'catalogo' | 'economia' | 'situacoes';
type Filter = 'moradias' | 'lojas' | 'escritorios' | 'industria' | 'servicos' | 'infraestrutura' | 'transporte' | 'parques' | 'todos';

const tabs: readonly { id: Tab; label: string }[] = [
  { id: 'guia', label: 'Como jogar' }, { id: 'catalogo', label: 'Construções' },
  { id: 'economia', label: 'Salários e impostos' }, { id: 'situacoes', label: 'E se faltar…?' },
];
const filters: readonly { id: Filter; label: string }[] = [
  { id: 'moradias', label: 'Moradias' }, { id: 'lojas', label: 'Lojas' },
  { id: 'escritorios', label: 'Escritórios' }, { id: 'industria', label: 'Indústria' },
  { id: 'servicos', label: 'Serviços' }, { id: 'infraestrutura', label: 'Infraestrutura' },
  { id: 'transporte', label: 'Transporte' }, { id: 'parques', label: 'Parques e outros' },
  { id: 'todos', label: 'Todos' },
];
const money = (n: number) => `$${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
const number = (n: number) => n.toLocaleString('pt-BR');
const homeIds = Object.keys(BALANCE.propertyRent) as (keyof typeof BALANCE.propertyRent)[];
const taxLabels: Record<CostKind, string> = { energy: 'Energia', water: 'Água', housing: 'Moradia', transport: 'Transporte' };

function group(id: BuildingId): Filter {
  const d = BUILDINGS[id];
  if (d.category === 'residential') return 'moradias';
  if (d.category === 'industrial') return 'industria';
  if (d.category === 'commercial') return d.density === 'high' ? 'escritorios' : 'lojas';
  if (d.group === 'services') return 'servicos';
  if (d.group === 'utilities') return 'infraestrutura';
  if (d.group === 'transport') return 'transporte';
  return 'parques';
}

function Guide({ navigate }: { navigate: (tab: Tab) => void }) {
  return <div className="wiki-section">
    <div className="wiki-intro"><p className="wiki-kicker">GUIA RÁPIDO</p><h2>Da primeira via à cidade viva</h2><p>O prefeito define zonas, serviços e políticas. Moradores e empresas ocupam os edifícios conforme acesso, infraestrutura, renda e satisfação.</p></div>
    <div className="wiki-steps">
      {[
        ['01', 'Trace vias e zonas', 'Pinte moradias, apartamentos, lojas, escritórios ou indústria perto de uma via. Os edifícios de zona surgem automaticamente quando há procura, licença e materiais.'],
        ['02', 'Ligue água e energia', 'Usinas e torres de água atendem edifícios dentro da rede e da capacidade. Uma residência sem abastecimento não recebe moradores.'],
        ['03', 'Cuide da cidade', 'Delegacias, bombeiros, clínicas, escolas, hospitais, parques e transporte ajudam a satisfação. Alertas e a inspeção do terreno explicam o que falta.'],
        ['04', 'Ajuste o orçamento', 'Empresas pagam imposto sobre faturamento. Trabalhadores pagam imposto de renda; moradores pagam contas e taxas. O custo de vida altera o poder de compra.'],
      ].map(([n, title, body]) => <article className="wiki-step" key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></article>)}
    </div>
    <div className="wiki-callout"><strong>Construir não exige empregos disponíveis.</strong><p>Casas, apartamentos e escritórios podem iniciar obras sem vagas ou trabalhadores. A ocupação e a economia ainda reagem ao emprego, à procura e à infraestrutura. Moradias prontas ou em construção contam para a oferta e evitam obras sem fim.</p><button type="button" onClick={() => navigate('situacoes')}>Explorar consequências →</button></div>
    <h3 className="wiki-subtitle">Perguntas frequentes</h3>
    <div className="wiki-faq">
      <details><summary>Quem trabalha e quem recebe aposentadoria?</summary><p>{Math.round(BALANCE.workforceShare * 100)}% dos moradores são adultos em idade de trabalhar e os demais {Math.round((1 - BALANCE.workforceShare) * 100)}% são idosos. Só adultos empregados recebem salário e pagam imposto de renda. Idosos não trabalham e recebem aposentadoria mensal do governo.</p></details>
      <details><summary>Por que um terreno marcado não constrói?</summary><p>Verifique acesso à via, demanda da zona, materiais, limite mensal de licenças e se já existe modelo elegível para a densidade. Toque no terreno ou veja as dicas da barra de demanda para encontrar o motivo atual.</p></details>
      <details><summary>O que muda quando a cidade cresce?</summary><p>Novos estágios liberam serviços e desafios. Na Vila surgem exigências de escola e lixo. Em Cidade pequena, hospitais passam a afetar a imigração e a mortalidade. Edifícios maiores exigem ocupação, satisfação, utilidades e serviços.</p></details>
      <details><summary>O aluguel sai mesmo do salário?</summary><p>Sim. O aluguel mensal do edifício é dividido entre seus ocupantes e cobrado do salário dos empregados ou da aposentadoria dos idosos, junto com as outras contas. Se a renda acabar, a arrecadação efetiva fica abaixo da cobrança prevista e o imóvel pode acumular dívida.</p></details>
      <details><summary>Quando a insatisfação vira abandono?</summary><p>Empregos escassos, falta de compras ou serviços, trânsito, poluição e contas altas reduzem a satisfação. A ocupação diminui; se a baixa satisfação persistir por {BALANCE.abandonDays} dias, o edifício pode ser abandonado. Melhorar as condições permite recuperação gradual.</p></details>
    </div>
  </div>;
}

function Catalog() {
  const [filter, setFilter] = useState<Filter>('moradias');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => BUILDING_IDS.filter((id) => {
    const d = BUILDINGS[id];
    return (filter === 'todos' || group(id) === filter) && `${d.name} ${d.description}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'));
  }), [filter, query]);
  return <div className="wiki-section">
    <div className="wiki-intro"><p className="wiki-kicker">CATÁLOGO DO JOGO</p><h2>Estruturas e capacidades</h2><p>As miniaturas vêm do mesmo desenho usado no mapa. Moradias mostram capacidade de moradores; negócios e serviços mostram vagas de trabalho.</p></div>
    <div className="wiki-catalog-tools"><label className="wiki-search"><span>Buscar estrutura</span><input type="search" placeholder="Ex.: torre, escola, água…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="wiki-filters" aria-label="Filtrar construções">{filters.map((f) => <button type="button" key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}</div></div>
    <p className="wiki-count">{visible.length} {visible.length === 1 ? 'estrutura encontrada' : 'estruturas encontradas'}</p>
    <div className="wiki-building-grid">{visible.map((id) => {
      const d: BuildingDef = BUILDINGS[id];
      const rent = BALANCE.propertyRent[id as keyof typeof BALANCE.propertyRent];
      return <article className="wiki-building" key={id}>
        <div className="wiki-building-head"><div className="wiki-thumb"><BuildingThumb id={id} size={94} /></div><div><span className="wiki-building-type">{filters.find((f) => f.id === group(id))?.label}</span><h3>{d.name}</h3><span className="wiki-building-stage">{d.zone ? `Zona ${d.zone} · ${d.density === 'high' ? 'alta' : 'baixa'} densidade · nível ${d.level}` : `Desbloqueio: ${STAGES[unlockStage(id)].name}`}</span></div></div>
        <p>{d.description}</p>
        <div className="wiki-building-facts">{d.capacity > 0 && <span><strong>{number(d.capacity)}</strong> {d.category === 'residential' ? 'moradores' : 'vagas'}</span>}<span><strong>{d.size.w}×{d.size.h}</strong> terreno</span>{d.zone === null && <span><strong>{money(d.cost)}</strong> construção</span>}{rent !== undefined && <span><strong>{money(rent)}</strong> aluguel do edifício/mês</span>}{d.upkeep !== undefined && <span><strong>{money(d.upkeep)}</strong> manutenção base/mês</span>}{d.radius !== undefined && <span><strong>{d.radius}</strong> quadrados de alcance</span>}{d.supplies?.power && <span><strong>{number(d.supplies.power)}</strong> energia</span>}{d.supplies?.water && <span><strong>{number(d.supplies.water)}</strong> água</span>}</div>
      </article>;
    })}</div>
    {visible.length === 0 && <p className="wiki-empty">Nenhuma estrutura corresponde à busca. Experimente outro nome ou categoria.</p>}
    <p className="wiki-note">O custo de colocação de prédios públicos aparece no jogo. A manutenção mostrada é a base: serviços também variam com os moradores atendidos. A capacidade indica o máximo, não a ocupação atual.</p>
  </div>;
}

function Slider({ label, value, max, onChange, format }: { label: string; value: number; max: number; onChange: (value: number) => void; format?: (value: number) => string }) {
  return <label className="wiki-slider"><span>{label}<strong>{format ? format(value) : `${value}%`}</strong></span><input type="range" min="0" max={max} step="1" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function Economy() {
  const [home, setHome] = useState<(typeof homeIds)[number]>('walkup');
  const [occupants, setOccupants] = useState<number>(BUILDINGS.walkup.capacity);
  const [classTier, setClassTier] = useState<Lifestyle>(Lifestyle.Basic);
  const [incomeKind, setIncomeKind] = useState<'worker' | 'senior' | 'unemployed'>('worker');
  const [wage, setWage] = useState<number>(BALANCE.defaultMinimumWage);
  const [pension, setPension] = useState<number>(BALANCE.defaultPensionPerSenior);
  const [incomeTax, setIncomeTax] = useState(0);
  const [companyTax, setCompanyTax] = useState<number>(BALANCE.baseTaxRate);
  const [rates, setRates] = useState<CostTaxRates>(defaultCostTaxRates);
  const capacity = BUILDINGS[home].capacity;
  const count = Math.max(1, Math.min(capacity, occupants));
  const rent = BALANCE.propertyRent[home] / count;
  const gross = incomeKind === 'worker' ? wage * BALANCE.lifestyleWage[classTier] : incomeKind === 'senior' ? pension : 0;
  const wageTax = incomeKind === 'worker' ? gross * incomeTax / 100 : 0;
  const bills = { ...BASE_COSTS, housing: rent };
  const result = livingCosts(gross - wageTax, rates, undefined, bills);
  const changeRate = (kind: CostKind, value: number) => setRates((current) => ({ ...current, [kind]: value }));
  return <div className="wiki-section">
    <div className="wiki-intro"><p className="wiki-kicker">SIMULADOR POR PESSOA</p><h2>Para onde vai a renda?</h2><p>Mude o edifício, a ocupação e as alíquotas para ver o efeito no orçamento de um morador. A cobrança real é limitada pela renda disponível.</p></div>
    <div className="wiki-economy-grid"><div className="wiki-controls">
      <label className="wiki-select">Moradia<select value={home} onChange={(e) => { const id = e.target.value as typeof home; setHome(id); setOccupants(BUILDINGS[id].capacity); }}>{homeIds.map((id) => <option key={id} value={id}>{BUILDINGS[id].name}</option>)}</select></label>
      <div className="wiki-home-preview"><BuildingThumb id={home} size={76} /><div><strong>{BUILDINGS[home].name}</strong><span>Aluguel do edifício: {money(BALANCE.propertyRent[home])}/mês</span><span>Capacidade: {number(capacity)} pessoas</span></div></div>
      <Slider label="Moradores no edifício" value={count} max={capacity} onChange={(v) => setOccupants(Math.max(1, v))} format={(v) => `${v} / ${capacity}`} />
      <div className="wiki-choice" aria-label="Origem da renda">{([['worker', 'Empregado'], ['senior', 'Aposentado'], ['unemployed', 'Sem emprego']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={incomeKind === id} onClick={() => setIncomeKind(id)}>{label}</button>)}</div>
      {incomeKind === 'worker' && <><label className="wiki-select">Classe social<select value={classTier} onChange={(e) => setClassTier(Number(e.target.value) as Lifestyle)}><option value={Lifestyle.Basic}>Baixa · salário base</option><option value={Lifestyle.Comfortable}>Média · ×{BALANCE.lifestyleWage[Lifestyle.Comfortable]}</option><option value={Lifestyle.Prosperous}>Alta · ×{BALANCE.lifestyleWage[Lifestyle.Prosperous]}</option></select></label><Slider label="Salário base" value={wage} max={BALANCE.maxMinimumWage} onChange={setWage} format={money} /><Slider label="Imposto de renda" value={incomeTax} max={100} onChange={setIncomeTax} /></>}
      {incomeKind === 'senior' && <Slider label="Aposentadoria" value={pension} max={BALANCE.maxPensionPerSenior} onChange={setPension} format={money} />}
      <div className="wiki-tax-controls"><strong>Taxas das contas dos moradores</strong>{COST_KINDS.map((kind) => <Slider key={kind} label={taxLabels[kind]} value={rates[kind]} max={100} onChange={(v) => changeRate(kind, v)} />)}</div>
      <Slider label="Imposto sobre empresas" value={companyTax} max={100} onChange={setCompanyTax} />
    </div><div className="wiki-calculation">
      <h3>Resumo mensal por pessoa</h3>
      <div className="wiki-calc-line"><span>Renda bruta</span><strong>{money(gross)}</strong></div>
      <div className="wiki-calc-line"><span>Imposto de renda</span><strong>−{money(wageTax)}</strong></div>
      <div className="wiki-calc-line"><span>Aluguel ({number(count)} ocupantes)</span><strong>−{money(rent)}</strong></div>
      <div className="wiki-calc-line"><span>Energia · referência</span><strong>−{money(bills.energy)}</strong></div>
      <div className="wiki-calc-line"><span>Água · referência</span><strong>−{money(bills.water)}</strong></div>
      <div className="wiki-calc-line"><span>Alimentação importada</span><strong>−{money(bills.food)}</strong></div>
      <div className="wiki-calc-line"><span>Transporte</span><strong>−{money(bills.transport)}</strong></div>
      <div className="wiki-calc-line"><span>Taxas das contas previstas</span><strong>−{money(result.categoryTax)}</strong></div>
      <div className="wiki-calc-line is-total"><span>Dinheiro restante</span><strong>{money(result.disposable)}</strong></div>
      {result.shortfall > 0 && <p className="wiki-warning">Faltam {money(result.shortfall)} para pagar tudo. O pagamento efetivo é limitado pela renda; o imóvel pode acumular perdas.</p>}
      <div className="wiki-calc-line"><span>Exemplo: imposto sobre {money(1_000)} de faturamento empresarial</span><strong>{money(1_000 * companyTax / 100)}</strong></div>
      <p className="wiki-note">O imposto empresarial de {companyTax}% incide no faturamento dos negócios e afeta atividade, empregos e poder de compra. Ele não é descontado diretamente deste salário.</p>
      <p className="wiki-note">A conta real de energia e água varia por edifício, ocupação, padrão de vida e abastecimento. Este exemplo usa {money(BASE_COSTS.energy)} e {money(BASE_COSTS.water)} como referência e não inclui subsídio ou financiamento.</p>
    </div></div>
    <div className="wiki-summary-grid"><article><strong>{Math.round(BALANCE.workforceShare * 100)}%</strong><span>adultos em idade de trabalhar</span></article><article><strong>{Math.round((1 - BALANCE.workforceShare) * 100)}%</strong><span>idosos aposentados</span></article><article><strong>{money(BALANCE.foodBill)}</strong><span>alimentação importada por pessoa</span></article><article><strong>{money(BALANCE.transportBill)}</strong><span>transporte básico por pessoa</span></article></div>
  </div>;
}

const situations = [
  { id: 'jobs', title: 'Sem empregos', result: 'Moradias e escritórios ainda podem ser construídos. A falta de vagas reduz em até 10% a ocupação residencial; adultos desempregados não recebem salário no orçamento, e o comércio perde poder de compra. Moradores podem reclamar de trabalho.', action: 'Abra negócios e serviços, mas mantenha moradias e infraestrutura para receber futuros trabalhadores.' },
  { id: 'homes', title: 'Sem moradias vagas', result: 'Não há lugar para novos moradores. A imigração e os nascimentos precisam de espaço; empresas podem ficar sem trabalhadores e os serviços perdem usuários.', action: 'Zoneie casas ou apartamentos perto de vias e com energia e água. A procura por obras considera também as moradias já em construção.' },
  { id: 'shops', title: 'Sem lojas', result: 'Os moradores têm menos opções de compra e podem reclamar. O gasto local e a arrecadação empresarial ficam menores. Lojas sem clientes ou sem trabalhadores também podem parar de crescer.', action: 'Marque zonas comerciais de baixa densidade próximas aos bairros e acompanhe a dica de demanda do terreno.' },
  { id: 'hospital', title: 'Sem hospitais', result: 'A partir do estágio Cidade pequena, a imigração acompanha a cobertura hospitalar. Com cobertura zero, novas chegadas param e a mortalidade natural dos idosos aumenta gradualmente. Clínicas continuam ajudando com doenças.', action: 'Construa hospitais com alcance sobre as moradias e mantenha acesso viário. Antes de Cidade pequena, hospital não é requisito migratório.' },
  { id: 'utilities', title: 'Sem água ou energia', result: 'Residências sem abastecimento não recebem moradores e empresas não conseguem manter atividade normal. A conta da utilidade indisponível não é cobrada daquela moradia.', action: 'Confira capacidade, alcance, conexão com vias e manutenção das usinas e torres.' },
  { id: 'taxes', title: 'Impostos extremos', result: 'Impostos empresariais, de renda ou das contas muito altos diminuem o poder de compra. No extremo, novas chegadas podem parar. A política não remove moradores imediatamente.', action: 'Compare arrecadação com custo de vida e satisfação no orçamento. Reduza gradualmente as alíquotas que estão pressionando os moradores.' },
  { id: 'mood', title: 'Insatisfação prolongada', result: `Falta de empregos, lojas, serviços ou transporte, poluição e contas altas reduzem a felicidade. Moradias enchem menos; após ${BALANCE.abandonDays} dias de baixa satisfação, edifícios podem ser abandonados.`, action: 'Inspecione edifícios e alertas para achar a necessidade mais fraca. Melhorias permitem recuperação gradual.' },
] as const;

function Situations() {
  const [chosen, setChosen] = useState<(typeof situations)[number]['id']>('jobs');
  const current = situations.find((item) => item.id === chosen)!;
  return <div className="wiki-section"><div className="wiki-intro"><p className="wiki-kicker">ENTENDA AS CONSEQUÊNCIAS</p><h2>E se faltar alguma coisa?</h2><p>Selecione uma situação para ver o que muda e como responder no jogo.</p></div><div className="wiki-situations"><div className="wiki-situation-list">{situations.map((item) => <button type="button" key={item.id} aria-pressed={chosen === item.id} onClick={() => setChosen(item.id)}>{item.title}<span>→</span></button>)}</div><article className="wiki-situation-detail" aria-live="polite"><span className="wiki-kicker">SITUAÇÃO</span><h3>{current.title}</h3><h4>O que acontece</h4><p>{current.result}</p><h4>O que fazer</h4><p>{current.action}</p></article></div></div>;
}

export function WikiScreen() {
  const [tab, setTab] = useState<Tab>('guia');
  return <div className="wiki-page"><header className="wiki-header"><a className="wiki-brand" href={appPath()}>Republica <span>Wiki</span></a><a className="wiki-back" href={appPath()}>← Voltar ao início</a></header><main className="wiki-main"><div className="wiki-title"><span>MANUAL DO PREFEITO</span><h1>Entenda sua cidade.</h1><p>Consulte construções, experimente impostos e descubra por que moradores e empresas crescem — ou param.</p></div><nav className="wiki-tabs" aria-label="Seções da Wiki">{tabs.map((item) => <button type="button" key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>{tab === 'guia' && <Guide navigate={setTab} />}{tab === 'catalogo' && <Catalog />}{tab === 'economia' && <Economy />}{tab === 'situacoes' && <Situations />}</main><footer className="wiki-footer">Os valores vêm do balanceamento atual do jogo. Consulte a inspeção de cada edifício para os dados específicos da sua cidade.</footer></div>;
}
