import { useSetAtom } from 'jotai';
import { useRef, useState } from 'react';
import { authDialogAtom } from '../atoms';
import { useAuth } from '../auth';
import { useDismiss, useOverlay } from '../overlay/overlay';

interface AccountButtonProps {
  /** Runs before logging out (the game saves first). */
  beforeLogout?: () => Promise<void>;
  /** Compact style for the top bar. */
  compact?: boolean;
  /** Show the signed-in menu as part of the surrounding panel (the phone sheet), not a dropdown. */
  inline?: boolean;
}

/**
 * Guests: "Log in" (plus "Sign up" on the start screen). Signed in: the account's initial, with a
 * menu showing the email, where cities are kept, and log out. Offline: a quiet badge.
 */
export function AccountButton({ beforeLogout, compact = false, inline = false }: AccountButtonProps) {
  const { auth, logout } = useAuth();
  const openDialog = useSetAtom(authDialogAtom);
  const menu = useOverlay('account');
  const open = menu.open;
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, menu.close);

  if (auth.status === 'checking') return null;
  if (auth.status === 'guest') {
    if (!auth.online) {
      return (
        <span className={`account-offline ${compact ? 'is-compact' : ''}`} title="The save server is offline; cities are saved on this device">
          <i aria-hidden="true" />
          Offline
        </span>
      );
    }
    return (
      <div className={`account-guest ${compact ? 'is-compact' : ''}`}>
        <button type="button" className="account-login" title="Log in to keep your cities in an account" onClick={() => openDialog('login')}>
          Log in
        </button>
        {!compact && (
          <button type="button" className="account-signup" onClick={() => openDialog('signup')}>
            Sign up
          </button>
        )}
      </div>
    );
  }

  const email = auth.user.email;
  const initial = email[0]?.toUpperCase();
  const shown = open || inline;
  return (
    <div className={`account ${inline ? 'is-inline' : ''}`} ref={ref}>
      {!inline && (
      <button
        type="button"
        className={`account-trigger ${compact ? 'is-compact' : ''}`}
        title={email}
        aria-label={`Account: ${email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={menu.toggle}
      >
        <span className="account-avatar" aria-hidden="true">
          {initial}
        </span>
        {!compact && <span className="account-trigger-email">{email}</span>}
        <svg className="account-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      )}
      {shown && (
        <div className={inline ? 'account-menu' : 'panel account-menu'} role="menu">
          <div className="account-menu-head">
            <span className="account-avatar is-large" aria-hidden="true">
              {initial}
            </span>
            <span className="account-menu-who">
              <span className="account-email">{email}</span>
              <span className="account-sync">
                <i aria-hidden="true" />
                Cities saved to your account
              </span>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              try {
                await beforeLogout?.();
                await logout();
                menu.close();
              } finally {
                setLeaving(false);
              }
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H6M10.5 11 13.5 8l-3-3M13.5 8H6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {leaving ? 'Saving and logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
