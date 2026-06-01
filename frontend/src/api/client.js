/**
 * Centralized API client with authentication and error handling.
 */

// ── Config ─────────────────────────────────────────────────
const API_BASE = '/api';

// ── Auth Helper ────────────────────────────────────────────
function authHeaders(extra = {}) {
  const key = sessionStorage.getItem('ash_api_key');
  const headers = { ...extra };
  if (key) headers['X-API-Key'] = key;
  return headers;
}

// ── API Client ─────────────────────────────────────────────
export const api = {
  async get(path) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
        let errStr = `API Error: ${res.status}`;
        try {
            const errData = await res.json();
            if (errData.detail) errStr = errData.detail;
        } catch (e) {}
        throw new Error(errStr);
    }
    return res.json();
  },

  async postFile(path, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async postDownload(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename=(.+)/);
    const filename = match ? match[1] : 'ai_strategy_hub_report';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  async patch(path) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  async delete(path) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
};

// Backward compatibility: make api globally available
window.api = api;
