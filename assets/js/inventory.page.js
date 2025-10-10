// assets/js/inventory.page.js
import { injectChrome, getAuthSession } from './layout.js';
import { buildSideMenu } from './menu.js';
import { initClient, fetchWithAuth } from './supa.js';

const supa = initClient();
let ITEMS = [], LOC_BY_SKU = new Map(), BUY_BY_SKU = new Map();

(async function(){
  await injectChrome();
  const s = await getAuthSession();
  if (!s) { location.href = '/'; return; }
  window.__sessionCache = s;
  buildSideMenu();
  wireUi();
  await loadAll();
  render();
})();

function wireUi(){
  const q  = document.getElementById('inv-search');
  const ft = document.getElementById('filter-type');
  const fa = document.getElementById('filter-active');

  q.addEventListener('input', render);
  ft.addEventListener('change', render);
  fa.addEventListener('change', render);

  document.getElementById('add-item-btn').addEventListener('click', openModal);
  document.getElementById('modal-x').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveItem);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
}

async function loadAll(){
  // items
  let res = await fetchWithAuth('/rest/v1/inventory_items?select=sku,description,type,active_status,quantity_on_hand,u_m,cost,price,reorder_point,preferred_vendor,mpn&order=sku');
  ITEMS = res.ok ? await res.json() : [];

  // populate type filter
  const types = [...new Set(ITEMS.map(i => i.type).filter(Boolean))].sort();
  const ft = document.getElementById('filter-type');
  ft.innerHTML = '<option value="">All Types</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');

  // locations (keep only first per sku for list view)
  let rl = await fetchWithAuth('/rest/v1/inventory_locations?select=sku,location,shelf,order_position&order=sku,order_position.asc');
  const locs = rl.ok ? await rl.json() : [];
  LOC_BY_SKU.clear();
  for (const r of locs){
    const k = r.sku;
    if (!LOC_BY_SKU.has(k)) LOC_BY_SKU.set(k, r);
  }

  // purchasing (first row = default if present)
  let rp = await fetchWithAuth('/rest/v1/inventory_purchasing?select=sku,vendor_name,item_url,is_default&order=sku,is_default.desc');
  const buys = rp.ok ? await rp.json() : [];
  BUY_BY_SKU.clear();
  for (const r of buys){
    const k = r.sku;
    if (!BUY_BY_SKU.has(k)) BUY_BY_SKU.set(k, r);
  }
}

function render(){
  const body = document.getElementById('inv-tbody');
  const q  = document.getElementById('inv-search').value.toLowerCase().trim();
  const ft = document.getElementById('filter-type').value;
  const fa = document.getElementById('filter-active').value;

  let rows = ITEMS.filter(i => {
    if (ft && i.type !== ft) return false;
    if (fa && String(i.active_status) !== fa) return false;
    if (q){
      const hay = (i.sku || '') + ' ' + (i.description || '');
      if (!hay.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!rows.length){
    body.innerHTML = '<tr><td colspan="4" class="muted">No matching items.</td></tr>';
    return;
  }

  body.innerHTML = rows.map(i => {
    const loc = LOC_BY_SKU.get(i.sku);
    const locText = loc ? `${loc.location}${loc.shelf ? ' · ' + loc.shelf : ''}` : '<span class="muted">—</span>';
    const buy = BUY_BY_SKU.get(i.sku);
    const buyBtn = buy?.item_url ? `<a href="${buy.item_url}" target="_blank" class="btn small">Buy</a>` : '<span class="muted">—</span>';
    return `<tr data-sku="${i.sku}">
      <td>${escapeHtml(i.sku)}</td>
      <td>${escapeHtml(i.description || '')}</td>
      <td>${locText}</td>
      <td>${buyBtn}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const sku = tr.dataset.sku;
      const item = ITEMS.find(x => x.sku === sku);
      openDrawer(item);
    });
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

// REPLACED: make openDrawer async and call the item card module
async function openDrawer(item){
  const d = document.getElementById('drawer');
  const body = document.getElementById('drawer-body');

  document.getElementById('drawer-title').textContent = item.sku;
  document.getElementById('drawer-sub').textContent   = item.description || '';

  const loc = LOC_BY_SKU.get(item.sku);
  const buy = BUY_BY_SKU.get(item.sku);

  body.innerHTML = `
    <div class="keyvals">
      ${kv('Type', item.type || '—')}
      ${kv('Active', String(item.active_status))}
      ${kv('Qty On Hand', item.quantity_on_hand ?? '—')}
      ${kv('U/M', item.u_m || '—')}
      ${kv('Cost', item.cost ?? '—')}
      ${kv('Price', item.price ?? '—')}
      ${kv('Reorder Point', item.reorder_point ?? '—')}
      ${kv('Preferred Vendor', item.preferred_vendor || '—')}
      ${kv('MPN', item.mpn || '—')}
      ${kv('Location', loc ? (loc.location + (loc.shelf ? ' · ' + loc.shelf : '')) : '—')}
      ${kv('Purchase Link', buy?.item_url ? `<a href="${buy.item_url}" target="_blank">Open</a>` : '—')}
    </div>
  `;

  d.classList.add('open');

  // Inject Locations + Purchasing tables within the item card
  try {
    const mod = await import('/assets/js/itemcard.details.js?v=' + Date.now()); // absolute path + cache-buster
    if (mod && typeof mod.enhanceItemCard === 'function') {
      await mod.enhanceItemCard({
        sku: item.sku,
        container: body,
        fetchWithAuth,
        tables: { locations: 'inventory_locations', purchasing: 'inventory_purchasing' },
        onChanged: async () => { try { await loadAll(); render(); } catch {} }
      });
    }
  } catch (e) {
    console.warn('itemcard module failed to load:', e);
  }
}

function kv(k, v){
  return `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
}

function openModal(){
  document.getElementById('modal-backdrop').hidden = false;
  document.getElementById('modal').hidden = false;
}

function closeModal(){
  document.getElementById('modal-backdrop').hidden = true;
  document.getElementById('modal').hidden = true;
}

async function saveItem(){
  const sku = document.getElementById('new-sku').value.trim();
  if (!sku){ alert('SKU is required.'); return; }
  const payload = {
    sku,
    type: document.getElementById('new-type').value.trim() || null,
    description: document.getElementById('new-desc').value.trim() || null,
    active_status: document.getElementById('new-active').value === 'true',
    u_m: document.getElementById('new-um').value.trim() || null,
    cost:  parseNum(document.getElementById('new-cost').value),
    price: parseNum(document.getElementById('new-price').value),
    reorder_point: parseNum(document.getElementById('new-rp').value)
  };
  try{
    // FIXED: endpoint is lowercase (Supabase REST is case-sensitive)
    const res = await fetchWithAuth('/rest/v1/inventory_items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    if (!res.ok){ throw new Error(await res.text()); }
    closeModal();
    await loadAll();
    render();
  } catch(e){
    alert('Save failed: ' + (e.message || e));
  }
}

function parseNum(v){
  const s = (v || '').trim();
  if (!s) return null;
  const n = Number(s.replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

// NOTE: removed previous auto-wrapper/hook. We call the module directly inside openDrawer.
