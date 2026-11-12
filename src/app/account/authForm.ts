import { API_LIMITS } from '../../shared/api';

/** Client-side checks for the log in / sign up form (the server checks again). */

export type AuthMode = 'login' | 'signup';

export interface AuthFields {
  readonly email: string;
  readonly password: string;
  readonly confirm: string;
}

export type FieldErrors = Partial<Record<keyof AuthFields, string>>;

/** The same rule the server applies (name@domain.tld, no spaces). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validate(mode: AuthMode, f: AuthFields, localAccount = false): FieldErrors {
  const errors: FieldErrors = {};
  const email = f.email.trim();
  if (localAccount) {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(email)) errors.email = 'Use de 3 a 24 letras, números ou _ no login';
  } else {
    if (!email) errors.email = 'Enter your email address';
    else if (!EMAIL.test(email)) errors.email = 'That doesn’t look like an email address';
  }
  if (!f.password) errors.password = mode === 'signup' ? 'Choose a password' : 'Enter your password';
  else if (mode === 'signup' && f.password.length < API_LIMITS.passwordMin) errors.password = `Use pelo menos ${API_LIMITS.passwordMin} caracteres`;
  else if (f.password.length > API_LIMITS.passwordMax) errors.password = 'That password is too long';
  if (mode === 'signup') {
    if (!f.confirm) errors.confirm = 'Type your password again';
    else if (f.confirm !== f.password) errors.confirm = 'Passwords don’t match';
  }
  return errors;
}

export interface Strength {
  /** 0 (empty) to 4 (strong). */
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: string;
}

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** A quick strength estimate from length and character variety (a hint, not a rule). */
export function passwordStrength(p: string): Strength {
  if (!p) return { score: 0, label: '' };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  let score = p.length < API_LIMITS.passwordMin ? 1 : p.length >= 14 ? 3 : 2;
  if (variety >= 3 && p.length >= API_LIMITS.passwordMin) score++;
  if (/^(.)\1+$/.test(p) || /^(password|12345678|qwerty)/i.test(p)) score = 1;
  const s = Math.max(1, Math.min(4, score)) as Strength['score'];
  return { score: s, label: LABELS[s] };
}

/** "0:42" for a countdown. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
