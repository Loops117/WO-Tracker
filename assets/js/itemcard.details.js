console.info('[itemcard.details] module loaded');

// assets/js/itemcard.details.js
// Usage (in your openDrawer after rendering the drawer):
//   import { enhanceItemCard } from './assets/js/itemcard.details.js';
//   enhanceItemCard({
//     sku: item.sku,
//     container: document.getElementById('drawer-body'),
//     fetchWithAuth, // your existing helper
//     tables: { locations: 'inventory_locations', purchasing: 'inventory_purchasing' }, // optional override
//     onChanged: async () => { if (typeof loadAll === 'function') { try { await loadAll(); } catch {} } } // optional
//   });

export async function enhanceItemCard(opts){
  const cfg = normalizeOptions(opts);
  if (!cfg) return;

  // Remove prior instance in this container
  cfg.container.querySelector('[data-ic-root]')?.remove();

  // Root UI
  const root = document.createElement('div');
  root.dataset.icRoot = '1';
  root.innerHTML = `
    <div class="drawer-actions" style="display:flex;gap:.5rem;margin:10px 0;">
      <button class="btn small" data-ic-add-loc>+ Add Location</button>
      <button class="btn small" data-ic-add-buy>+ Add Purchasing</button>
    </div>

    <h4 style="margin:.5rem 0">Locations</h4>
    <div class="table-wrap" style="max-height:180px">
      <table class="table">
        <thead><tr><th>Location</th><th>Shelf</th><th>Order</th><th>Actions</th></tr></thead>
        <tbody data-ic-loc-body><tr><td colspan="4" class="muted">Loading…</td></tr></tbody>
      </table>
    </div>

    <h4 style="margin:.75rem 0 .5rem">Purchasing</h4>
    <div class="table-wrap" style="max-height:180px">
      <table class="table">
        <thead><tr><th>Vendor</th><th>Link</th><th>Default</th><th>Actions</th></tr></thead>
        <tbody data-ic-buy-body><tr><td colspan="4" class="muted">Loading…</td></tr></tbody>
      </table>
    </div>
  `;
  cfg.container.appendChild(root);

  // Add buttons
  root.querySelector('[data-ic-add-loc]')?.addEventListener('click', () => showLocForm(cfg));
  root.querySelector('[data-ic-add-buy]')?.addEventListener('click', () => showBuyForm(cfg));

  // Delegated actions for tables
  const locBody = root.querySelector('[data-ic-loc-body]');
  const buyBody = root.querySelector('[data-ic-buy-body]');
  locBody.addEventListener('click', ev => handleLocClick(ev, cfg));
  buyBody.addEventListener('click', ev => handleBuyClick(ev, cfg));

  // Initial load
  await refreshTables(cfg);
}

/* ---------- internals ---------- */

function normalizeOptions(o){
  if (!o || !o.sku || !o.container || !o.fetchWithAuth) return null;
  return {
    sku: String(o.sku),
    container: o.container,
    fetchWithAuth: o.fetchWithAuth,
    tables: Object.assign({ locations: 'inventory_locations', purchasing: 'inventory_purchasing' }, o.tables || {}),
    onChanged: typeof o.onChanged === 'function' ? o.onChanged : async ()=>{},
  };
}
function esc(s){ s = s == null ? '' : String(s); return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m])); }
async function api(cfg, path, opts){ const r = await cfg.fetchWithAuth(path, opts || {}); if (!r.ok) throw new Error(await r.text()); return r; }
async function jget(cfg, path){ const r = await api(cfg, path); return r.json(); }
function numOrNull(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }

async function refreshTables(cfg){
  await Promise.all([renderLocations(cfg), renderPurchasing(cfg)]);
}

/* ----- Locations ----- */

async function renderLocations(cfg){
  const body = cfg.container.querySelector('[data-ic-loc-body]');
  if (!body) return;
  try {
    const rows = await jget(cfg, `/rest/v1/${cfg.tables.locations}?select=sku,location,shelf,order_position&sku=eq.${encodeURIComponent(cfg.sku)}`);
    if (!rows.length){
      body.innerHTML = `<tr><td colspan="4" class="muted">No locations yet</td></tr>`;
      return;
    }
    rows.sort((a,b)=> (a.order_position||0) - (b.order_position||0));
    body.innerHTML = rows.map(l => `
      <tr data-kind="loc" data-sku="${esc(l.sku)}" data-location="${esc(l.location||'')}" data-shelf="${esc(l.shelf||'')}" data-order="${l.order_position==null?'':String(l.order_position)}">
        <td>${esc(l.location||'—')}</td>
        <td>${esc(l.shelf||'—')}</td>
        <td>${l.order_position==null?'—':String(l.order_position)}</td>
        <td style="white-space:nowrap">
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="del">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch(e){
    console.warn('locations load failed', e);
    body.innerHTML = `<tr><td colspan="4" class="muted">Failed to load locations</td></tr>`;
  }
}

function handleLocClick(ev, cfg){
  const tr = ev.target.closest('tr[data-kind="loc"]'); if (!tr) return;
  const act = ev.target.closest('button[data-act]')?.dataset.act; if (!act) return;

  const sku = tr.dataset.sku;
  const loc = tr.dataset.location || '';
  const shelf = tr.dataset.shelf || '';
  const order = tr.dataset.order || '';

  if (act === 'del'){
    if (!confirm('Delete this location?')) return;
    const q = [`sku=eq.${encodeURIComponent(sku)}`, `location=eq.${encodeURIComponent(loc)}`];
    if (shelf) q.push(`shelf=eq.${encodeURIComponent(shelf)}`);
    if (order !== '') q.push(`order_position=eq.${encodeURIComponent(order)}`);
    api(cfg, `/rest/v1/${cfg.tables.locations}?`+q.join('&'), { method:'DELETE', headers:{'Prefer':'return=minimal'} })
      .then(()=> refreshTables(cfg).then(cfg.onChanged))
      .catch(e=> alert('Delete failed: '+(e && e.message || e)));
    return;
  }

  if (act === 'edit'){
    const wrap = inlineFormShell(tr);
    wrap.innerHTML = `
      <div class="grid-2">
        <label>Location <input id="loc-location" class="input" value="${esc(loc)}"></label>
        <label>Shelf <input id="loc-shelf" class="input" value="${esc(shelf)}"></label>
        <label>Order Position <input id="loc-order" class="input" type="number" value="${esc(order)}"></label>
      </div>
    `;
    wireInlineForm(wrap, async ()=>{
      const payload = {
        location: wrap.querySelector('#loc-location').value.trim() || null,
        shelf: wrap.querySelector('#loc-shelf').value.trim() || null,
        order_position: numOrNull(wrap.querySelector('#loc-order').value),
      };
      const q = [`sku=eq.${encodeURIComponent(sku)}`, `location=eq.${encodeURIComponent(loc)}`];
      if (shelf) q.push(`shelf=eq.${encodeURIComponent(shelf)}`);
      if (order !== '') q.push(`order_position=eq.${encodeURIComponent(order)}`);
      await api(cfg, `/rest/v1/${cfg.tables.locations}?`+q.join('&'), {
        method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify(payload)
      });
      await refreshTables(cfg); await cfg.onChanged();
    });
  }
}

function showLocForm(cfg){
  const host = document.createElement('div');
  host.className = 'card'; host.style.margin = '.5rem 0'; host.style.padding = '.5rem';
  host.innerHTML = `
    <div class="grid-2">
      <label>Location <input id="loc-location" class="input" placeholder="Aisle-Row"></label>
      <label>Shelf <input id="loc-shelf" class="input" placeholder="Top/Bottom"></label>
      <label>Order Position <input id="loc-order" class="input" type="number" placeholder="0"></label>
    </div>
  `;
  cfg.container.insertBefore(host, cfg.container.querySelector('[data-ic-root]'));
  wireInlineForm(host, async ()=>{
    const payload = {
      sku: cfg.sku,
      location: host.querySelector('#loc-location').value.trim() || null,
      shelf: host.querySelector('#loc-shelf').value.trim() || null,
      order_position: numOrNull(host.querySelector('#loc-order').value),
    };
    await api(cfg, `/rest/v1/${cfg.tables.locations}`, {
      method:'POST', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify(payload)
    });
    await refreshTables(cfg); await cfg.onChanged();
  });
}

/* ----- Purchasing ----- */

async function renderPurchasing(cfg){
  const body = cfg.container.querySelector('[data-ic-buy-body]');
  if (!body) return;
  try {
    const rows = await jget(cfg, `/rest/v1/${cfg.tables.purchasing}?select=sku,vendor_name,item_url,is_default&sku=eq.${encodeURIComponent(cfg.sku)}`);
    if (!rows.length){
      body.innerHTML = `<tr><td colspan="4" class="muted">No vendors yet</td></tr>`;
      return;
    }
    rows.sort((a,b)=> ((b.is_default?1:0) - (a.is_default?1:0)) || String(a.vendor_name||'').localeCompare(b.vendor_name||''));
    body.innerHTML = rows.map(p => `
      <tr data-kind="buy" data-sku="${esc(p.sku)}" data-vendor="${esc(p.vendor_name||'')}" data-url="${esc(p.item_url||'')}">
        <td>${esc(p.vendor_name||'—')}</td>
        <td>${p.item_url ? `<a class="btn small" target="_blank" href="${esc(p.item_url)}">Open</a>` : '—'}</td>
        <td>${p.is_default ? 'Yes' : 'No'}</td>
        <td style="white-space:nowrap">
          <button class="btn small" data-act="default" ${p.is_default?'disabled':''}>Make Default</button>
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="del">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch(e){
    console.warn('purchasing load failed', e);
    body.innerHTML = `<tr><td colspan="4" class="muted">Failed to load vendors</td></tr>`;
  }
}

function handleBuyClick(ev, cfg){
  const tr = ev.target.closest('tr[data-kind="buy"]'); if (!tr) return;
  const act = ev.target.closest('button[data-act]')?.dataset.act; if (!act) return;

  const sku = tr.dataset.sku;
  const vendor = tr.dataset.vendor || '';
  const url = tr.dataset.url || '';

  if (act === 'del'){
    if (!confirm('Delete this vendor row?')) return;
    const q = [`sku=eq.${encodeURIComponent(sku)}`, `vendor_name=eq.${encodeURIComponent(vendor)}`];
    if (url) q.push(`item_url=eq.${encodeURIComponent(url)}`);
    api(cfg, `/rest/v1/${cfg.tables.purchasing}?`+q.join('&'), { method:'DELETE', headers:{'Prefer':'return=minimal'} })
      .then(()=> refreshTables(cfg).then(cfg.onChanged))
      .catch(e=> alert('Delete failed: '+(e && e.message || e)));
    return;
  }

  if (act === 'default'){
    (async ()=>{
      // Demote all vendors for this SKU, then promote the selected one
      await api(cfg, `/rest/v1/${cfg.tables.purchasing}?sku=eq.${encodeURIComponent(sku)}`, {
        method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify({ is_default:false })
      });
      const q = [`sku=eq.${encodeURIComponent(sku)}`, `vendor_name=eq.${encodeURIComponent(vendor)}`];
      if (url) q.push(`item_url=eq.${encodeURIComponent(url)}`);
      await api(cfg, `/rest/v1/${cfg.tables.purchasing}?`+q.join('&'), {
        method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify({ is_default:true })
      });
      await refreshTables(cfg); await cfg.onChanged();
    })().catch(e=> alert('Failed to set default: '+(e && e.message || e)));
    return;
  }

  if (act === 'edit'){
    const wrap = inlineFormShell(tr);
    const isDef = (tr.children[2].textContent || '').trim().toLowerCase() === 'yes';
    wrap.innerHTML = `
      <div class="grid-2">
        <label>Vendor Name <input id="buy-vendor" class="input" value="${esc(vendor)}"></label>
        <label>Item URL <input id="buy-url" class="input" value="${esc(url)}"></label>
        <label>Default Vendor?
          <select id="buy-default" class="input"><option value="true">Yes</option><option value="false">No</option></select>
        </label>
      </div>
    `;
    wrap.querySelector('#buy-default').value = isDef ? 'true' : 'false';
    wireInlineForm(wrap, async ()=>{
      const isDefNew = wrap.querySelector('#buy-default').value === 'true';
      const payload = {
        vendor_name: wrap.querySelector('#buy-vendor').value.trim() || null,
        item_url: wrap.querySelector('#buy-url').value.trim() || null,
        is_default: isDefNew,
      };
      const q = [`sku=eq.${encodeURIComponent(sku)}`, `vendor_name=eq.${encodeURIComponent(vendor)}`];
      if (url) q.push(`item_url=eq.${encodeURIComponent(url)}`);
      await api(cfg, `/rest/v1/${cfg.tables.purchasing}?`+q.join('&'), {
        method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify(payload)
      });
      if (isDefNew){
        await api(cfg, `/rest/v1/${cfg.tables.purchasing}?sku=eq.${encodeURIComponent(sku)}&vendor_name=neq.${encodeURIComponent(payload.vendor_name || '')}`, {
          method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify({ is_default:false })
        });
      }
      await refreshTables(cfg); await cfg.onChanged();
    });
  }
}

// NEW: Add Purchasing form
function showBuyForm(cfg){
  const host = document.createElement('div');
  host.className = 'card'; host.style.margin = '.5rem 0'; host.style.padding = '.5rem';
  host.innerHTML = `
    <div class="grid-2">
      <label>Vendor Name <input id="buy-vendor" class="input" placeholder="Acme Co."></label>
      <label>Item URL <input id="buy-url" class="input" placeholder="https://..."></label>
      <label>Default Vendor?
        <select id="buy-default" class="input">
          <option value="true">Yes</option>
          <option value="false" selected>No</option>
        </select>
      </label>
    </div>
  `;
  // Insert before our root so the form appears above the tables
  cfg.container.insertBefore(host, cfg.container.querySelector('[data-ic-root]'));
  wireInlineForm(host, async ()=>{
    const isDef = host.querySelector('#buy-default').value === 'true';
    const payload = {
      sku: cfg.sku,
      vendor_name: host.querySelector('#buy-vendor').value.trim() || null,
      item_url: host.querySelector('#buy-url').value.trim() || null,
      is_default: isDef
    };
    // Create the row
    await api(cfg, `/rest/v1/${cfg.tables.purchasing}`, {
      method:'POST', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify(payload)
    });
    // If set default, demote all others for this SKU
    if (isDef){
      await api(cfg, `/rest/v1/${cfg.tables.purchasing}?sku=eq.${encodeURIComponent(cfg.sku)}&vendor_name=neq.${encodeURIComponent(payload.vendor_name || '')}`, {
        method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify({ is_default:false })
      });
    }
    await refreshTables(cfg); await cfg.onChanged();
  });
}

/* ----- tiny UI helpers ----- */

function inlineFormShell(afterTr){
  const table = afterTr.closest('table');
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.margin = '.5rem 0';
  wrap.style.padding = '.5rem';
  table.parentElement.before(wrap);
  return wrap;
}

function wireInlineForm(wrap, onSave){
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'flex-end';
  row.style.gap = '.5rem';
  row.style.marginTop = '.5rem';
  row.innerHTML = `<button class="btn" data-ic-cancel>Cancel</button><button class="btn-cta" data-ic-save>Save</button>`;
  wrap.appendChild(row);
  wrap.querySelector('[data-ic-cancel]').onclick = () => wrap.remove();
  wrap.querySelector('[data-ic-save]').onclick = async ()=>{
    try { await onSave(); wrap.remove(); } catch(e){ alert((e && e.message) || e); }
  };
}
