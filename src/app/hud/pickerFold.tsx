import { useAtomValue } from 'jotai';
import { useState, type ReactNode } from 'react';
import { toolPreviewAtom } from '../atoms';
import { SMALL_UI, useMedia } from '../mobile/useMedia';

export interface PickerFold {
  /** Whether the viewport uses the compact layout. */
  readonly small: boolean;
  /** Folded to a chip showing the choice. */
  readonly folded: boolean;
  /** A finished touch drag waits for Build or Cancel: the picker steps aside entirely. */
  readonly drafting: boolean;
  /** Something was chosen: fold so the map is free to place it. */
  chosen: () => void;
  unfold: () => void;
}

/**
 * A picker is for choosing, the map is for placing. Once the player picks a
 * building or road type the picker folds into a chip with a way to choose again. On compact
 * layouts, it hides while a drag waits for Build / Cancel. Mount the hook inside a component
 * that mounts when its tool is picked, so every visit starts unfolded.
 */
export function usePickerFold(): PickerFold {
  const small = useMedia(SMALL_UI);
  const drafting = useAtomValue(toolPreviewAtom)?.awaitingConfirm ?? false;
  const [folded, setFolded] = useState(false);
  return {
    small,
    folded,
    drafting: small && drafting,
    chosen: () => setFolded(true),
    unfold: () => setFolded(false),
  };
}

interface PickerChipProps {
  /** `building-picker` or `road-picker`: the chip sits where the picker was. */
  kind: 'building-picker' | 'road-picker';
  picture: ReactNode;
  name: string;
  cost: string;
  onChange: () => void;
}

/** The folded picker: what's chosen, its price, and a button to choose again. */
export function PickerChip({ kind, picture, name, cost, onChange }: PickerChipProps) {
  return (
    <div className={`panel ${kind} is-chip`} role="status" aria-label={`Posicionando ${name}`}>
      <span className="chip-picture" aria-hidden="true">
        {picture}
      </span>
      <span className="chip-what">
        <strong>{name}</strong>
        <span className="card-cost">{cost}</span>
      </span>
      <button type="button" className="chip-change" onClick={onChange}>
        Trocar
      </button>
    </div>
  );
}
