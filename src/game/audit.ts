import { BALANCE } from '../shared/balance';
import { BUILDINGS, BUILDING_IDS, type BuildingId } from '../sim/buildings/catalog';
import type { City } from '../sim/City';
import type { Simulation } from '../sim/core/Simulation';
import type { DayOutcome } from '../sim/core/System';
import { cityStats } from '../sim/systems/population';
import { demographics, societyReport, workingAge } from '../sim/systems/society';
import type { BudgetReport } from '../sim/systems/budget';
import type { HeldTaxes } from '../sim/systems/budget';
import type { ZoneDiagnostics } from '../sim/systems/growth';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const money = (value: number) => `$${Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '0'}`;
const number = (value: number) => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '0';
const percent = (value: number) => `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

function date(city: City) {
  const d = city.date;
  return `${MONTHS[d.month]} ${d.dayOfMonth}, ano ${d.year} ${gameTime(city)} (dia simulado ${city.day})`;
}

function gameTime(city: City) {
  const hour = ((city.hour % 24) + 24) % 24;
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function closedMonthDate(city: City) {
  const day = Math.max(0, city.day - 1);
  const monthNumber = Math.floor(day / BALANCE.daysPerMonth);
  const year = 1 + Math.floor(monthNumber / 12);
  const month = monthNumber % 12;
  const dayOfMonth = 1 + (day % BALANCE.daysPerMonth);
  return `${MONTHS[month]} ${dayOfMonth}, ano ${year} ${gameTime(city)} (fechamento do dia simulado ${city.day})`;
}

function populationMood(city: City, sim: Simulation) {
  const stats = cityStats(city.world, city.taxRate, city.society, city);
  const society = societyReport(city);
  const availableWorkers = workingAge(stats.population, society.sick, society.prisoners);
  return {
    population: stats.population,
    jobs: stats.jobs,
    employed: Math.min(availableWorkers, stats.workers),
    unemployed: Math.max(0, availableWorkers - stats.workers),
    adults: society.adults,
    seniors: society.seniors,
    sick: society.sick,
    prisoners: society.prisoners,
    deaths: city.society.deaths,
    recentDeaths: city.society.recentDeaths,
    happiness: sim.needs.report.happiness,
    abandoned: sim.needs.report.abandoned,
    complaints: sim.needs.report.complaints.map((c) => `${c.kind}: ${c.count}`).join(', ') || 'nenhuma',
  };
}

function buildingInventory(city: City) {
  const counts = new Map<BuildingId, { total: number; finished: number; construction: number; occupants: number }>();
  for (const b of city.world.buildings.values()) {
    const row = counts.get(b.def) ?? { total: 0, finished: 0, construction: 0, occupants: 0 };
    row.total++;
    if (b.construction > 0) row.construction++;
    else row.finished++;
    row.occupants += b.occupants;
    counts.set(b.def, row);
  }
  return BUILDING_IDS.filter((id) => counts.has(id)).map((id) => {
    const row = counts.get(id)!;
    return `${BUILDINGS[id].name}: ${row.total} (prontos ${row.finished}, em obra ${row.construction}, ocupantes/trabalhadores ${row.occupants})`;
  });
}

function buildingDetails(city: City) {
  const rows = [...city.world.buildings.values()].sort((a, b) => a.id - b.id).map((b) => {
    const def = BUILDINGS[b.def];
    const loan = b.property?.loan ? `; financiamento ${money(b.property.loan.balance)} restante, atraso ${money(b.property.loan.late)}` : '';
    const propertyDebt = b.property?.debt ? `; dívida imobiliária ${money(b.property.debt)}` : '';
    return `ID ${b.id} | ${def.name} (${b.def}) | posição ${b.x},${b.y} | ${b.construction > 0 ? `em construção (${b.construction} dia(s))` : 'concluído'} | ocupação ${b.occupants}/${def.capacity} | acesso à via ${b.entrance >= 0 ? 'sim' : 'não'} | energia ${b.powered ? 'sim' : 'não'} | água ${b.watered ? 'sim' : 'não'} | satisfação ${percent(b.happiness)} | abandonado ${b.abandoned ? 'sim' : 'não'}${propertyDebt}${loan}`;
  });
  return rows.length ? rows : ['Nenhum prédio construído.'];
}

function debtSummary(city: City) {
  const bankDebt = city.bank.loans.reduce((sum, loan) => sum + loan.balance, 0);
  let propertyDebt = 0;
  for (const b of city.world.buildings.values()) if (b.property?.loan) propertyDebt += b.property.loan.balance + b.property.loan.late + b.property.loan.lateInterest;
  return { bankDebt, propertyDebt, total: bankDebt + propertyDebt };
}

function grossPayroll(city: City, employed: number, adults: number) {
  if (adults <= 0 || employed <= 0) return 0;
  const share = Math.min(1, employed / adults);
  let residents = 0, total = 0;
  for (const b of city.world.buildings.values()) {
    if (BUILDINGS[b.def].category !== 'residential' || b.construction > 0) continue;
    const occupants = b.abandoned ? 0 : b.occupants;
    const seniors = demographics(residents + occupants).seniors - demographics(residents).seniors;
    const workers = Math.max(0, occupants - seniors);
    total += workers * share * city.minimumWage * BALANCE.lifestyleWage[b.lifestyle];
    residents += occupants;
  }
  return Math.round(total);
}

function diagnosticLines(diagnostics: ZoneDiagnostics, sim: Simulation) {
  const labels = { r: 'Residencial', c: 'Lojas', o: 'Escritórios', i: 'Indústria' } as const;
  const reasons = { noRoad: 'sem acesso a via', noDemand: 'sem demanda', materials: 'sem materiais', noModel: 'sem edifício elegível', permitLimit: 'limite mensal de licenças', queued: 'aguardando fila' } as const;
  const out: string[] = [];
  const explanation = sim.growth.explainWithDiagnostics(diagnostics);
  for (const key of ['r', 'c', 'o', 'i'] as const) {
    const counts = diagnostics[key];
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (total === 0) continue;
    const parts = Object.entries(reasons).filter(([reason]) => counts[reason as keyof typeof counts] > 0).map(([reason, label]) => `${label}: ${counts[reason as keyof typeof counts]}`);
    out.push(`${labels[key]}: ${total} terreno(s) aguardando (${parts.join('; ')}). ${explanation[key]}`);
  }
  return out.length ? out : ['Nenhum terreno zonificado aguardando construção.'];
}

function reportLines(city: City, sim: Simulation, report: BudgetReport, heading: string, closing?: { openingFunds: number; held: HeldTaxes | null }, timestamp = date(city)) {
  const pop = populationMood(city, sim);
  const age = demographics(pop.population);
  const d = city.demography;
  const power = sim.utilities.report.power;
  const water = sim.utilities.report.water;
  const commute = sim.commute.report;
  const debt = debtSummary(city);
  const lines = [
    '',
    `===== ${heading} · ${timestamp} =====`,
    `População: ${pop.population} (adultos ${age.adults}, idosos ${age.seniors}); empregos/vagas: ${pop.jobs}; empregados: ${report.employed}; desempregados: ${report.unemployed}; afastados: ${report.unavailable}.`,
    `Satisfação média: ${percent(pop.happiness)}; imóveis abandonados: ${pop.abandoned}; doentes: ${pop.sick}; presos: ${pop.prisoners}; mortes acumuladas: ${pop.deaths} (recentes: ${pop.recentDeaths}).`,
    `Reclamações mais frequentes: ${pop.complaints}.`,
    `Caixa público: ${money(city.funds)}; dívidas bancárias: ${money(debt.bankDebt)}; dívidas imobiliárias: ${money(debt.propertyDebt)}; dívida total: ${money(debt.total)}.`,
    `Políticas: imposto de empresas ${report.taxRate}%; imposto de renda ${report.incomeTaxRate}%; salário mínimo ${money(city.minimumWage)}/mês; aposentadoria ${money(city.pensionPerSenior)}/idoso/mês; estratégia demográfica ${d.strategy}; meta anual ${d.annualTarget}%; incentivos ${d.incentivesEnabled ? 'ativos' : 'suspensos'}; subsídio habitacional ${percent(d.housingSubsidy)}.`,
    `Movimento demográfico do período: imigração ${d.lastImmigration}; emigração ${d.lastEmigration}; nascimentos ${d.lastBirths}; mortes ${d.lastDeaths}.`,
    `Energia: capacidade ${number(power.supply)}, demanda ${number(power.demand)}, déficit de prédios ${power.short}, armazenado ${number(power.stored)}/${number(power.storage)}; fontes: ${Object.entries(power.sources).map(([kind, amount]) => `${kind} ${number(amount)}`).join(', ')}.`,
    `Água: capacidade ${number(water.supply)}, demanda ${number(water.demand)}, prédios sem abastecimento ${water.short}.`,
    `Transporte: ${commute.commuters} deslocamentos/dia, ônibus ${commute.busRiders}, trem ${commute.trainRiders}, duração média ${number(commute.avgMinutes)} min, trechos congestionados ${commute.jammedTiles}; linhas férreas ${city.world.rail.reduce((sum, rail) => sum + (rail ? 1 : 0), 0)} tiles.`,
    `Arrecadação mensal calculada: empresas ${money(report.businessTaxRevenue)}; renda ${money(report.incomeTaxRevenue)}; contas dos moradores ${money(report.residentTaxRevenue - report.incomeTaxRevenue)}; contas base de energia/água ${money(report.utilityRevenue)}; reciclagem ${money(report.recycling)}; imóveis/juros ${money(report.propertyFlows.publicRent + report.propertyFlows.interest)}; juros de aplicações ${money(report.bankFlow.investmentInterest)}; total ${money(report.income)}.`,
    `Custos mensais calculados: vias ${money(report.breakdown.roads)}; transporte público/trilhos ${money(report.breakdown.transport)}; serviços ${money(report.breakdown.services)}; defesa ${money(report.breakdown.defense)}; soldos ${money(report.breakdown.militaryPayroll)}; infraestrutura ${money(report.breakdown.utilities)}; parques ${money(report.breakdown.parks)}; aposentadorias ${money(report.breakdown.pensions)}; incentivos migratórios ${money(report.breakdown.demographicIncentives)}; subsídios habitacionais ${money(report.breakdown.housingSubsidies)}; apoio à construção ${money(report.breakdown.constructionGrants)}; operação de imóveis públicos ${money(report.propertyFlows.publicOperating)}; juros de empréstimos ${money(report.bankFlow.loanInterest)}; total ${money(report.expenses)}.`,
    `Resultado contábil (receitas − custos): ${money(report.net)}; variação real do caixa no fechamento: ${money(report.cashNet)}.`,
    `Salários: ${report.employed} empregados; mínimo mensal ${money(city.minimumWage)}; folha bruta estimada por classe social ${money(grossPayroll(city, report.employed, report.workers))}; imposto de renda efetivamente arrecadado ${money(report.incomeTaxRevenue)}; aposentados ${report.seniors}; custo pago de aposentadorias ${money(report.breakdown.pensions)}.`,
    'Contas mensais dos moradores (valores efetivamente realizados):',
    ...(['energy', 'water', 'housing', 'transport'] as const).map((kind) => {
      const b = report.costBalances[kind];
      const label = { energy: 'Energia', water: 'Água', housing: 'Moradia/aluguel', transport: 'Transporte' }[kind];
      return `  ${label}: ${b.residents} moradores; base média ${money(b.billPerResident)} por pessoa; taxa ${b.taxRate}%; base recebida ${money(b.baseRevenue)}; taxa recebida ${money(b.taxRevenue)}; arrecadação total ${money(b.revenue)}; manutenção pública ${money(b.upkeep)}; saldo ${money(b.net)}.`;
    }),
    `Descontos/arrecadações dos moradores: imposto de renda ${money(report.incomeTaxRevenue)}; taxas de energia ${money(report.costBalances.energy.taxRevenue)}; água ${money(report.costBalances.water.taxRevenue)}; moradia ${money(report.costBalances.housing.taxRevenue)}; transporte ${money(report.costBalances.transport.taxRevenue)}.`,
    `Materiais de construção: estoque ${number(city.materials)}; feitos ${number(sim.materials.report.made)}; importados ${number(sim.materials.report.imported)}; usados ${number(sim.materials.report.used)}; obras aguardando material hoje ${sim.materials.report.waiting}; gasto com importação hoje ${money(sim.materials.report.importCost)}.`,
    'Prédios por tipo (inclui estruturas em construção):',
    ...(buildingInventory(city).map((line) => `  ${line}`)),
    'Terrenos zonificados vazios e motivos para não crescer:',
    ...diagnosticLines(sim.growth.diagnostics(sim.materials.report.imported), sim).map((line) => `  ${line}`),
  ];
  if (closing) {
    lines.push(
      `Fechamento de caixa: saldo inicial ${money(closing.openingFunds)}; despesas debitadas ${money(report.expenses)}; saldo final ${money(city.funds)}.`,
      city.collectsTaxes
        ? `Arrecadações ficam no cofre da Prefeitura: saldo aguardando ${money(closing.held?.waiting ?? city.uncollected)}; receitas perdidas por limite do cofre ${money(closing.held?.lost ?? 0)}; recolhimento manual ${townHallStatus(city)}.`
        : `Receitas e impostos liquidados automaticamente no caixa: ${money(report.income)}.`,
      `Taxa total reportada no fechamento: empresas ${money(report.businessTaxRevenue)} + habitantes ${money(report.residentTaxRevenue)} = ${money(report.taxRevenue)}.`,
    );
  } else {
    lines.push('Nota: os valores financeiros desta seção são a previsão do mês corrente; os fechamentos efetivos aparecem no histórico mensal abaixo.');
  }
  return lines;
}

function townHallStatus(city: City) {
  return city.uncollected > 0 ? 'receitas ainda não transferidas ao saldo disponível' : 'nenhum valor aguardando';
}

/** Keeps a human-readable, chronological record for export; it starts with the current session. */
export class CityAudit {
  private readonly entries: string[] = [];
  private previous: ReturnType<typeof populationMood>;
  private previousDiagnostics = '';
  private readonly maxEntries = 12_000;

  constructor(private readonly cityName: string, city: City, sim: Simulation) {
    this.previous = populationMood(city, sim);
    this.record(city, 'INÍCIO', `Auditoria iniciada; população ${this.previous.population}, caixa ${money(city.funds)}. O histórico começa nesta sessão/cidade carregada.`);
    this.captureDiagnosticChange(city, sim);
  }

  record(city: City, category: string, description: string, coalesceKey?: string) {
    const prefix = `${date(city)} | ${category}`;
    if (coalesceKey) {
      const last = this.entries[this.entries.length - 1];
      const marker = ` | chave=${coalesceKey} |`;
      if (last?.startsWith(prefix) && last.includes(marker)) {
        this.entries[this.entries.length - 1] = `${prefix} | chave=${coalesceKey} | ${description}`;
        return;
      }
      this.entries.push(`${prefix} | chave=${coalesceKey} | ${description}`);
    } else this.entries.push(`${prefix} | ${description}`);
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  daily(city: City, sim: Simulation, out: DayOutcome) {
    this.observe(city, sim, 'fechamento diário');
    if (out.started.length) {
      const names = out.started.map((id) => city.world.buildings.get(id)).filter((b) => b !== undefined).map((b) => BUILDINGS[b.def].name);
      this.record(city, 'OBRAS INICIADAS', `${out.started.length} obra(s): ${names.join(', ')}.`);
    }
    if (out.completed.length) {
      const names = out.completed.map((id) => city.world.buildings.get(id)).filter((b) => b !== undefined).map((b) => BUILDINGS[b.def].name);
      this.record(city, 'OBRAS CONCLUÍDAS', `${out.completed.length} obra(s): ${names.join(', ')}.`);
    }
    this.captureDiagnosticChange(city, sim);
    if (out.budget) this.monthClose(city, sim, out.budget, sim.budget.held, city.funds - out.budget.cashNet);
  }

  observe(city: City, sim: Simulation, cause: string) {
    const current = populationMood(city, sim);
    if (current.population !== this.previous.population) {
      const delta = current.population - this.previous.population;
      this.record(city, 'POPULAÇÃO', `${delta > 0 ? '+' : ''}${delta} morador(es) após ${cause}: ${this.previous.population} → ${current.population}; adultos ${current.adults}, idosos ${current.seniors}.`);
    }
    if (Math.abs(current.happiness - this.previous.happiness) >= 0.015) {
      const delta = current.happiness - this.previous.happiness;
      this.record(city, 'SATISFAÇÃO', `${delta > 0 ? 'subiu' : 'caiu'} ${percent(Math.abs(delta))} após ${cause}: ${percent(this.previous.happiness)} → ${percent(current.happiness)}. Reclamações: ${current.complaints}.`);
    }
    if (current.unemployed !== this.previous.unemployed) this.record(city, 'EMPREGO', `desempregados ${this.previous.unemployed} → ${current.unemployed}; empregados ${current.employed}; vagas calculadas ${current.jobs}.`);
    if (current.deaths !== this.previous.deaths) this.record(city, 'MORTALIDADE', `${current.deaths - this.previous.deaths} morte(s) neste dia; total acumulado ${current.deaths}.`);
    if (current.abandoned !== this.previous.abandoned) this.record(city, 'ABANDONO', `imóveis abandonados ${this.previous.abandoned} → ${current.abandoned}.`);
    this.previous = current;
  }

  monthClose(city: City, sim: Simulation, report: BudgetReport, held: HeldTaxes | null, openingFunds: number) {
    this.entries.push(...reportLines(city, sim, report, 'FECHAMENTO MENSAL', { openingFunds, held }, closedMonthDate(city)));
    this.trim();
  }

  private captureDiagnosticChange(city: City, sim: Simulation) {
    const diagnostic = sim.growth.diagnostics(sim.materials.report.imported);
    const signature = JSON.stringify(diagnostic);
    if (signature === this.previousDiagnostics) return;
    this.previousDiagnostics = signature;
    for (const line of diagnosticLines(diagnostic, sim)) this.record(city, 'CRESCIMENTO BLOQUEADO', line);
  }

  private trim() {
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  export(city: City, sim: Simulation) {
    const lines = [
      'REPUBLIC · AUDITORIA ECONÔMICA E DEMOGRÁFICA',
      AUDIT_VERSION,
      `Cidade: ${this.cityName}`,
      `Exportado em: ${date(city)}`,
      `Período coberto: desde o início desta sessão ou carregamento da cidade; o histórico anterior não é inventado nem reconstruído.`,
      `Limite do histórico: até ${this.maxEntries.toLocaleString('pt-BR')} registros recentes.`,
      ...reportLines(city, sim, sim.budget.forecast(), 'ESTADO ATUAL / PREVISÃO'),
      '',
      '===== REGISTRO INDIVIDUAL DOS PRÉDIOS NO MOMENTO DA EXPORTAÇÃO =====',
      ...buildingDetails(city),
      '',
      '===== DÍVIDAS BANCÁRIAS ATIVAS =====',
      ...(city.bank.loans.length ? city.bank.loans.map((loan) => `Empréstimo ${loan.id}: saldo ${money(loan.balance)}, parcela ${money(loan.installment)}, prazo restante ${loan.remainingMonths} mês(es), taxa mensal ${(loan.monthlyRate * 100).toLocaleString('pt-BR')}%.`) : ['Nenhum empréstimo bancário ativo.']),
      '',
      '===== HISTÓRICO CRONOLÓGICO =====',
      ...this.entries,
      '',
      'FIM DO LOG',
    ];
    return lines.join('\n');
  }
}

/** Helper for audit notes when the player changes a policy or rate. */
export function formatAuditMoney(value: number) {
  return money(value);
}

export const AUDIT_VERSION = `Republic audit v1 · days/month ${BALANCE.daysPerMonth}`;
