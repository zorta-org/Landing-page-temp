export const API_BASE = 'https://coming-backend.onrender.com';

export async function api(path, options = {}) {
  if (!API_BASE) return null;
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) || 8000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ...body, ok: false, error: body.error || `HTTP ${res.status}` };
    return body;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function getUserId() {
  const key = 'zorta-anonymous-user-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `builder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export async function submitWaitlist({ email, source = '', suggestions = '', role = '' }) {
  const result = await api('/api/waitlist', {
    method: 'POST',
    body: JSON.stringify({
      email,
      source,
      suggestions,
      role
    })
  });
  return result?.ok ? result : { ok: false, error: result?.error || 'unavailable' };
}
