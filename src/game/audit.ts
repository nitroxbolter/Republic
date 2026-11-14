import { BALANCE } from '../shared/balance';
import { BUILDINGS, BUILDING_IDS, Lifestyle, LIFESTYLE_NAMES, type BuildingId } from '../sim/buildings/catalog';
import { ZoneType } from '../sim/zones';
import type { City } from '../sim/City';
import type { Simulation } from '../sim/core/Simulation';
import type { DayOutcome } from '../sim/core/System';
import { cityStats } from '../sim/systems/population';
import { demographics, societyReport } from '../sim/systems/society';
import type { BudgetReport, HeldTaxes } from '../sim/systems/budget';
import { diagnoseVacantLots, growthDemandAudit, type LotDiagnosis, type ZoneDiagnostics } from '../sim/systems/growth';
import { hasUtilities } from '../sim/systems/utilities';
import { effectiveJobs, economyReport } from '../sim/systems/economy';
import { materialsFor } from '../sim/systems/materials';
import { techEffects } from '../sim/research';

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
  const availableWorkers = stats.workforce;
  return {
    population: stats.population,
    jobs: stats.jobs,
    jobBuildings: stats.jobBuildings,
    jobVacancies: stats.jobVacancies,
    vacantJobBuildings: stats.vacantJobBuildings,
    workforce: stats.workforce,
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

type AuditSector = 'comercio' | 'indústria' | 'serviços públicos';
const AUDIT_SECTORS: readonly AuditSector[] = ['comercio', 'indústria', 'serviços públicos'];
interface SectorAuditRow {
  buildings: number;
  construction: number;
  theoreticalCapacity: number;
  activePosts: number;
  staffed: number;
}

function sectorStaffing(city: City): Record<AuditSector, number> {
  const staffed: Record<AuditSector, number> = { comercio: 0, indústria: 0, 'serviços públicos': 0 };
  const economy = economyReport(city.world, city.taxRate, city);
  for (const b of city.world.buildings.values()) {
    const def = BUILDINGS[b.def];
    if (def.category === 'residential' || b.construction > 0 || b.abandoned || b.entrance === -1 || !hasUtilities(b)) continue;
    const sector: AuditSector = def.category === 'industrial' ? 'indústria' : def.category === 'commercial' ? 'comercio' : 'serviços públicos';
    staffed[sector] += Math.min(b.occupants, effectiveJobs(b, economy));
  }
  return staffed;
}

function sectorAuditLines(city: City, report: BudgetReport): string[] {
  const rows: Record<AuditSector, SectorAuditRow> = {
    comercio: { buildings: 0, construction: 0, theoreticalCapacity: 0, activePosts: 0, staffed: 0 },
    indústria: { buildings: 0, construction: 0, theoreticalCapacity: 0, activePosts: 0, staffed: 0 },
    'serviços públicos': { buildings: 0, construction: 0, theoreticalCapacity: 0, activePosts: 0, staffed: 0 },
  };
  const economy = economyReport(city.world, city.taxRate, city);
  for (const b of city.world.buildings.values()) {
    const def = BUILDINGS[b.def];
    if (def.category === 'residential') continue;
    const sector: AuditSector = def.category === 'industrial' ? 'indústria' : def.category === 'commercial' ? 'comercio' : 'serviços públicos';
    const row = rows[sector];
    row.buildings++;
    if (b.construction > 0) { row.construction++; continue; }
    if (b.abandoned) continue;
    row.theoreticalCapacity += def.capacity;
    if (b.entrance === -1 || !hasUtilities(b)) continue;
    const active = effectiveJobs(b, economy);
    row.activePosts += active;
    row.staffed += Math.min(b.occupants, active);
  }
  const totalStaffed = Object.values(rows).reduce((sum, row) => sum + row.staffed, 0);
  const totalWage = grossPayroll(city, report.employed, report.workers);
  const revenue: Record<AuditSector, number> = {
    comercio: economy.commerceRevenue,
    indústria: Math.max(0, economy.businessTurnover - economy.commerceRevenue),
    'serviços públicos': 0,
  };
  return (Object.entries(rows) as [AuditSector, SectorAuditRow][]).map(([name, row]) => {
    const payrollShare = totalStaffed > 0 ? row.staffed / totalStaffed : 0;
    const sectorRevenue = revenue[name];
    const sectorTax = sectorRevenue * city.taxRate / 100;
    const sectorWages = totalWage * payrollShare;
    const wageFactors = Object.values(BALANCE.lifestyleWage);
    const wageRange = `${money(city.minimumWage * Math.min(...wageFactors))}–${money(city.minimumWage * Math.max(...wageFactors))}/mês conforme classe`;
    return `  ${name}: prédios ${row.buildings} (${row.construction} em obra); capacidade teórica ${number(row.theoreticalCapacity)} postos; postos efetivamente ativos ${number(row.activePosts)}; funcionários alocados ${number(row.staffed)}; vagas ativas ${number(Math.max(0, row.activePosts - row.staffed))}; candidatos qualificados/requisitos de escolaridade não modelados (força de trabalho geral ${number(report.workers - report.unavailable)}); vagas financiadas não há caixa por empresa no modelo. Salário segue mínimo de ${money(city.minimumWage)} × multiplicador de classe (faixa ${wageRange}), sem oferta individual por empresa. Receita bruta mensal ${name === 'serviços públicos' ? 'não aplicável' : `${money(sectorRevenue)} estimada`}; imposto empresarial ${name === 'serviços públicos' ? 'não aplicável' : `${money(sectorTax)} estimado`}; folha ${money(sectorWages)} estimada por proporção de empregados; clientes/transações/produtos, custos operacionais, saldo empresarial e lucro não são modelados por empresa/setor.`;
  });
}

function economyFormulaLines(city: City, report: BudgetReport): string[] {
  const e = economyReport(city.world, city.taxRate, city);
  const a = e.audit;
  const purchasingFormula = a.residents > 0
    ? `clamp(${number(a.disposableIncome)} ÷ ${number(a.baselineDisposableIncome)} × ${number(a.companyTaxFactor)} × ${number(a.householdCostFactor)}, 0,10–1,15)`
    : 'fallback de poder de compra por salário mínimo, aposentadoria e contas padrão (não há moradores ativos nas casas servidas)';
  const lines = [
    `Poder de compra (${percent(e.purchasingPower)}): fórmula ${purchasingFormula}; moradores considerados ${number(a.residents)}; renda disponível agregada ${money(a.disposableIncome)}; referência sem impostos ${money(a.baselineDisposableIncome)}; fator empresarial ${number(a.companyTaxFactor)} (alíquota ${city.taxRate}%); fator de custos habitacionais ${number(a.householdCostFactor)}.`,
    `Faturamento comercial estimado: consumo potencial ${money(e.householdSpending)} × cobertura de mercado ${percent(a.marketCoverage)} = ${money(e.commerceRevenue)}; cobertura = min(1, capacidade de lojas ${number(a.shopCapacity)} ÷ demanda-alvo ${number(a.targetShopJobs)}); atividade comercial = clamp(poder de compra × (0,95 + 0,05 × cobertura), 0,10–1) = ${percent(e.commerceActivity)}.`,
    `Faturamento industrial estimado: capacidade ${number(a.industrialCapacity)} × gasto-base ${money(BALANCE.monthlyShopSpendPerResident)} × produção ${percent(e.industrialProduction)} = ${money(Math.max(0, e.businessTurnover - e.commerceRevenue))}; produção = 0,25 + 0,75 × atividade comercial. Faturamento empresarial total ${money(e.businessTurnover)}; imposto geral ${city.taxRate}%; imposto previsto ${money(report.businessTaxRevenue)}.`,
    `Consumo local, clientes, transações e unidades de produto: o modelo usa gasto agregado e cobertura de mercado; não mantém contagem de clientes/transações por empresa ou unidade vendida. Não há saldo bancário individual de empresa.`,
  ];
  if (a.residents === 0) lines.push(`Referência por morador usada quando não há casas servidas: ${money(a.referenceDisposablePerResident)}/mês antes do fator empresarial.`);
  return lines;
}

function householdAuditLines(report: BudgetReport): string[] {
  const labels = [Lifestyle.Basic, Lifestyle.Comfortable, Lifestyle.Prosperous] as const;
  return labels.map((tier) => {
    const row = report.households[tier];
    const average = (value: number) => row.residents > 0 ? value / row.residents : 0;
    const wagePerWorker = row.workers > 0 ? row.grossWages / row.workers : 0;
    const pensionPerSenior = row.seniors > 0 ? row.pensionIncome / row.seniors : 0;
    return `  ${LIFESTYLE_NAMES[tier]}: moradores ${number(row.residents)}, trabalhadores pagos ${number(row.workers)}, aposentados ${number(row.seniors)}; salário bruto médio/trabalhador ${money(wagePerWorker)}, bruto total ${money(row.grossWages)}, IR ${money(row.incomeTax)}, líquido total ${money(row.netWages)}; aposentadoria média/idoso ${money(pensionPerSenior)}, benefícios pagos ${money(row.pensionIncome)}; renda disponível pós-contas ${money(row.disposableIncome)} (${money(average(row.disposableIncome))}/morador); insuficiência de renda ${money(row.shortfall)}. Contas devidas por morador: alimentação ${money(average(row.due.food))}, moradia ${money(average(row.due.housing))}, energia ${money(average(row.due.energy))}, água ${money(average(row.due.water))}, transporte ${money(average(row.due.transport))}, encargos/impostos ${money(average(row.due.surcharge + row.due.serviceTaxes))}; total devido ${money(row.due.total)}; pagamentos realizados no modelo ${money(row.paid.total)}.`;
  });
}

function housingAuditLine(city: City, stats: ReturnType<typeof cityStats>) {
  let occupiedHomes = 0, emptyHomes = 0, constructionHomes = 0, constructionCapacity = 0;
  for (const b of city.world.buildings.values()) {
    if (BUILDINGS[b.def].category !== 'residential' || b.abandoned) continue;
    if (b.construction > 0) { constructionHomes++; constructionCapacity += BUILDINGS[b.def].capacity; }
    else if (b.occupants > 0) occupiedHomes++;
    else emptyHomes++;
  }
  return `Moradia: população ${stats.population}; capacidade concluída ${stats.housing}; vagas residenciais disponíveis ${Math.max(0, stats.housing - stats.population)}; prédios ocupados ${occupiedHomes}; prédios vazios ${emptyHomes}; casas em construção ${constructionHomes} (capacidade reservada ${constructionCapacity}).`;
}

function zoneName(zone: number): string {
  if (zone === ZoneType.Residential) return 'Residencial baixo';
  if (zone === ZoneType.ResidentialHigh) return 'Apartamentos';
  if (zone === ZoneType.Commercial) return 'Lojas';
  if (zone === ZoneType.CommercialHigh) return 'Escritórios';
  if (zone === ZoneType.Industrial) return 'Indústria';
  return `Zona ${zone}`;
}

function lotAuditLine(lot: LotDiagnosis): string {
  const a = lot.audit;
  const materials = `${number(a.availableMaterials)} disponíveis / ${Number.isFinite(a.requiredMaterials) ? number(a.requiredMaterials) : '∞'} necessários`;
  return `Terreno (${lot.x},${lot.y}) | ${zoneName(lot.zone)} | decisão ${lot.reason} (${lot.title}) | demanda ${number(a.demand)}; limite para iniciar > ${number(a.demandThreshold)} | via alcançável ${a.roadAccess ? 'sim' : 'não'} | licenças usadas ${a.permitsUsed}/${a.permitLimit} | materiais ${materials} | modelos elegíveis ${a.eligibleBuildings} | confiança do investidor ${percent(a.investorConfidence)} | ${lot.detail}`;
}

function growthFormulaLines(city: City, sim: Simulation): string[] {
  const x = growthDemandAudit(city.world, city.taxRate, city);
  const floors = x.floors;
  const availableMaterials = city.needsMaterials ? city.materials + Math.max(0, BALANCE.materialsImportPerDay - sim.materials.report.imported) : Infinity;
  return [
    `Intermediários de demanda: moradores ${number(x.population)}; capacidade residencial ${number(x.housing)}; lojas ${number(x.shops)}; escritórios ${number(x.offices)}; indústria ${number(x.industrial)}; capacidade cívica ${number(x.civic)}; empregos estruturalmente abertos ${number(x.openJobs)}; formados ${number(x.graduates)}.`,
    `Procura calculada: moradias ${number(x.wantR)}; lojas ${number(x.wantShops)}; escritórios ${number(x.wantOffices)}; indústria ${number(x.wantI)}. Barras = clamp((procura − oferta) ÷ max(procura, piso), −1, 1); pisos r/c/o/i = ${number(floors.r)}/${number(floors.c)}/${number(floors.o)}/${number(floors.i)}; resultados r/c/o/i = ${number(x.demand.r)}/${number(x.demand.c)}/${number(x.demand.o)}/${number(x.demand.i)}.`,
    `Fórmulas da procura: moradia=(população×folga ${number(BALANCE.housingSlack)}+base ${number(BALANCE.seedHousing)})×atratividade ${number(x.migrationOutlook)}+subsídio habitacional ${number(x.subsidizedHousing)} (intensidade ${percent(x.subsidyStrength)}); lojas=(capacidade residencial×vagas de loja por morador ${number(BALANCE.shopJobsPerResident)}+base ${number(BALANCE.seedCommercialJobs)})×poder de compra ${number(x.purchasingPower)}; escritórios=base ${number(BALANCE.seedOfficeJobs)}+capacidade residencial×empregos por morador ${number(BALANCE.officeJobsPerHousingResident)}×poder de compra+formados×empregos por formado ${number(BALANCE.graduateOfficeJobs)}; indústria=capacidade industrial+empregos estruturalmente abertos×parcela industrial ${number(1 - BALANCE.officeJobShare)}+base ${number(BALANCE.seedIndustrialJobs)}.`,
    `Empregos estruturais abertos = moradias ${number(x.housing)} × participação adulta ${number(BALANCE.workforceShare)} × folga de vagas ${number(BALANCE.jobSlack)} − (lojas ${number(x.shops)} + escritórios ${number(x.offices)} + indústria ${number(x.industrial)} + capacidade cívica ${number(x.civic)}) = ${number(x.openJobs)}. Imposto empresarial ${city.taxRate}% e poder de compra ${percent(x.purchasingPower)} entram na atratividade e procura comercial; o subsídio configurado é ${percent(city.demography.housingSubsidy)}.`,
    `Limites de construção: demanda estritamente maior que 0; via a até ${BALANCE.roadAccessRange} quadrados; licenças usadas e limite abaixo; primeiro modelo elegível disponível; materiais mínimos abaixo do estoque + importação de hoje. O primeiro requisito que falha vira o motivo do terreno.`,
    `Materiais: estoque ${number(city.materials)}; importação aplicada hoje ${number(sim.materials.report.imported)}; disponíveis para iniciar ${number(availableMaterials)}; importação máxima/dia ${number(BALANCE.materialsImportPerDay)}; licenças usadas r/c/o/i ${city.demography.permitUsed.r}/${city.demography.permitUsed.c}/${city.demography.permitUsed.o}/${city.demography.permitUsed.i}; limites ${city.demography.permitLimits.r}/${city.demography.permitLimits.c}/${city.demography.permitLimits.o}/${city.demography.permitLimits.i}.`,
  ];
}

function auditChecks(city: City, report: BudgetReport): string[] {
  const expectedBusinessTax = Math.round(report.businessTurnover * report.taxRate / 100);
  const householdIncomeTax = Object.values(report.households).reduce((sum, row) => sum + row.incomeTax, 0);
  const householdServiceTax = (['energy', 'water', 'housing', 'transport'] as const).reduce((sum, key) => sum + report.costBalances[key].taxRevenue, 0);
  const expectedResidentTax = Math.round(householdIncomeTax) + householdServiceTax;
  const expectedIncome = report.taxRevenue + report.utilityRevenue + report.recycling
    + Math.round(report.propertyFlows.interest + report.propertyFlows.publicRent) + report.bankFlow.investmentInterest;
  const expectedExpenses = Math.round(Object.values(report.breakdown).reduce((sum, value) => sum + value, 0) + report.propertyFlows.publicOperating) + report.bankFlow.loanInterest;
  const checks: string[] = [];
  if (expectedBusinessTax !== report.businessTaxRevenue) checks.push(`imposto empresarial calculado ${money(expectedBusinessTax)} ≠ registrado ${money(report.businessTaxRevenue)}`);
  if (Math.abs(expectedResidentTax - report.residentTaxRevenue) > 1) checks.push(`impostos dos moradores calculados ${money(expectedResidentTax)} ≠ registrados ${money(report.residentTaxRevenue)}`);
  if (Math.abs(expectedIncome - report.income) > 1) checks.push(`receitas por componentes ${money(expectedIncome)} ≠ total registrado ${money(report.income)}`);
  if (Math.abs(expectedExpenses - report.expenses) > 1) checks.push(`despesas por componentes ${money(expectedExpenses)} ≠ total registrado ${money(report.expenses)}`);
  const subsidyBeneficiaries = [...city.world.buildings.values()].filter((b) => BUILDINGS[b.def].category === 'residential' && b.construction === 0 && b.occupants > 0 && !b.property?.publicOwned).reduce((sum, b) => sum + b.occupants, 0);
  if (city.demography.housingSubsidy > 0 && subsidyBeneficiaries === 0) checks.push('subsídio habitacional configurado sem moradores elegíveis; custo/efeito estimado deve ser zero');
  if (city.demography.housingSubsidy > 0 && subsidyBeneficiaries > 0 && report.breakdown.housingSubsidies === 0) checks.push(`${subsidyBeneficiaries} moradores elegíveis ao subsídio, mas nenhum pagamento foi estimado; revisar critérios/valores sem assumir erro`);
  const negatives = [report.businessTaxRevenue, report.residentTaxRevenue, report.incomeTaxRevenue, report.utilityRevenue, report.breakdown.pensions, report.breakdown.housingSubsidies].filter((value) => value < -0.01);
  if (negatives.length) checks.push(`${negatives.length} valor(es) de receita/custo que normalmente não deveriam ser negativos`);
  if (report.jobVacancies > 0 && report.unemployed > 0) checks.push(`${number(report.jobVacancies)} vagas em aberto e ${number(report.unemployed)} desempregados; o modelo não registra qualificação por vaga, orçamento por empresa nem motivo individual de não contratação`);
  if (report.cashLedger && Math.abs(report.cashLedger.fundsDifference) > 0.01) checks.push(`diferença de caixa público ${money(report.cashLedger.fundsDifference)} entre variação esperada e observada`);
  return checks.length ? checks.map((check) => `ALERTA PARA INVESTIGAÇÃO (não confirma bug): ${check}.`) : ['Conciliações aritméticas disponíveis sem divergência acima da tolerância de $1; isso não valida os modelos agregados não conciliáveis.'];
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

function reportLines(city: City, sim: Simulation, report: BudgetReport, heading: string, closing?: { openingFunds: number; held: HeldTaxes | null }, timestamp = date(city), includeLotDetails = true, diagnosticSnapshot?: ZoneDiagnostics) {
  const pop = populationMood(city, sim);
  const stats = cityStats(city.world, city.taxRate, city.society, city);
  const age = demographics(pop.population);
  const d = city.demography;
  const power = sim.utilities.report.power;
  const water = sim.utilities.report.water;
  const commute = sim.commute.report;
  const debt = debtSummary(city);
  const lines = [
    '',
    `===== ${heading} · ${timestamp} =====`,
    `População: ${pop.population} (adultos ${age.adults}, idosos ${age.seniors}); força de trabalho disponível ${pop.workforce}; empregos ativos ${pop.jobs} em ${pop.jobBuildings} prédios; empregados ${report.employed}; vagas abertas ${pop.jobVacancies} em ${pop.vacantJobBuildings} prédios; desempregados ${report.unemployed}; afastados ${report.unavailable}.`,
    housingAuditLine(city, stats),
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
    'Renda e despesas das famílias por classe econômica (estimativas do modelo agregado; despesas pagas respeitam os limites de renda):',
    ...householdAuditLines(report),
    'Atividade econômica e fórmula do poder de compra (estimativas agregadas; sem contas empresariais individuais):',
    ...economyFormulaLines(city, report),
    'Empregos e empresas por setor (prédios são aproximação de empresas; salários proporcionais ao quadro observado):',
    ...sectorAuditLines(city, report),
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
    ...diagnosticLines(diagnosticSnapshot ?? sim.growth.diagnostics(sim.materials.report.imported), sim).map((line) => `  ${line}`),
    'Fórmulas e valores intermediários de demanda/construção:',
    ...growthFormulaLines(city, sim).map((line) => `  ${line}`),
    'Conciliações e alertas automáticos (alertas indicam pontos para investigar, não bugs confirmados):',
    ...auditChecks(city, report).map((line) => `  ${line}`),
  ];
  if (includeLotDetails) {
    const lots = diagnoseVacantLots(city, sim.materials.report.imported);
    lines.push('Diagnóstico numérico dos terrenos zonificados vazios (snapshot; mudanças diárias relevantes no histórico):');
    lines.push(...(lots.length ? lots.map((lot) => `  ${lotAuditLine(lot)}`) : ['  Nenhum terreno zonificado vazio.']));
  }
  if (closing) {
    lines.push(
      `Fechamento de caixa: saldo inicial ${money(closing.openingFunds)}; despesas debitadas ${money(report.expenses)}; saldo final ${money(city.funds)}.`,
      city.collectsTaxes
        ? `Arrecadações ficam no cofre da Prefeitura: saldo aguardando ${money(closing.held?.waiting ?? city.uncollected)}; receitas perdidas por limite do cofre ${money(closing.held?.lost ?? 0)}; recolhimento manual ${townHallStatus(city)}.`
        : `Receitas e impostos liquidados automaticamente no caixa: ${money(report.income)}.`,
      `Taxa total reportada no fechamento: empresas ${money(report.businessTaxRevenue)} + habitantes ${money(report.residentTaxRevenue)} = ${money(report.taxRevenue)}.`,
    );
    if (report.cashLedger) {
      const ledger = report.cashLedger;
      lines.push(
        `Conciliação de caixa efetiva: Prefeitura antes ${money(ledger.fundsBefore)}, entradas diretas ${money(ledger.directIncome)}, saídas debitadas ${money(ledger.expensesDebited)}, variação esperada ${money(ledger.fundsDeltaExpected)}, variação observada ${money(ledger.fundsDeltaObserved)}, diferença ${money(ledger.fundsDifference)}.`,
        `Cofre da Prefeitura: início ${money(ledger.townHallBefore)}, receitas adicionadas ${money(ledger.townHallIncomeAdded)}, perdidas por limite ${money(ledger.townHallIncomeLost)}, fim ${money(ledger.townHallAfter)}. Valores transferidos só quando o jogador recolhe impostos; essa transferência não é nova receita.`,
        `Conciliação automática: ${Math.abs(ledger.fundsDifference) < 0.01 ? 'sem diferença entre variação esperada e observada do caixa' : `diferença de ${money(ledger.fundsDifference)} a investigar (alerta, não confirmação automática de bug)`}.`,
      );
    }
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
  private previousDailyPopulation: number;
  private previousSectorStaffing: Record<AuditSector, number>;
  private readonly demographicBaseline: { immigration: number; emigration: number; births: number; deaths: number };
  private readonly lotReasons = new Map<string, string>();
  private readonly maxEntries = 30_000;

  constructor(private readonly cityName: string, city: City, sim: Simulation) {
    this.previous = populationMood(city, sim);
    this.previousDailyPopulation = this.previous.population;
    this.previousSectorStaffing = sectorStaffing(city);
    this.demographicBaseline = {
      immigration: city.demography.monthImmigration,
      emigration: city.demography.monthEmigration,
      births: city.demography.monthBirths,
      deaths: city.demography.monthDeaths,
    };
    this.record(city, 'INÍCIO', `Auditoria iniciada; população ${this.previous.population}, caixa ${money(city.funds)}. O histórico começa nesta sessão/cidade carregada.`);
    this.captureDiagnosticChange(city, sim);
    this.captureLotChanges(city, sim, true);
  }

  record(city: City, category: string, description: string, coalesceKey?: string) {
    const prefix = `${date(city)} | ${category}`;
    if (coalesceKey) {
      this.entries.push(`${prefix} | chave=${coalesceKey} | ${description}`);
    } else this.entries.push(`${prefix} | ${description}`);
    if (this.entries.length > this.maxEntries) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  daily(city: City, sim: Simulation, out: DayOutcome) {
    const migration = this.dailyMovement(city, out);
    const diagnostics = sim.growth.diagnostics(sim.materials.report.imported);
    const diagnosticChanged = this.captureDiagnosticChange(city, sim, diagnostics);
    this.observe(city, sim, 'fechamento diário');
    if (out.started.length) {
      const details = out.started.map((id) => city.world.buildings.get(id)).filter((b) => b !== undefined).map((b) => `ID ${b.id} ${BUILDINGS[b.def].name} (${b.def}) em (${b.x},${b.y}), materiais base ${number(materialsFor(b.def))}, efetivos ${number(materialsFor(b.def) * techEffects(city).materials)}`);
      this.record(city, 'OBRAS INICIADAS', `${out.started.length} obra(s); materiais consumidos hoje ${number(sim.materials.report.used)}; a construção por crescimento não debita dinheiro público no modelo atual; ${details.join(' | ')}.`);
    }
    if (out.completed.length) {
      const details = out.completed.map((id) => city.world.buildings.get(id)).filter((b) => b !== undefined).map((b) => `ID ${b.id} ${BUILDINGS[b.def].name} em (${b.x},${b.y}), capacidade ${BUILDINGS[b.def].capacity}`);
      this.record(city, 'OBRAS CONCLUÍDAS', `${out.completed.length} obra(s): ${details.join(' | ')}.`);
    }
    if (out.abandoned.length || out.recovered.length) this.record(city, 'ESTADO DOS IMÓVEIS', `Abandonados hoje ${out.abandoned.length}; recuperados hoje ${out.recovered.length}; IDs abandonados ${out.abandoned.join(', ') || 'nenhum'}; IDs recuperados ${out.recovered.join(', ') || 'nenhum'}.`);
    const currentPopulation = populationMood(city, sim).population;
    const actualDelta = currentPopulation - this.previousDailyPopulation;
    const explainedDelta = migration.immigration - migration.emigration + migration.births - migration.deaths;
    const demographicDifference = actualDelta - explainedDelta;
    this.record(city, 'AUDITORIA DEMOGRÁFICA DIÁRIA', `Variação real ${actualDelta >= 0 ? '+' : ''}${actualDelta}; imigração ${migration.immigration}; emigração ${migration.emigration}; nascimentos ${migration.births}; mortes ${migration.deaths}; variação explicada ${explainedDelta >= 0 ? '+' : ''}${explainedDelta}; diferença ${demographicDifference >= 0 ? '+' : ''}${demographicDifference}. Migração decorre da ocupação das moradias/atratividade; o modelo agregado não atribui uma causa individual a cada mudança. ${demographicDifference === 0 ? 'Conciliação diária fechou.' : 'Diferença para investigar; pode incluir moradores removidos por demolição/alteração urbana e não confirma bug.'}`);
    this.previousDailyPopulation = currentPopulation;
    const currentStaffing = sectorStaffing(city);
    for (const sector of AUDIT_SECTORS) {
      const delta = currentStaffing[sector] - this.previousSectorStaffing[sector];
      if (Math.abs(delta) >= 0.5) this.record(city, 'VARIAÇÃO LÍQUIDA DE EMPREGOS', `${sector}: postos ocupados ${number(this.previousSectorStaffing[sector])} → ${number(currentStaffing[sector])}; variação líquida ${delta >= 0 ? '+' : ''}${number(delta)}. O jogo não mantém eventos separados de contratação e demissão nem motivo individual.`);
    }
    this.previousSectorStaffing = currentStaffing;
    this.entries.push(...reportLines(city, sim, sim.budget.forecast(), 'AUDITORIA DIÁRIA / PREVISÃO DO MÊS', undefined, date(city), false, diagnostics));
    if (diagnosticChanged || out.budget) this.captureLotChanges(city, sim);
    if (out.budget) this.monthClose(city, sim, out.budget, sim.budget.held, city.funds - out.budget.cashNet);
    this.trim();
  }

  private dailyMovement(city: City, out: DayOutcome) {
    const p = city.demography;
    const current = out.budget
      ? { immigration: p.lastImmigration, emigration: p.lastEmigration, births: p.lastBirths, deaths: p.lastDeaths }
      : { immigration: p.monthImmigration, emigration: p.monthEmigration, births: p.monthBirths, deaths: p.monthDeaths };
    const delta = {
      immigration: Math.max(0, current.immigration - this.demographicBaseline.immigration),
      emigration: Math.max(0, current.emigration - this.demographicBaseline.emigration),
      births: Math.max(0, current.births - this.demographicBaseline.births),
      deaths: Math.max(0, current.deaths - this.demographicBaseline.deaths),
    };
    this.demographicBaseline.immigration = out.budget ? 0 : p.monthImmigration;
    this.demographicBaseline.emigration = out.budget ? 0 : p.monthEmigration;
    this.demographicBaseline.births = out.budget ? 0 : p.monthBirths;
    this.demographicBaseline.deaths = out.budget ? 0 : p.monthDeaths;
    return delta;
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

  private captureDiagnosticChange(city: City, sim: Simulation, supplied?: ZoneDiagnostics) {
    const diagnostic = supplied ?? sim.growth.diagnostics(sim.materials.report.imported);
    const signature = JSON.stringify(diagnostic);
    if (signature === this.previousDiagnostics) return false;
    this.previousDiagnostics = signature;
    for (const line of diagnosticLines(diagnostic, sim)) this.record(city, 'CRESCIMENTO BLOQUEADO', line);
    return true;
  }

  private captureLotChanges(city: City, sim: Simulation, initial = false) {
    const current = new Map<string, string>();
    const details: string[] = [];
    for (const lot of diagnoseVacantLots(city, sim.materials.report.imported)) {
      const key = `${lot.x},${lot.y}`;
      current.set(key, lot.reason);
      if (initial || this.lotReasons.get(key) !== lot.reason) details.push(lotAuditLine(lot));
    }
    for (const [key, reason] of this.lotReasons) if (!current.has(key)) details.push(`Terreno (${key}) deixou de estar bloqueado (${reason}); pode ter sido construído, deszoneado ou alterado.`);
    if (details.length) {
      const header = initial ? `Snapshot inicial: ${details.length} terreno(s) avaliados;` : `${details.length} terreno(s) mudaram de estado;`;
      this.record(city, initial ? 'AUDITORIA INICIAL DE TERRENOS' : 'TERRENOS AVALIADOS', `${header} ${details.join(' | ')}`);
    }
    this.lotReasons.clear();
    for (const [key, value] of current) this.lotReasons.set(key, value);
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
      `Período coberto: snapshots diários desde o início desta sessão ou carregamento da cidade; o histórico anterior não é inventado nem reconstruído.`,
      `Limite do histórico: ${this.maxEntries.toLocaleString('pt-BR')} registros recentes; dimensionado para reter ao menos três meses simulados de snapshots agregados, salvo se eventos detalhados excederem o limite.`,
      'Escopo do modelo: valores marcados como estimativa são agregados pela simulação, não extratos bancários de empresas ou movimentações individuais de cidadãos.',
      'Não modelado: caixa/saldo por empresa, clientes e transações individuais, quantidades unitárias de produtos, custo operacional e lucro por empresa, vagas financiadas, qualificação/candidatos por vaga, contratação e demissão como eventos separados. O log informa as aproximações disponíveis e as lacunas.',
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

export const AUDIT_VERSION = `Republic audit v2 · daily snapshots · days/month ${BALANCE.daysPerMonth}`;
