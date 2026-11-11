import { useEffect, useRef, type ReactNode } from 'react';
import { useDismiss } from '../overlay/overlay';

interface SheetProps {
  /** Accessible name. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * A bottom sheet for phones (D-097): it rises over the toolbar, scrolls inside, and closes on
 * Escape, the handle, or a tap on the dimmed map above it. The dim layer takes that tap, so
 * closing a sheet never also builds or selects something on the map.
 */
export function Sheet({ label, onClose, children, className = '' }: SheetProps) {
  const ref = useRef<HTMLElement>(null);
  // The scrim catches outside taps itself (and swallows them), so only Escape is needed here.
  useDismiss(ref, true, onClose, { outside: false });
  // Focus moves into the sheet so keyboard and screen-reader users land in it.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <>
      <div className="sheet-scrim" aria-hidden="true" onPointerDown={onClose} />
      <section ref={ref} className={`panel sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="sheet-handle" aria-label="Close" onClick={onClose} />
        {children}
      </section>
    </>
  );
}
