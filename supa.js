// assets/js/supa.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './app.config.js';

let _token = null;
let _client = null;

export function initClient() {
  if (!_client) {
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const existing = localStorage.getItem('sb_access_token');
    if (existing) _token = existing;
  }
  return _client;
}

export function setSessionToken(token) {
  _token = token;
  if (token) localStorage.setItem('sb_access_token', token);
  else localStorage.removeItem('sb_access_token');
}

export function getSessionToken() {
  return _token;
}

export function fetchWithAuth(path, opts = {}) {
  const headers = Object.assign({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${_token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  }, opts.headers || {});
  return fetch(`${SUPABASE_URL}${path}`, { ...opts, headers });
}

export async function callRpc(name, args) {
  const res = await fetchWithAuth(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args || {})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
