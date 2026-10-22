// Same-origin by default (the Vite dev server and nginx both proxy /api and /v1);
// set VITE_API_URL when the dashboard is served from a different origin.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const SESSION_STORAGE_KEY = 'tokengate.session';

/** An API failure in the server's { error: { code, message, requestId } } shape. */
export class ApiError extends Error {
  constructor({ status, code, message, requestId, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export function readSessionToken() {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSessionToken(token) {
  try {
    if (token) localStorage.setItem(SESSION_STORAGE_KEY, token);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for the tab.
  }
}

const unauthorizedListeners = new Set();

/** Lets the auth layer sign out when any request reports an expired session. */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function toApiError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error (a proxy page, for example): fall through to a generic message.
  }
  return new ApiError({
    status: response.status,
    code: body?.error?.code ?? 'http_error',
    message: body?.error?.message ?? `Request failed with status ${response.status}`,
    requestId: body?.error?.requestId ?? response.headers.get('x-request-id'),
    details: body?.error?.details,
  });
}

/**
 * fetch() for the TokenGate API: adds the session token, sends JSON, and turns
 * non-2xx responses into ApiError. Returns the raw Response when `raw` is set
 * (streaming, or when the caller needs headers).
 */
export async function apiFetch(path, { method = 'GET', body, headers, signal, raw = false } = {}) {
  const token = readSessionToken();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: 'Could not reach the TokenGate API. Is the server running?',
    });
  }

  if (!response.ok) {
    const apiError = await toApiError(response);
    if (response.status === 401 && token) unauthorizedListeners.forEach((listener) => listener());
    throw apiError;
  }
  if (raw) return response;
  return response.status === 204 ? null : response.json();
}

/** SWR fetcher: the key is the API path. */
export const swrFetcher = (path) => apiFetch(path);
