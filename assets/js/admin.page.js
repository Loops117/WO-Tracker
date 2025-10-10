// /pages/admin/admin.page.js
import { injectChrome, getAuthSession } from '../../assets/js/layout.js';
import { buildSideMenu } from '../../assets/js/menu.js';
import { initClient, fetchWithAuth } from '../../assets/js/supa.js';

const supa = initClient();

(async function init() {
  await injectChrome();
  const s = await getAuthSession();
  if (!s) { location.href = '/'; return; }
  window.__sessionCache = s;

  buildSideMenu();

  const ok = await isAdminMulti();
  if (!ok) { renderForbidden(); return; }

  wireSubnav();
  selectTab('Work Orders'); // default
})();

async function isAdminMulti() {
  try {
    const metaRole = window.__sessionCache?.user?.user_metadata?.role;
    if (metaRole === 'admin') return true;

    try {
      const r = await fetchWithAuth('/rest/v1/rpc/is_admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      if (r.ok) {
        const val = await r.json();
        const isAdmin = typeof val === 'boolean' ? val : !!val?.is_admin;
        if (isAdmin) return true;
      }
    } catch {}

    const userId = window.__sessionCache?.user?.id;
    if (!userId) return false;
    const url = `/rest/v1/profiles?select=role,is_active&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`;
    const res = await fetchWithAuth(url);
    if (!res.ok) return false;
    const row = (await res.json())?.[0];
    return !!row && row.role === 'admin' && row.is_active === true;
  } catch { return false; }
}

function renderForbidden() {
  const sub = document.getElementById('admin-subnav');
  const view = document.getElementById('admin-view');
  if (sub) sub.style.display = 'none';
  if (view) {
    view.innerHTML = `
      <div class="card" style="margin:1rem; padding:1rem;">
        <h2 style="margin:0 0 .5rem;">403 – Admins Only</h2>
        <p>You don't have permission to view this page.</p>
      </div>
    `;
  }
}

function wireSubnav() {
  const sub = document.getElementById('admin-subnav');
  if (!sub) return;

  sub.style.display = 'flex';
  sub.style.gap = '.5rem';
  sub.style.margin = '10px 12px';

  sub.innerHTML = `
    <button class="btn" data-tab="Tree">Tree</button>
    <button class="btn" data-tab="Work Orders">Work Orders</button>
    <button class="btn" data-tab="Users">Users</button>
  `;

  sub.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    selectTab(btn.dataset.tab);
  });
}

async function selectTab(name) {
  const sub = document.getElementById('admin-subnav');
  sub?.querySelectorAll('button[data-tab]').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.style.fontWeight = on ? '600' : '';
  });

  await loadSubPage(name);
}

/* ------- load subpages from the SAME FOLDER as index.html ------- */
async function loadSubPage(name) {
  const view = document.getElementById('admin-view');
  if (!view) return;

  const slug = name.toLowerCase().replace(/\s+/g, '');

  // HTML can be absolute too for consistency
  const htmlPath = `/pages/admin/subpages/${slug}.html`;
  const jsPath   = `/pages/admin/subpages/${slug}.page.js`;

  // 1) load HTML
  try {
    const res = await fetch(htmlPath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    view.innerHTML = await res.text();
  } catch (e) {
    view.innerHTML = `
      <div class="card" style="margin:12px; padding:12px;">
        <h3 style="margin:0 0 8px;">${name}</h3>
        <p class="muted">Failed to load ${htmlPath}: ${e.message || e}</p>
      </div>
    `;
    return;
  }

  // 2) load/init JS (absolute path so it resolves correctly)
  try {
    const mod = await import(`${jsPath}?v=${Date.now()}`);
    if (mod && typeof mod.init === 'function') {
      await mod.init({
        mount: view,
        fetchWithAuth,
        session: window.__sessionCache
      });
    }
  } catch (e) {
    console.warn(`[admin] subpage script failed: ${jsPath}`, e);
  }
}

