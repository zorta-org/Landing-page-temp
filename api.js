/* ONE LINE TO EDIT AFTER DEPLOYING THE BACKEND */
export const API_BASE = "https://coming-backend.onrender.com/";

export async function api(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null; // local-only fallback: never break the arcade if API is unavailable
  }
}

export function getUserId() {
  const key = "zorta-anonymous-user-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto?.randomUUID?.() || `builder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}


export async function submitWaitlist(email) {
  try {
    const res = await fetch(`${API_BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, ...body };
    return { ok: false, ...body };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
