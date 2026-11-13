import { useAtomValue } from 'jotai';
import { useRef, useState } from 'react';
import { BALANCE } from '../../shared/balance';
import { BUILDINGS } from '../../sim/buildings/catalog';
import { militaryReport, type MilitaryActionResult, type MilitaryPurchase, type MilitaryVehicle } from '../../sim/systems/military';
import { fundsAtom, gameAtom } from '../atoms';
import { SLIM_BAR, useMedia } from '../mobile/useMedia';
import { useDismiss, useOverlay } from '../overlay/overlay';
import { Sheet } from './Sheet';

const money = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('pt-BR')}`;
const ACTION_ERRORS: Record<Exclude<MilitaryActionResult, { ok: true }>['reason'], string> = {
  command: 'É necessário ter um Centro de Comando concluído.',
  facility: 'Construa e conclua a instalação de armazenamento necessária.',
  capacity: 'O estoque atingiu o limite das instalações concluídas.',
  funds: 'O caixa da cidade não tem saldo suficiente.',
  equipment: 'Para alistar, o paiol precisa ter um fuzil e 120 munições por soldado.',
  quantity: 'Informe uma quantidade inteira maior que zero.',
};

function Stock({ label, value, capacity }: { label: string; value: number; capacity: number }) {
  const percent = capacity > 0 ? Math.min(100, (value / capacity) * 100) : 0;
  return <div className="military-stock">
    <div className="budget-line"><span>{label}</span><strong>{value.toLocaleString('pt-BR')} / {capacity.toLocaleString('pt-BR')}</strong></div>
    <div className="meter"><div className="meter-fill" style={{ width: `${percent}%` }} /></div>
  </div>;
}

export function MilitaryPanel() {
  const { open, close } = useOverlay('military');
  const phone = useMedia(SLIM_BAR);
  const ref = useRef<HTMLElement>(null);
  useDismiss(ref, open && !phone, close, { outside: false });
  if (!open) return null;
  return phone ? <Sheet label="Centro de Comando Militar" onClose={close} className="military-panel"><MilitaryBody onClose={close} /></Sheet>
    : <aside ref={ref} className="panel budget-panel military-panel" role="dialog" aria-label="Centro de Comando Militar"><MilitaryBody onClose={close} /></aside>;
}

function MilitaryBody({ onClose }: { onClose: () => void }) {
  const game = useAtomValue(gameAtom);
  const funds = useAtomValue(fundsAtom);
  const [quantityText, setQuantityText] = useState('1');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (!game) return null;
  void revision;
  const report = militaryReport(game.city);
  const count = Number(quantityText);
  const validCount = Number.isSafeInteger(count) && count > 0 && count <= 10_000;
  const totalVehicles = Object.values(report.inventory.vehicles).reduce((sum, value) => sum + value, 0);
  const act = (result: MilitaryActionResult) => {
    if (result.ok) {
      setError('');
      setMessage(`Operação concluída · ${money(result.cost)} debitados do caixa.`);
      setRevision((value) => value + 1);
    } else {
      setMessage('');
      setError(ACTION_ERRORS[result.reason]);
    }
  };
  const buy = (item: MilitaryPurchase) => act(game.purchaseMilitary(item, count));
  const vehicleRows: readonly { id: MilitaryVehicle; label: string; cost: number }[] = [
    { id: 'patrol', label: 'Viatura leve', cost: BALANCE.military.vehicleCosts.patrol },
    { id: 'transport', label: 'Caminhão de transporte', cost: BALANCE.military.vehicleCosts.transport },
    { id: 'armored', label: 'Veículo blindado', cost: BALANCE.military.vehicleCosts.armored },
    { id: 'helicopter', label: 'Helicóptero', cost: BALANCE.military.vehicleCosts.helicopter },
  ];

  return <>
    <header className="info-header">
      <div><h2 className="info-title">Centro de Comando</h2><span className="info-chip">Defesa e logística</span></div>
      <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button>
    </header>
    <p className="tax-hint">Recrute e equipe o efetivo, compre veículos e mantenha os estoques dentro da capacidade dos quartéis, garagens, depósitos e paiol.</p>
    <div className="budget-card">
      <div className="budget-line"><span>Saldo da cidade</span><strong>{money(funds)}</strong></div>
      <div className="budget-line"><span>Centros de comando operacionais</span><strong>{report.capacity.commandCenters}</strong></div>
      <div className="budget-line dim"><span>Quartéis · garagens · paióis · depósitos</span><strong>{report.capacity.barracks} · {report.capacity.garages} · {report.capacity.armories} · {report.capacity.depots}</strong></div>
      <label className="bank-field">Quantidade da operação
        <input type="number" min={1} max={10_000} step={1} value={quantityText} onChange={(event) => { setQuantityText(event.target.value); setError(''); setMessage(''); }} />
      </label>
      {error && <p className="tax-hint warn-text" role="alert">{error}</p>}
      {message && <p className="tax-hint" role="status">{message}</p>}
    </div>

    <section className="budget-card">
      <h3 className="budget-heading">Efetivo e soldos</h3>
      <p className="tax-hint">Unidades ficam no pátio da base. No mapa, clique em um soldado, veículo ou helicóptero e depois clique no destino; Esc cancela a seleção. Tropas e veículos contornam prédios e água. Helicópteros sobrevoam obstáculos.</p>
      <Stock label="Soldados alojados" value={report.inventory.soldiers} capacity={report.capacity.soldiers} />
      {!report.capacity.soldiers && <p className="tax-hint warn-text">Construa um Quartel para aumentar a capacidade de alojamento.</p>}
      <div className="budget-line"><span>Soldos no próximo mês</span><strong>{money(report.monthlyPayroll)}/mês</strong></div>
      <p className="tax-hint">Cada alistamento custa {money(report.enlistmentCost)} e consome um fuzil e {BALANCE.military.roundsPerSoldier} munições. O soldo é debitado mensalmente e aparece nos custos de defesa.</p>
      <button type="button" className="primary-button" disabled={!validCount || !report.commandAvailable || !report.capacity.soldiers || report.inventory.soldiers + count > report.capacity.soldiers || report.inventory.rifles < count || report.inventory.ammunition < count * BALANCE.military.roundsPerSoldier || funds < count * report.enlistmentCost} onClick={() => act(game.enlistMilitary(count))}>
        Alistar {validCount ? count.toLocaleString('pt-BR') : '…'} · {money(validCount ? count * report.enlistmentCost : 0)}
      </button>
    </section>

    <section className="budget-card">
      <h3 className="budget-heading">Garagem e frota</h3>
      <Stock label="Veículos armazenados" value={totalVehicles} capacity={report.capacity.vehicles} />
      {!report.capacity.garages && <p className="tax-hint warn-text">Construa uma Garagem Militar para comprar e armazenar veículos.</p>}
      {vehicleRows.map((row) => <div className="military-purchase" key={row.id}>
        <div><strong>{row.label}</strong><span>{report.inventory.vehicles[row.id]} · {money(row.cost)} cada</span></div>
        <button type="button" className="secondary-button" disabled={!validCount || !report.capacity.garages || totalVehicles + count > report.capacity.vehicles || funds < count * row.cost} onClick={() => buy(row.id)}>Comprar</button>
      </div>)}
      <p className="tax-hint">Cada garagem concluída acrescenta {BUILDINGS.military_garage.capacity} vagas de veículo.</p>
    </section>

    <section className="budget-card">
      <h3 className="budget-heading">Paiol e armamento</h3>
      {!report.capacity.armories && <p className="tax-hint warn-text">Construa um Paiol para comprar e armazenar fuzis e munição.</p>}
      <Stock label="Fuzis" value={report.inventory.rifles} capacity={report.capacity.rifles} />
      <div className="military-purchase"><div><strong>Fuzil</strong><span>{money(BALANCE.military.rifleCost)} cada</span></div><button type="button" className="secondary-button" disabled={!validCount || !report.capacity.armories || report.inventory.rifles + count > report.capacity.rifles || funds < count * BALANCE.military.rifleCost} onClick={() => buy('rifles')}>Comprar</button></div>
      <Stock label="Munição (cartuchos)" value={report.inventory.ammunition} capacity={report.capacity.ammunition} />
      <div className="military-purchase"><div><strong>Caixa · {BALANCE.military.roundsPerAmmoCrate.toLocaleString('pt-BR')} cartuchos</strong><span>{money(BALANCE.military.ammoCrateCost)} cada</span></div><button type="button" className="secondary-button" disabled={!validCount || !report.capacity.armories || report.inventory.ammunition + count * BALANCE.military.roundsPerAmmoCrate > report.capacity.ammunition || funds < count * BALANCE.military.ammoCrateCost} onClick={() => buy('ammunition')}>Comprar</button></div>
      <p className="tax-hint">Cada paiol concluído armazena {BALANCE.military.riflesPerArmory} fuzis e {BALANCE.military.ammoPerArmory.toLocaleString('pt-BR')} cartuchos.</p>
    </section>

    <section className="budget-card">
      <h3 className="budget-heading">Depósitos e suprimentos</h3>
      <Stock label="Suprimentos armazenados" value={report.inventory.supplies} capacity={report.capacity.supplies} />
      {!report.capacity.depots && <p className="tax-hint warn-text">Construa um Depósito Militar para armazenar suprimentos.</p>}
      <div className="military-purchase"><div><strong>Caixa · {BALANCE.military.suppliesPerCrate} unidades</strong><span>{money(BALANCE.military.supplyCrateCost)} cada</span></div><button type="button" className="secondary-button" disabled={!validCount || !report.capacity.depots || report.inventory.supplies + count * BALANCE.military.suppliesPerCrate > report.capacity.supplies || funds < count * BALANCE.military.supplyCrateCost} onClick={() => buy('supplies')}>Comprar</button></div>
      <p className="tax-hint">Cada depósito concluído acrescenta {BALANCE.military.suppliesPerDepot.toLocaleString('pt-BR')} unidades de armazenamento.</p>
    </section>
  </>;
}
