import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { CopyButton } from '../../components/ui/CopyButton.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { apiFetch } from '../../lib/api.js';

function fieldError(error, path) {
  return error?.details?.find((detail) => detail.path === path)?.message;
}

function parseLimit(text) {
  if (text.trim() === '') return null;
  return Number(text);
}

/** Two steps in one dialog: name the key, then show the secret exactly once. */
export function CreateKeyDialog({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  function close() {
    setName('');
    setLimit('');
    setError(null);
    setCreated(null);
    onClose();
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const rateLimitPerMinute = parseLimit(limit);
      const result = await apiFetch('/api/keys', {
        method: 'POST',
        body: { name, ...(rateLimitPerMinute !== null && { rateLimitPerMinute }) },
      });
      setCreated(result);
      onCreated();
    } catch (apiError) {
      setError(apiError);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title={`"${created.key.name}" is ready`}
        footer={
          <Button variant="primary" onClick={close}>
            I&apos;ve saved the key
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-control bg-[var(--pill-warning-bg)] px-3 py-2.5 text-body text-[var(--pill-warning-ink)]">
            <TriangleAlert size={16} className="mt-0.5 flex-none" aria-hidden="true" />
            <p>
              Copy this key now. TokenGate stores only a hash of it, so it cannot be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-control border border-line bg-raised py-1 pr-1 pl-3">
            <code className="min-w-0 flex-1 font-mono text-small break-all text-ink select-all">
              {created.secret}
            </code>
            <CopyButton value={created.secret} label="Copy key" />
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Create an API key"
      description="Apps send this key to TokenGate instead of a provider key."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Name"
          hint="Where the key is used, e.g. Production or Batch jobs."
          error={fieldError(error, 'body.name')}
        >
          {(props) => (
            <TextInput
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Rate limit (requests per minute)"
          hint="Leave empty to use the server default."
          error={fieldError(error, 'body.rateLimitPerMinute')}
        >
          {(props) => (
            <TextInput
              {...props}
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          )}
        </Field>
        {error && !error.details ? (
          <p className="text-body text-negative" role="alert">
            {error.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={submitting || name.trim() === ''}>
            {submitting ? 'Creating…' : 'Create key'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function EditLimitDialog({ apiKey, onClose, onSaved }) {
  const [limit, setLimit] = useState(
    apiKey?.hasCustomRateLimit ? String(apiKey.rateLimitPerMinute) : '',
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/keys/${apiKey.id}`, {
        method: 'PATCH',
        body: { rateLimitPerMinute: parseLimit(limit) },
      });
      onSaved();
      onClose();
    } catch (apiError) {
      setError(apiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(apiKey)} onClose={onClose} title="Rate limit" description={apiKey?.name}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Requests per minute"
          hint="Leave empty to use the server default. Requests over the limit get a 429 with Retry-After."
          error={
            fieldError(error, 'body.rateLimitPerMinute') ??
            (error && !error.details ? error.message : null)
          }
        >
          {(props) => (
            <TextInput
              {...props}
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              autoFocus
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save limit'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RevokeKeyDialog({ apiKey, onClose, onRevoked }) {
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(false);

  async function revoke() {
    setRevoking(true);
    setError(null);
    try {
      await apiFetch(`/api/keys/${apiKey.id}`, { method: 'DELETE' });
      onRevoked();
      onClose();
    } catch (apiError) {
      setError(apiError);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Dialog
      open={Boolean(apiKey)}
      onClose={onClose}
      title={`Revoke "${apiKey?.name}"?`}
      footer={
        <>
          <Button onClick={onClose}>Keep key</Button>
          <Button variant="danger" onClick={revoke} disabled={revoking}>
            {revoking ? 'Revoking…' : 'Revoke key'}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">
        Apps using <code className="font-mono text-small">{apiKey?.maskedKey}</code> will get 401
        responses straight away. Its request history stays in the logs. This cannot be undone.
      </p>
      {error ? (
        <p className="mt-3 text-body text-negative" role="alert">
          {error.message}
        </p>
      ) : null}
    </Dialog>
  );
}
