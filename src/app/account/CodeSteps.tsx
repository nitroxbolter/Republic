import { useEffect, useState } from 'react';
import { api, ApiError } from '../../save/api';
import { API_LIMITS, type CodePurpose } from '../../shared/api';
import { useAuth } from '../auth';
import { clock, validate } from './authForm';
import { PasswordField } from './PasswordField';
import { Honeypot, Turnstile } from './Turnstile';

/**
 * The emailed-code steps of the auth dialog (D-084): confirm a new account's email, ask for a
 * password reset, and set the new password. Each step is its own form inside the dialog.
 */

/** Matches the server's per-email cooldown between two code emails. */
const RESEND_SECONDS = 60;
const CODE = new RegExp(`^\\d{${API_LIMITS.codeLength}}$`);

const messageOf = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

/** Seconds left on a countdown, and a way to start one. */
function useCountdown(initial: number): [number, (seconds: number) => void] {
  const [until, setUntil] = useState(() => Date.now() + initial * 1000);
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [left]);
  return [
    left,
    (seconds) => {
      setUntil(Date.now() + seconds * 1000);
      setNow(Date.now());
    },
  ];
}

function Banner({ text, tone }: { readonly text: string; readonly tone: 'error' | 'info' }) {
  return (
    <p className={`auth-banner ${tone === 'info' ? 'is-info' : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d={tone === 'error' ? 'M8 4.6v4.2M8 11.2v.2' : 'M8 7.2v4.2M8 4.8v.2'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>{text}</span>
    </p>
  );
}

interface CodeStepProps {
  readonly purpose: CodePurpose;
  readonly email: string;
  /** Signed in: close the dialog. */
  readonly onDone: () => void;
  readonly onBack: () => void;
}

/** Enter the emailed code (and, for a reset, the new password). */
export function CodeStep({ purpose, email, onDone, onBack }: CodeStepProps) {
  const { verifySignup, resetPassword } = useAuth();
  const isReset = purpose === 'reset';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, startResend] = useCountdown(RESEND_SECONDS);

  const digits = code.replace(/\s+/g, '');
  const codeError = CODE.test(digits) ? undefined : `Digite o código de ${API_LIMITS.codeLength} dígitos enviado por e-mail`;
  const pwErrors = isReset ? validate('signup', { email, password, confirm }) : {};
  const invalid = !!codeError || !!pwErrors.password || !!pwErrors.confirm;

  const submit = async () => {
    setTouched(true);
    if (invalid || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await (isReset ? resetPassword(email, digits, password) : verifySignup(email, digits));
      onDone();
    } catch (err) {
      setError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    try {
      await api.resendCode(purpose, email);
      setInfo('A new code is on its way. Earlier codes no longer work.');
      startResend(RESEND_SECONDS);
    } catch (err) {
      setError(messageOf(err));
      if (err instanceof ApiError && err.retryAfter) startResend(err.retryAfter);
    }
  };

  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={`auth-field ${touched && codeError ? 'has-error' : ''}`}>
        <label className="auth-label" htmlFor="auth-code">
          Code
        </label>
        <input
          id="auth-code"
          className="auth-input auth-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={API_LIMITS.codeLength + 2}
          placeholder={'0'.repeat(API_LIMITS.codeLength)}
          autoFocus
          value={code}
          aria-invalid={touched && !!codeError}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
        />
        {touched && codeError ? (
          <span className="auth-note is-error" role="alert">
            {codeError}
          </span>
        ) : (
          <span className="auth-note">Not there? Check your spam folder. The code works for 10 minutes.</span>
        )}
      </div>

      {isReset && (
        <>
          <PasswordField
            id="auth-new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            error={touched ? pwErrors.password : undefined}
          />
          <PasswordField
            id="auth-new-confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={touched ? pwErrors.confirm : undefined}
            valid={!!confirm && confirm === password}
          />
        </>
      )}

      {error && <Banner text={error} tone="error" />}
      {info && !error && <Banner text={info} tone="info" />}

      <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
        {busy && <span className="auth-spinner" aria-hidden="true" />}
        {busy ? 'Checking…' : isReset ? 'Set new password' : 'Confirm and create account'}
      </button>

      <div className="auth-links">
        <button type="button" className="auth-link" onClick={onBack}>
          {isReset ? 'Back to log in' : 'Use a different email'}
        </button>
        <button type="button" className="auth-link" disabled={resendIn > 0} onClick={() => void resend()}>
          {resendIn > 0 ? `Enviar novo código em ${clock(resendIn)}` : 'Enviar novo código'}
        </button>
      </div>
    </form>
  );
}

interface ForgotStepProps {
  readonly initialEmail: string;
  readonly siteKey: string | null;
  readonly onSent: (email: string) => void;
  readonly onBack: () => void;
}

/** Ask for a reset code. */
export function ForgotStep({ initialEmail, siteKey, onSent, onBack }: ForgotStepProps) {
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  /** Turnstile tokens are single-use: a new round after every attempt. */
  const [round, setRound] = useState(0);
  const [website, setWebsite] = useState('');
  const emailError = validate('login', { email, password: '-', confirm: '' }).email;

  const submit = async () => {
    setTouched(true);
    if (emailError || busy) return;
    if (siteKey && !captcha) {
      setError('One moment: checking you’re not a robot…');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.forgotPassword(email.trim(), {
        captcha: captcha ?? undefined,
        website: website || undefined,
      });
      onSent(r.email);
    } catch (err) {
      setError(messageOf(err));
      setCaptcha(null);
      setRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className={`auth-field ${touched && emailError ? 'has-error' : ''}`}>
        <label className="auth-label" htmlFor="auth-forgot-email">
          Email
        </label>
        <input
          id="auth-forgot-email"
          className="auth-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          autoFocus
          value={email}
          aria-invalid={touched && !!emailError}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          onBlur={() => setTouched(true)}
        />
        {touched && emailError && (
          <span className="auth-note is-error" role="alert">
            {emailError}
          </span>
        )}
      </div>
      <Honeypot value={website} onChange={setWebsite} />
      {siteKey && <Turnstile key={round} siteKey={siteKey} onToken={setCaptcha} />}

      {error && <Banner text={error} tone="error" />}

      <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>
        {busy && <span className="auth-spinner" aria-hidden="true" />}
        {busy ? 'Sending…' : 'Email me a code'}
      </button>
      <div className="auth-links">
        <button type="button" className="auth-link" onClick={onBack}>
          Back to log in
        </button>
      </div>
    </form>
  );
}
