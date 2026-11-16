import { useAtomValue } from 'jotai';
import type { CityInfo } from '../../game/events';
import { cityAtom } from '../atoms';
import { useOverlay } from '../overlay/overlay';
import { Sheet } from './Sheet';

const count = (value: number) => value.toLocaleString('pt-BR');

export function EmploymentDetails({ city }: { city: CityInfo }) {
  return (
    <>
      <strong className="employment-title">Empregos na cidade</strong>
      <dl className="employment-details">
        <dt>Disponíveis para trabalhar</dt><dd>{count(city.workforce)}</dd>
        <dt>Empregados</dt><dd>{count(city.workers)}</dd>
        <dt>Desempregados</dt><dd>{count(city.unemployed)}</dd>
        <dt>Afastados por doença</dt><dd>{count(city.society.sickLeave)}</dd>
      </dl>
    </>
  );
}

export function EmploymentSheet() {
  const city = useAtomValue(cityAtom);
  const { open, close } = useOverlay('employment');
  if (!city || !open) return null;
  return (
    <Sheet label="Empregos na cidade" onClose={close} className="employment-sheet">
      <EmploymentDetails city={city} />
    </Sheet>
  );
}
