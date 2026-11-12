import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../save/api';
import { API_LIMITS } from '../../shared/api';
import { authDialogAtom, authNoticeAtom, authProvidersAtom } from '../atoms';
import { useAuth } from '../auth';
import { clock, passwordStrength, validate, type AuthFields, type AuthMode } from './authForm';
import { CodeStep, ForgotStep } from './CodeSteps';
import { PasswordField } from './PasswordField';
import { Honeypot, Turnstile } from './Turnstile';

const EMPTY: AuthFields = { email: '', password: '', confirm: '' };
type Touched = Partial<Record<keyof AuthFields, boolean>>;

/** Where the dialog is: the log in / sign up form, or one of the emailed-code steps (D-084). */
type Step = { readonly kind: 'form' } | { readonly kind: 'verify'; readonly email: string } | { readonly kind: 'forgot' } | { readonly kind: 'reset'; readonly email: string };
const FORM: Step = { kind: 'form' };

/** Small iso city mark for the dialog header. */
function Mark() {
  return (
    <svg className="auth-mark" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 30 6 21 24 12l18 9z" fill="#3f8f3a" />
      <path d="M6 21v4l18 9v-4z" fill="#2c6a2b" />
      <path d="M24 30v4l18-9v-4z" fill="#255a25" />
      <path d="M14 22v-9l6 3v9z" fill="#e9e2d4" />
      <path d="M20 25v-9l4-2v9z" fill="#b9b2a4" />
      <path d="M14 13l4-2 6 3-4 2z" fill="#f6f2ea" />
      <path d="M25 24V8l6 3v16z" fill="#7fb3d8" />
      <path d="M31 27V11l5-2.5v16z" fill="#4f7ea6" />
      <path d="M25 8l5-2.5 6 3L31 11z" fill="#cfe6f6" />
    </svg>
  );
}

export function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

/** Leave for GitHub's sign-in page; the server sends the player back to where they were. */
export function signInWithGithub() {
  const returnTo = location.pathname + location.search;
  location.href = `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Log in / sign up, as a modal over either screen. Fields are checked as you go (after you leave
 * a field, or on submit), sign up asks for the password twice and shows its strength, and when
 * the server asks us to wait (429) the button counts down instead of failing again. With email
 * codes on, sign-up continues to a code step, and log in offers "Forgot password?".
 */
export function AuthDialog() {
  const localAccount = import.meta.env.VITE_LOCAL_ACCOUNTS === 'on';
  const [mode, setMode] = useAtom(authDialogAtom);
  const providers = useAtomValue(authProvidersAtom);
  /** A message from outside the dialog (a failed GitHub sign-in); cleared on any change. */
  const [notice, setNotice] = useAtom(authNoticeAtom);
  const [leaving, setLeaving] = useState(false);
  const { login, signup } = useAuth();
  const [step, setStep] = useState<Step>(FORM);
  /** Bot check for sign-up: Turnstile token (single-use, so a new round per attempt) and honeypot. */
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const [website, setWebsite] = useState('');
  const [fields, setFields] = useState<AuthFields>(EMPTY);
  const [touched, setTouched] = useState<Touched>({});
  /** The server's answer; a "wait" message hides itself once the countdown ends. */
  const [serverError, setServerError] = useState<{ text: string; wait: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Epoch ms until which the server has asked us to wait. */
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const emailRef = useRef<HTMLInputElement>(null);

  const switchTo = useCallback(
    (next: AuthMode | null) => {
      setServerError(null);
      setNotice(null);
      setTouched({});
      setFields((f) => ({ ...f, password: '', confirm: '' }));
      setStep(FORM);
      setMode(next);
    },
    [setMode, setNotice],
  );
  const close = useCallback(() => switchTo(null), [switchTo]);

  // Closed from elsewhere (signed in by another tab, the guest gate…): start over next time.
  const [openMode, setOpenMode] = useState(mode);
  if (openMode !== mode) {
    setOpenMode(mode);
    if (!mode) setStep(FORM);
  }

  useEffect(() => {
    if (!mode) return;
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, close]);

  // Tick the countdown while a wait is running.
  const waiting = waitUntil > now;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [waiting]);

  if (!mode) return null;
  const isSignup = mode === 'signup';
  const errors = validate(mode, fields, localAccount);
  const shown = (k: keyof AuthFields) => (touched[k] ? errors[k] : undefined);
  const strength = passwordStrength(fields.password);
  const set = (k: keyof AuthFields) => (v: string) => {
    setFields((f) => ({ ...f, [k]: v }));
    setServerError(null);
  };
  const touch = (k: keyof AuthFields) => () => setTouched((t) => ({ ...t, [k]: true }));

  const submit = async () => {
    setTouched({ email: true, password: true, confirm: true });
    if (Object.keys(errors).length > 0 || waiting) return;
    if (isSignup && providers.turnstileSiteKey && !captcha) {
      setServerError({ text: 'One moment: checking you’re not a robot…', wait: false });
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const email = fields.email.trim();
      if (isSignup) {
        const result = await signup(email, fields.password, {
          ...(localAccount && { confirmPassword: fields.confirm }),
          captcha: captcha ?? undefined,
          website: website || undefined,
        });
        if (result === 'verify') {
          setStep({ kind: 'verify', email });
          return;
        }
      } else {
        await login(email, fields.password);
      }
      setFields(EMPTY);
      close();
    } catch (err) {
      if (isSignup) {
        setCaptcha(null);
        setCaptchaRound((n) => n + 1);
      }
      if (err instanceof ApiError && err.status === 429 && err.retryAfter) {
        setWaitUntil(Date.now() + err.retryAfter * 1000);
        setNow(Date.now());
      }
      const wait = err instanceof ApiError && err.status === 429;
      setServerError({
        text: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        wait,
      });
      // A wrong password is retyped; the email stays.
      if (err instanceof ApiError && err.status === 401) setFields((f) => ({ ...f, password: '' }));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Step['kind'], [string, string]> = {
    form: localAccount
      ? isSignup
        ? ['Criar conta', 'Escolha um login e digite a senha duas vezes. Suas cidades serão salvas no MySQL do XAMPP.']
        : ['Entrar no Republica', 'Use seu login e senha para abrir suas cidades.']
      : isSignup ? ['Join Republica', 'Keep your cities safe and play them from any browser.'] : ['Welcome back, mayor', 'Log in to open the cities in your account.'],
    verify: ['Verifique seu e-mail', `Enviamos um código de ${API_LIMITS.codeLength} dígitos para ${step.kind === 'verify' ? step.email : ''}.`],
    forgot: ['Reset your password', 'Enter your account’s email and we’ll send you a code.'],
    reset: ['Verifique seu e-mail', `Se ${step.kind === 'reset' ? step.email : 'esse e-mail'} tiver uma conta, um código está a caminho.`],
  };
  const [title, lead] = titles[step.kind];
  const backToLogin = () => switchTo('login');
  const done = () => {
    setFields(EMPTY);
    close();
  };

  const label = waiting ? `Tente novamente em ${clock((waitUntil - now) / 1000)}` : busy ? (isSignup ? 'Criando sua conta…' : 'Entrando…') : isSignup ? 'Criar conta' : 'Entrar';

  return (
    <div className="modal-backdrop auth-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="auth-close" aria-label="Close" onClick={close}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <header className="auth-head">
          <Mark />
          <h2 id="auth-title">{title}</h2>
          <p className="auth-lead">{lead}</p>
        </header>

        {step.kind === 'verify' && <CodeStep purpose="signup" email={step.email} onDone={done} onBack={() => setStep(FORM)} />}
        {step.kind === 'reset' && <CodeStep purpose="reset" email={step.email} onDone={done} onBack={backToLogin} />}
        {step.kind === 'forgot' && (
          <ForgotStep initialEmail={fields.email.trim()} siteKey={providers.turnstileSiteKey} onSent={(email) => setStep({ kind: 'reset', email })} onBack={backToLogin} />
        )}
        {step.kind === 'form' && (
          <form
            className="auth-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="auth-tabs" role="tablist" aria-label="Account">
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={`auth-tab ${mode === m ? 'is-active' : ''}`}
                  onClick={() => mode !== m && switchTo(m)}
                >
                  {m === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>

            {!localAccount && providers.github && (
              <>
                <button
                  type="button"
                  className="auth-provider"
                  disabled={leaving}
                  onClick={() => {
                    setLeaving(true);
                    signInWithGithub();
                  }}
                >
                  <GithubMark />
                  {leaving ? 'Opening GitHub…' : isSignup ? 'Sign up with GitHub' : 'Continue with GitHub'}
                </button>
                <div className="auth-divider" role="separator">
                  <span>or with email</span>
                </div>
              </>
            )}

            <div className={`auth-field ${shown('email') ? 'has-error' : ''}`}>
              <label className="auth-label" htmlFor="auth-email">
                {localAccount ? 'Login' : 'Email'}
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                className="auth-input"
                type={localAccount ? 'text' : 'email'}
                inputMode={localAccount ? 'text' : 'email'}
                autoComplete={localAccount ? 'username' : 'email'}
                placeholder={localAccount ? 'seu_login' : 'you@example.com'}
                value={fields.email}
                aria-invalid={!!shown('email')}
                onChange={(e) => set('email')(e.target.value)}
                onBlur={touch('email')}
              />
              {shown('email') && (
                <span className="auth-note is-error" role="alert">
                  {shown('email')}
                </span>
              )}
            </div>

            <PasswordField
              id="auth-password"
              label="Password"
              value={fields.password}
              onChange={set('password')}
              onBlur={touch('password')}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              error={shown('password')}
            />
            {!localAccount && !isSignup && providers.emailCodes && (
              <button type="button" className="auth-link auth-forgot" onClick={() => setStep({ kind: 'forgot' })}>
                Forgot password?
              </button>
            )}
            {isSignup && fields.password && (
              <div className={`auth-strength is-${strength.score}`} aria-live="polite">
                <span className="auth-strength-bars" aria-hidden="true">
                  {[1, 2, 3, 4].map((k) => (
                    <i key={k} className={k <= strength.score ? 'is-on' : ''} />
                  ))}
                </span>
                <span className="auth-strength-label">{strength.label}</span>
              </div>
            )}
            {isSignup && (
              <PasswordField
                id="auth-confirm"
                label="Confirm password"
                value={fields.confirm}
                onChange={set('confirm')}
                onBlur={touch('confirm')}
                autoComplete="new-password"
                error={shown('confirm')}
                valid={!!fields.confirm && fields.confirm === fields.password}
              />
            )}
            {isSignup && !localAccount && providers.emailCodes && <Honeypot value={website} onChange={setWebsite} />}
            {isSignup && !localAccount && providers.turnstileSiteKey && <Turnstile key={captchaRound} siteKey={providers.turnstileSiteKey} onToken={setCaptcha} />}

            {(notice || (serverError && (!serverError.wait || waiting))) && (
              <p className={`auth-banner ${serverError?.wait ? 'is-wait' : ''}`} role="alert">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 4.6v4.2M8 11.2v.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span>{serverError?.text ?? notice}</span>
              </p>
            )}

            <button type="submit" className="auth-submit" disabled={busy || waiting} aria-busy={busy}>
              {busy && <span className="auth-spinner" aria-hidden="true" />}
              {label}
            </button>

            {localAccount ? (
              <p className="auth-foot">Suas cidades ficam vinculadas a esta conta no banco de dados deste computador.</p>
            ) : isSignup ? (
              <ul className="auth-perks">
                <li>Your cities on every device</li>
                <li>Saved to the cloud as you play</li>
              </ul>
            ) : (
              <p className="auth-foot">Playing as a guest? Cities on this device stay here, and you can move them into your account after logging in.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
