import { useAtomValue } from 'jotai';
import { useState, type ReactNode } from 'react';
import { toolPreviewAtom } from '../atoms';
import { SMALL_UI, useMedia } from '../mobile/useMedia';

export interface PickerFold {
  /** A phone layout, where the picker folds away once something is chosen. */
  readonly small: boolean;
  /** Folded to a chip showing the choice. */
  readonly folded: boolean;
  /** A finished touch drag waits for Build or Cancel: the picker steps aside entirely. */
  readonly drafting: boolean;
  /** Something was chosen: on phones, fold so the map is free to place it. */
  chosen: () => void;
  unfold: () => void;
}

/**
 * Phones (D-097): a picker is for choosing, the map is for placing. Once the player picks a
 * building or road type the picker folds into a chip ("Park $100 · Change"), and while a drag
 * waits for Build / Cancel it hides. Mount the hook inside a component that mounts when its tool
 * is picked, so every visit starts unfolded.
 */
export function usePickerFold(): PickerFold {
  const small = useMedia(SMALL_UI);
  const drafting = useAtomValue(toolPreviewAtom)?.awaitingConfirm ?? false;
  const [folded, setFolded] = useState(false);
  return {
    small,
    folded: small && folded,
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
    <div className={`panel ${kind} is-chip`} role="status" aria-label={`Placing ${name}`}>
      <span className="chip-picture" aria-hidden="true">
        {picture}
      </span>
      <span className="chip-what">
        <strong>{name}</strong>
        <span className="card-cost">{cost}</span>
      </span>
      <button type="button" className="chip-change" onClick={onChange}>
        Change
      </button>
    </div>
  );
}
