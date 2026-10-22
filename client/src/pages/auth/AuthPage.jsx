import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../auth/useAuth.js';
import { Wordmark } from '../../components/shell/BrandMark.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';

const MODES = {
  login: {
    title: 'Sign in',
    submit: 'Sign in',
    busy: 'Signing in…',
    switchText: 'New to TokenGate?',
    switchLink: { to: '/register', label: 'Create an account' },
  },
  register: {
    title: 'Create your account',
    submit: 'Create account',
    busy: 'Creating account…',
    switchText: 'Already have an account?',
    switchLink: { to: '/login', label: 'Sign in' },
  },
};

function fieldError(error, path) {
  return error?.details?.find((detail) => detail.path === path)?.message;
}

/** Sign-in and registration share one calm layout: the product, then one form. */
export function AuthPage({ mode }) {
  const copy = MODES[mode];
  const { signIn, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') await signIn({ email: values.email, password: values.password });
      else await register(values);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (apiError) {
      setError(apiError);
      setSubmitting(false);
    }
  }

  const formError = error && !error.details ? error.message : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-frame px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col gap-1">
          <Wordmark />
          <p className="text-body text-muted">
            One endpoint for your LLM calls, with keys, caching, rate limits and fallback.
          </p>
        </div>
        <div className="rounded-sheet border border-line bg-surface p-6">
          <h1 className="text-title font-semibold text-ink">{copy.title}</h1>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
            {mode === 'register' ? (
              <Field label="Name" error={fieldError(error, 'body.name')}>
                {(props) => (
                  <TextInput
                    {...props}
                    autoComplete="name"
                    value={values.name}
                    onChange={update('name')}
                    required
                  />
                )}
              </Field>
            ) : null}
            <Field label="Email" error={fieldError(error, 'body.email')}>
              {(props) => (
                <TextInput
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={update('email')}
                  required
                />
              )}
            </Field>
            <Field
              label="Password"
              hint={mode === 'register' ? 'At least 8 characters.' : null}
              error={fieldError(error, 'body.password')}
            >
              {(props) => (
                <TextInput
                  {...props}
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={values.password}
                  onChange={update('password')}
                  required
                />
              )}
            </Field>
            {formError ? (
              <p role="alert" className="text-body text-negative">
                {formError}
              </p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="mt-1 h-9 w-full"
              disabled={submitting}
            >
              {submitting ? copy.busy : copy.submit}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-body text-muted">
          {copy.switchText}{' '}
          <Link
            to={copy.switchLink.to}
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            {copy.switchLink.label}
          </Link>
        </p>
        {mode === 'login' ? (
          <p className="mt-2 text-center text-small text-muted">
            Seeded demo account: <span className="font-mono">demo@tokengate.dev</span> /{' '}
            <span className="font-mono">tokengate-demo</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
