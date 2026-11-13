import { useAtomValue } from 'jotai';
import { useRef, useState } from 'react';
import { cityAtom, fundsAtom, gameAtom } from '../atoms';
import { SLIM_BAR, useMedia } from '../mobile/useMedia';
import { useDismiss, useOverlay } from '../overlay/overlay';
import { Sheet } from './Sheet';
import { BANK_MAX_DEBT, BANK_MIN_AMOUNT, investmentRate, investmentValue, loanInstallment, loanRate, outstandingDebt, type BankResult } from '../../sim/systems/bank';

const money = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rate = (value: number) => `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const errors: Record<Exclude<BankResult, { ok: true }>['reason'], string> = {
  amount: 'Informe um valor inteiro de pelo menos $1.000.',
  term: 'Escolha um prazo entre 1 e 12 meses.',
  funds: 'Saldo insuficiente para esta aplicação.',
  limit: 'O empréstimo ultrapassa o limite de crédito disponível.',
};

export function BankPanel() {
  const { open, close } = useOverlay('bank');
  const phone = useMedia(SLIM_BAR);
  const ref = useRef<HTMLElement>(null);
  useDismiss(ref, open && !phone, close, { outside: false });
  if (!open) return null;
  return phone ? <Sheet label="Banco da cidade" onClose={close}><BankBody onClose={close} /></Sheet>
    : <aside ref={ref} className="panel budget-panel" aria-label="Banco da cidade"><BankBody onClose={close} /></aside>;
}

function BankBody({ onClose }: { onClose: () => void }) {
  const city = useAtomValue(cityAtom);
  const funds = useAtomValue(fundsAtom);
  const game = useAtomValue(gameAtom);
  const [amount, setAmount] = useState('10000');
  const [months, setMonths] = useState(3);
  const [error, setError] = useState('');
  if (!city) return null;
  const parsed = Number(amount);
  const previewAmount = Number.isSafeInteger(parsed) && parsed >= BANK_MIN_AMOUNT ? parsed : 0;
  const debt = outstandingDebt(city.bank);
  const available = Math.max(0, BANK_MAX_DEBT - debt);
  const investTotal = investmentValue(previewAmount, months);
  const installment = loanInstallment(previewAmount, months);
  const act = (kind: 'invest' | 'borrow') => {
    const result = kind === 'invest' ? game?.investAtBank(parsed, months) : game?.borrowFromBank(parsed, months);
    setError(result && !result.ok ? errors[result.reason] : '');
  };
  return <>
    <header className="info-header"><h2 className="info-title">Banco da cidade</h2><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>×</button></header>
    <div className="budget-card">
      <div className="budget-line"><span>Saldo disponível</span><strong>{money(funds)}</strong></div>
      <div className="budget-line"><span>Crédito ainda disponível</span><strong>{money(available)}</strong></div>
      <p className="tax-hint">Aplique dinheiro para receber juros compostos no vencimento ou tome crédito para financiar obras e subsídios. Cada parcela sai do caixa no fechamento do mês.</p>
      <label className="bank-field">Valor da operação ($)<input type="number" min={BANK_MIN_AMOUNT} max={1_000_000_000} step={1} value={amount} onChange={(event) => { setAmount(event.target.value); setError(''); }} /></label>
      <label className="bank-field">Prazo<select value={months} onChange={(event) => { setMonths(Number(event.target.value)); setError(''); }}>{Array.from({ length: 12 }, (_, index) => index + 1).map((term) => <option key={term} value={term}>{term} {term === 1 ? 'mês' : 'meses'}</option>)}</select></label>
      {error && <p className="tax-hint warn-text" role="alert">{error}</p>}
    </div>
    <div className="budget-card">
      <h3 className="budget-heading">Aplicar</h3>
      <div className="budget-line"><span>Juros compostos por mês</span><strong>{rate(investmentRate(months))}</strong></div>
      <div className="budget-line"><span>Resgate no vencimento</span><strong>{money(investTotal)}</strong></div>
      <div className="budget-line"><span>Ganho previsto</span><strong>+{money(investTotal - previewAmount)}</strong></div>
      <p className="tax-hint">O valor aplicado sai do saldo agora. Principal e juros voltam juntos após {months} {months === 1 ? 'fechamento' : 'fechamentos'}; não há resgate antecipado.</p>
      <button type="button" className="primary-button" disabled={!previewAmount || previewAmount > funds} onClick={() => act('invest')}>Confirmar aplicação</button>
    </div>
    <div className="budget-card">
      <h3 className="budget-heading">Pegar emprestado</h3>
      <div className="budget-line"><span>Juros por mês</span><strong>{rate(loanRate(months))}</strong></div>
      <div className="budget-line"><span>Parcela mensal aproximada</span><strong>{money(installment)}</strong></div>
      <div className="budget-line"><span>Total aproximado a pagar</span><strong>{money(installment * months)}</strong></div>
      <p className="tax-hint">O dinheiro entra no saldo agora. A taxa aumenta com o prazo; a última parcela ajusta centavos de arredondamento. Limite de dívida ativa: {money(BANK_MAX_DEBT)}.</p>
      <button type="button" className="primary-button" disabled={!previewAmount || previewAmount > available} onClick={() => act('borrow')}>Confirmar empréstimo</button>
    </div>
    <div className="budget-card">
      <h3 className="budget-heading">Operações ativas</h3>
      {city.bank.investments.length === 0 && city.bank.loans.length === 0 && <p className="tax-hint">Nenhuma operação ativa.</p>}
      {city.bank.investments.map((item) => <div key={`i${item.id}`} className="budget-line"><span>Aplicação #{item.id} · {item.remainingMonths} {item.remainingMonths === 1 ? 'mês' : 'meses'} restantes</span><strong>+{money(item.maturityValue)}</strong></div>)}
      {city.bank.loans.map((item) => <div key={`l${item.id}`} className="budget-line"><span>Empréstimo #{item.id} · {item.remainingMonths} {item.remainingMonths === 1 ? 'mês' : 'meses'} restantes</span><strong>−{money(item.balance)}</strong></div>)}
    </div>
  </>;
}
