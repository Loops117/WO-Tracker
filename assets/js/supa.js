// assets/js/supa.js
// Backward-compatible Supabase helper:
// - Exports: initClient, supa, fetchWithAuth, getAuthToken (and default supa)
// - Persists session + auto refresh
// - Always sends the user access token (falls back to anon only if not signed in)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./app.config.js";

let __client;

export function initClient() {
  if (!__client) {
    __client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return __client;
}

export const supa = initClient();

function getProjectRef() {
  try { return new URL(SUPABASE_URL).host.split('.')[0]; } catch { return ''; }
}

function getAccessTokenFromStorage() {
  const key = `sb-${getProjectRef()}-auth-token`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj?.currentSession?.access_token || obj?.access_token || null;
  } catch {
    return null;
  }
}

export async function getAuthToken() {
  try {
    const { data: { session } } = await supa.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {}
  return getAccessTokenFromStorage() || SUPABASE_ANON_KEY;
}

export async function fetchWithAuth(path, opts = {}) {
  const token = await getAuthToken();
  const headers = Object.assign({
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }, opts.headers || {});
  const url = `${SUPABASE_URL}${path}`;
  return fetch(url, { ...opts, headers });
}

export async function rpc(name, args) {
  const res = await fetchWithAuth(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default supa;
