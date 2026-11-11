import { useAtom } from 'jotai';
import { noticesAtom } from '../atoms';

/**
 * Short-lived toasts. Errors never block the world (docs/04-ui-ux.md): they fade by themselves,
 * a tap dismisses one early, and the ones worth keeping wait in the alerts inbox (the bell).
 */
export function Notices() {
  const [notices, setNotices] = useAtom(noticesAtom);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`panel notice notice-${n.kind}`}
          title="Dismiss"
          onClick={() => setNotices((list) => list.filter((x) => x.id !== n.id))}
        >
          {n.message}
        </button>
      ))}
    </div>
  );
}
