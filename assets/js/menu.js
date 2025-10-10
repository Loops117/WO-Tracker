// assets/js/menu.js
import { fetchWithAuth } from './supa.js';

export function buildSideMenu(){
  // fire-and-forget so callers don't need to await
  (async () => {
    const aside = await waitForAside();
    const initialIsAdmin = readRoleFromSession() === 'admin' || readCachedAdmin();
    renderMenu(aside, initialIsAdmin);

    // if we don't already know admin, resolve it and patch the menu live
    if (!initialIsAdmin) {
      const role = await resolveRole();
      const isAdmin = role === 'admin';
      if (isAdmin) {
        // cache & re-render with admin
        writeRoleToSession(role);
        cacheAdmin(true);
        renderMenu(aside, true);
      }
    }
  })().catch(() => { /* no-op */});
}

/* ---------------- internals ---------------- */

function readRoleFromSession(){
  try { return window.__sessionCache?.user?.user_metadata?.role || null; }
  catch { return null; }
}
function writeRoleToSession(role){
  try {
    const sess = window.__sessionCache || {};
    const user = sess.user || (sess.user = {});
    user.user_metadata = Object.assign({}, user.user_metadata, { role });
    window.__sessionCache = sess;
  } catch {}
}

/** Wait until #side-menu exists (injectChrome may build it) */
function waitForAside(){
  return new Promise(resolve => {
    const el = document.getElementById('side-menu');
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const el2 = document.getElementById('side-menu');
      if (el2) { obs.disconnect(); resolve(el2); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // safety timeout
    setTimeout(() => { obs.disconnect(); resolve(document.getElementById('side-menu') || document.body); }, 3000);
  });
}

function renderMenu(aside, isAdmin){
  const items = [
    { id: 'home',       label: 'Home',        href: '/pages/dashboard.html' },
    { id: 'inventory',  label: 'Inventory',   href: '/pages/inventory/index.html' },
    { id: 'workorders', label: 'Work Orders', href: '/pages/workorders/index.html' }
  ];
  if (isAdmin) items.push({ id: 'admin', label: 'Admin Page', href: '/pages/admin/index.html' });

  const here = location.pathname;

  function isActive(href){
    if (href.endsWith('/index.html')) {
      const base = href.replace(/index\.html$/, '');
      return here === href || here.startsWith(base);
    }
    const targetFile = href.split('/').pop();
    const hereFile   = here.split('/').pop();
    return targetFile === hereFile;
  }

  aside.innerHTML = items.map(i => {
    const active = isActive(i.href) ? 'active' : '';
    return `<a class="menu-item ${active}" href="${i.href}">${i.label}</a>`;
  }).join('');
}

/** Determine role: prefer RPC is_admin(); fallback to profiles row */
async function resolveRole(){
  const userId = window.__sessionCache?.user?.id;
  if (!userId) return null;

  // 1) Try RPC is_admin() (your RLS already uses it)
  try {
    const r = await fetchWithAuth('/rest/v1/rpc/is_admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (r.ok) {
      const val = await r.json(); // boolean or { is_admin: true } depending on function
      const ok = typeof val === 'boolean' ? val : !!val?.is_admin;
      return ok ? 'admin' : 'worker';
    }
  } catch { /* continue to fallback */ }

  // 2) Fallback: profiles
  try {
    const url = `/rest/v1/profiles?select=role,is_active&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const res = await fetchWithAuth(url);
    if (!res.ok) return null;
    const rows = await res.json();
    const row = rows?.[0];
    if (row?.is_active && (row.role === 'admin' || row.role === 'worker')) {
      return row.role;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---- tiny cache so we don't refetch every page load ---- */
const LS_KEY = 'lb_role_cache_v1';
function cacheAdmin(isAdmin){
  try {
    const uid = window.__sessionCache?.user?.id;
    if (!uid) return;
    const map = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    map[uid] = isAdmin ? 'admin' : 'worker';
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {}
}
function readCachedAdmin(){
  try {
    const uid = window.__sessionCache?.user?.id;
    if (!uid) return false;
    const map = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return map[uid] === 'admin';
  } catch { return false; }
}
