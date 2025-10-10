// /pages/admin/subpages/users.page.js
// Users list (name/email/role) + Add/Edit/Delete
// Admins: supply real email; Workers: auto email first.last@LBInventory.com

export async function init({ mount, fetchWithAuth }) {
  // ---- scope ALL lookups to the injected subpage root (mount) ----
  const els = {
    tbody:     mount.querySelector('#users-tbody'),
    search:    mount.querySelector('#users-search'),
    btnNew:    mount.querySelector('#users-new'),

    mBackdrop: mount.querySelector('#users-modal-backdrop'),
    mBox:      mount.querySelector('#users-modal'),
    mTitle:    mount.querySelector('#users-modal-title'),
    mCancel:   mount.querySelector('#users-cancel'),
    mSave:     mount.querySelector('#users-save'),

    first:     mount.querySelector('#u-first'),
    last:      mount.querySelector('#u-last'),
    roleAdmin: mount.querySelector('#u-role-admin'),
    emailWrap: mount.querySelector('#u-email-wrap'),
    email:     mount.querySelector('#u-email'),
    autoEmail: mount.querySelector('#u-auto-email'),
  };

  // Validate required elements early
  const requiredIds = [
    ['#users-tbody', els.tbody],
    ['#users-search', els.search],
    ['#users-new', els.btnNew],
    ['#users-modal-backdrop', els.mBackdrop],
    ['#users-modal', els.mBox],
    ['#users-modal-title', els.mTitle],
    ['#users-cancel', els.mCancel],
    ['#users-save', els.mSave],
    ['#u-first', els.first],
    ['#u-last', els.last],
    ['#u-role-admin', els.roleAdmin],
    ['#u-email-wrap', els.emailWrap],
    ['#u-email', els.email],
    ['#u-auto-email', els.autoEmail],
  ];
  const missing = requiredIds.filter(([id, el]) => !el).map(([id]) => id);
  if (missing.length) {
    console.warn('[users] Missing elements in users.html:', missing.join(', '));
    // Render a friendly message in-place so the page doesn’t break silently
    if (els.tbody) {
      els.tbody.innerHTML = `<tr><td colspan="4" class="muted">Users subpage markup is incomplete. Missing: ${missing.join(', ')}</td></tr>`;
    }
    return;
  }

  let ROWS = [];
  let editingId = null;

  // ---------- load / render ----------
  const load = async () => {
    try {
      // Only active users
      const r = await fetchWithAuth('/rest/v1/profiles?select=id,display_name,email,role,is_active&is_active=is.true&order=display_name');
      ROWS = r.ok ? await r.json() : [];
      render();
    } catch (e) {
      els.tbody.innerHTML = `<tr><td colspan="4" class="muted">Failed to load: ${esc(e.message || e)}</td></tr>`;
    }
  };

  const render = () => {
    const q = (els.search.value || '').toLowerCase().trim();
    const list = ROWS.filter(r => {
      const hay = `${r.display_name || ''} ${r.email || ''} ${r.role || ''}`.toLowerCase();
      return !q || hay.includes(q);
    });
    if (!list.length) {
      els.tbody.innerHTML = `<tr><td colspan="4" class="muted">No users found</td></tr>`;
      return;
    }
    els.tbody.innerHTML = list.map(r => `
      <tr data-id="${esc(r.id)}">
        <td>${esc(r.display_name || '')}</td>
        <td>${esc(r.email || '')}</td>
        <td>${esc(r.role || '')}</td>
        <td style="white-space:nowrap">
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="del">Delete</button>
        </td>
      </tr>
    `).join('');
  };

  // ---------- events ----------
  els.search.addEventListener('input', render);
  els.btnNew.addEventListener('click', () => openModal());

  mount.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const tr = btn.closest('tr[data-id]');
    const id = tr?.dataset.id;
    const row = id ? ROWS.find(r => r.id === id) : null;

    if (act === 'edit') { openModal(row); return; }

    if (act === 'del') {
      if (!confirm('Delete this user?')) return;
      try {
        const res = await fetchWithAuth(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
          method:'DELETE', headers:{'Prefer':'return=minimal'}
        });
        if (!res.ok && res.status !== 204) {
          await fetchWithAuth(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
            method:'PATCH',
            headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
            body: JSON.stringify({ is_active:false })
          });
        }
      } catch {
        await fetchWithAuth(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
          method:'PATCH',
          headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
          body: JSON.stringify({ is_active:false })
        });
      }
      await load();
      return;
    }
  });

  // modal events
  els.mCancel.addEventListener('click', closeModal);
  els.mBackdrop.addEventListener('click', closeModal);
  els.mSave.addEventListener('click', saveModal);

  // role toggle → show/hide email input & show auto email preview
  els.roleAdmin.addEventListener('change', syncEmailUi);
  els.first.addEventListener('input', syncEmailUi);
  els.last.addEventListener('input', syncEmailUi);

  await load();

  // ---------- modal helpers ----------
  function openModal(row) {
    editingId = row?.id || null;
    els.mTitle.textContent = editingId ? 'Edit User' : 'Add User';

    const { first, last } = splitDisplayName(row?.display_name || '');
    els.first.value = first;
    els.last.value  = last;

    const isAdmin = (row?.role || '').toLowerCase() === 'admin';
    els.roleAdmin.checked = isAdmin;

    els.email.value = row?.email || '';

    syncEmailUi();

    show(els.mBackdrop, true);
    show(els.mBox, true);
    els.first.focus();
  }

  function closeModal(){ show(els.mBackdrop, false); show(els.mBox, false); editingId = null; }

  async function saveModal(){
    const payload = buildPayloadFromModal();
    if (!payload) return;

    try {
      if (editingId) {
        await fetchWithAuth(`/rest/v1/profiles?id=eq.${encodeURIComponent(editingId)}`, {
          method:'PATCH',
          headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
          body: JSON.stringify(payload)
        });
      } else {
        await fetchWithAuth('/rest/v1/profiles', {
          method:'POST',
          headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
          body: JSON.stringify(payload)
        });
      }
      closeModal(); await load();
    } catch (e) {
      alert('Save failed: ' + (e && e.message || e));
    }
  }

  function buildPayloadFromModal(){
    const first = (els.first.value || '').trim();
    const last  = (els.last.value || '').trim();
    if (!first || !last){ alert('First and Last name are required.'); return null; }

    const display_name = `${first} ${last}`.trim();
    const role = els.roleAdmin.checked ? 'admin' : 'worker';

    let email = null;
    if (role === 'admin') {
      const raw = (els.email.value || '').trim();
      if (!raw){ alert('Email is required for Admins.'); return null; }
      email = raw;
    } else {
      email = genAutoEmail(first, last);
    }

    return {
      display_name,
      role,
      email,
      is_active: true
    };
  }

  // ---------- helpers ----------
  function syncEmailUi(){
    const isAdmin = els.roleAdmin.checked;
    els.emailWrap.style.display = isAdmin ? '' : 'none';
    if (!isAdmin) {
      const f = (els.first.value || '').trim();
      const l = (els.last.value || '').trim();
      const e = f && l ? genAutoEmail(f, l) : '';
      els.autoEmail.textContent = e ? `Auto email: ${e}` : '';
      els.autoEmail.style.display = e ? '' : 'none';
    } else {
      els.autoEmail.style.display = 'none';
    }
  }

  function genAutoEmail(first, last){
    const f = slugName(first), l = slugName(last);
    if (!f || !l) return '';
    return `${f}.${l}@LBInventory.com`;
    // If you prefer lowercase domain and dot-separated, it's already done.
  }

  function slugName(s){
    return String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'')   // strip accents
      .replace(/[^a-zA-Z0-9]+/g,'')     // keep letters/digits
      .toLowerCase();
  }

  function splitDisplayName(s){
    const parts = String(s).trim().split(/\s+/);
    if (parts.length <= 1) return { first: parts[0] || '', last: '' };
    return { first: parts.slice(0, -1).join(' '), last: parts.slice(-1).join('') };
  }

  function show(el, on){ if (!el) return; el.hidden = !on; }
  function esc(s){ s = s == null ? '' : String(s); return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m])); }
}
