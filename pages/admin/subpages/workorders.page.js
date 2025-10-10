// /pages/admin/subpages/workorders.page.js
// - procedures_needed is plain text (e.g., "1.B.2")
// - HH:MM:SS time controls + auto-calc total
// - No Assign button
export async function init({ mount, fetchWithAuth }) {
  const els = {
    tbody:  mount.querySelector('#wo-tbody'),
    search: mount.querySelector('#wo-search'),
    btnNew: mount.querySelector('#wo-new'),

    mBackdrop: mount.ownerDocument.getElementById('wo-modal-backdrop'),
    mBox:      mount.ownerDocument.getElementById('wo-modal'),
    mTitle:    mount.ownerDocument.getElementById('wo-modal-title'),
    mCancel:   mount.ownerDocument.getElementById('wo-modal-cancel'),
    mSave:     mount.ownerDocument.getElementById('wo-modal-save'),

    name:   mount.ownerDocument.getElementById('wo-name'),
    qty:    mount.ownerDocument.getElementById('wo-qty'),

    stdH:   mount.ownerDocument.getElementById('wo-std-h'),
    stdM:   mount.ownerDocument.getElementById('wo-std-m'),
    stdS:   mount.ownerDocument.getElementById('wo-std-s'),

    totH:   mount.ownerDocument.getElementById('wo-total-h'),
    totM:   mount.ownerDocument.getElementById('wo-total-m'),
    totS:   mount.ownerDocument.getElementById('wo-total-s'),

    totalAuto:  mount.ownerDocument.getElementById('wo-total-auto'),
    proc:   mount.ownerDocument.getElementById('wo-proc'),

    steps:  Array.from({length:10}, (_,i)=> mount.ownerDocument.getElementById(`wo-step${i+1}`)),
    tip:    mount.ownerDocument.getElementById('wo-modal-tip')
  };

  let ROWS = [];
  let editingId = null;

  // -------- load / render --------
  const load = async () => {
    try {
      const r = await fetchWithAuth('/rest/v1/wo_tabs?select=id,work_order_name,qty,standard_time_each,total_standard_time,procedures_needed,step1,step2,step3,step4,step5,step6,step7,step8,step9,step10&order=work_order_name');
      ROWS = r.ok ? await r.json() : [];
      render();
    } catch (e) {
      els.tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load: ${esc(e.message || e)}</td></tr>`;
    }
  };

  const render = () => {
    const q = (els.search.value || '').toLowerCase().trim();
    const list = ROWS.filter(r => !q || (r.work_order_name || '').toLowerCase().includes(q));
    if (!list.length) {
      els.tbody.innerHTML = `<tr><td colspan="6" class="muted">No templates found</td></tr>`;
      return;
    }
    els.tbody.innerHTML = list.map(r => `
      <tr data-id="${r.id}">
        <td>${esc(r.work_order_name)}</td>
        <td>${r.qty ?? '—'}</td>
        <td>${esc(formatHMS(parseIntervalToSeconds(r.standard_time_each)))}</td>
        <td>${esc(formatHMS(parseIntervalToSeconds(r.total_standard_time)))}</td>
        <td>${esc(r.procedures_needed ?? '')}</td>
        <td style="white-space:nowrap">
          <button class="btn small" data-act="edit">Edit</button>
          <button class="btn small" data-act="dup">Duplicate</button>
          <button class="btn small" data-act="del">Delete</button>
        </td>
      </tr>
    `).join('');
  };

  // -------- events --------
  els.search.addEventListener('input', render);
  els.btnNew.addEventListener('click', () => openModal());

  mount.addEventListener('click', async (e) => {
    const act = e.target.closest('button[data-act]')?.dataset.act;
    const tr = e.target.closest('tr[data-id]');
    if (!act || !tr) return;
    const id = tr.dataset.id;
    const row = ROWS.find(r => r.id === id);

    if (act === 'edit') { openModal(row); return; }
    if (act === 'dup')  { await duplicateRow(row); await load(); return; }

    if (act === 'del') {
      if (!confirm('Delete this template?')) return;
      await fetchWithAuth(`/rest/v1/wo_tabs?id=eq.${encodeURIComponent(id)}`, {
        method:'DELETE', headers:{'Prefer':'return=minimal'}
      });
      await load();
      return;
    }
  });

  // time and auto-calc
  [els.qty, els.stdH, els.stdM, els.stdS, els.totalAuto].forEach(el => {
    el?.addEventListener('input', maybeRecalcTotal);
  });

  // modal buttons
  els.mCancel.addEventListener('click', closeModal);
  els.mBackdrop.addEventListener('click', closeModal);
  els.mSave.addEventListener('click', saveModal);

  await load();

  // -------- modal helpers --------
  function openModal(row) {
    editingId = row?.id || null;
    els.mTitle.textContent = editingId ? 'Edit Template' : 'New Template';

    els.name.value = row?.work_order_name || '';
    els.qty.value  = String(row?.qty ?? 1);

    // times
    setHMS(els.stdH, els.stdM, els.stdS, parseIntervalToSeconds(row?.standard_time_each));
    setHMS(els.totH, els.totM, els.totS, parseIntervalToSeconds(row?.total_standard_time));
    els.totalAuto.checked = true;

    // steps first
    const stepVals = [row?.step1,row?.step2,row?.step3,row?.step4,row?.step5,row?.step6,row?.step7,row?.step8,row?.step9,row?.step10];
    els.steps.forEach((input, i) => input.value = stepVals[i] || '');

    // procedures_needed as plain text
    els.proc.value = (row?.procedures_needed ?? '').toString();

    els.tip.textContent = editingId
      ? 'Update any field and press Save.'
      : 'Fill in the fields and press Save to create a template.';

    maybeRecalcTotal();
    show(els.mBackdrop, true); show(els.mBox, true); els.name.focus();
  }

  function closeModal(){ show(els.mBackdrop, false); show(els.mBox, false); editingId = null; }

  async function saveModal(){
    const payload = buildPayloadFromModal();
    try {
      if (editingId) {
        await fetchWithAuth(`/rest/v1/wo_tabs?id=eq.${encodeURIComponent(editingId)}`, {
          method:'PATCH', headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
          body: JSON.stringify(payload)
        });
      } else {
        await fetchWithAuth('/rest/v1/wo_tabs', {
          method:'POST', headers:{'Content-Type':'application/json','Prefer':'return=minimal'},
          body: JSON.stringify(payload)
        });
      }
      closeModal(); await load();
    } catch (e) {
      alert('Save failed: ' + (e && e.message || e));
    }
  }

  function buildPayloadFromModal(){
    const qty = numOrNull(els.qty.value) ?? 0;
    const stdSec   = getHMSSeconds(els.stdH, els.stdM, els.stdS);
    const totalSec = getHMSSeconds(els.totH, els.totM, els.totS);

    const steps = {};
    els.steps.forEach((input,i)=>{
      const key = `step${i+1}`;
      const val = (input.value || '').trim();
      steps[key] = val || null;
    });

    const procText = (els.proc.value || '').trim() || null;

    return {
      work_order_name: (els.name.value || '').trim(),
      qty,
      standard_time_each: formatHMS(stdSec),   // 'HH:MM:SS'
      total_standard_time: formatHMS(totalSec),// 'HH:MM:SS'
      procedures_needed: procText,
      ...steps
    };
  }

  async function duplicateRow(row){
    if (!row) return;
    const copy = { ...row };
    delete copy.id;
    copy.work_order_name = (copy.work_order_name || 'Template') + ' (Copy)';
    copy.standard_time_each = formatHMS(parseIntervalToSeconds(row.standard_time_each || '0 minutes'));
    copy.total_standard_time = formatHMS(parseIntervalToSeconds(row.total_standard_time || '0 minutes'));
    await fetchWithAuth('/rest/v1/wo_tabs', {
      method:'POST', headers:{'Content-Type':'application/json','Prefer':'return=minimal'}, body: JSON.stringify(copy)
    });
  }

  // -------- utils --------
  function show(el, on){ if (!el) return; el.hidden = !on; }
  function esc(s){ s = s == null ? '' : String(s); return s.replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m])); }
  function numOrNull(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }

  function parseIntervalToSeconds(iv){
    if (!iv) return 0;
    const s = String(iv).toLowerCase().trim();
    const m = s.match(/(\d+)\s*minute/);
    if (m) return Number(m[1]) * 60;
    const hms = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
    if (hms) {
      const h = Number(hms[1])||0, mm = Number(hms[2])||0, ss = Number(hms[3])||0;
      return h*3600 + mm*60 + ss;
    }
    return 0;
  }
  function formatHMS(totalSec){
    const s = Math.max(0, Math.floor(totalSec||0));
    const hh = String(Math.floor(s/3600)).padStart(2,'0');
    const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    return `${hh}:${mm}:${ss}`;
  }
  function setHMS(hEl,mEl,sEl,seconds){
    const s = Math.max(0, Math.floor(seconds||0));
    hEl.value = String(Math.floor(s/3600));
    mEl.value = String(Math.floor((s%3600)/60)).padStart(2,'0');
    sEl.value = String(s%60).padStart(2,'0');
  }
  function getHMSSeconds(hEl,mEl,sEl){
    const h = Math.max(0, Number(hEl.value)||0);
    const m = Math.min(59, Math.max(0, Number(mEl.value)||0));
    const s = Math.min(59, Math.max(0, Number(sEl.value)||0));
    return h*3600 + m*60 + s;
  }

  // ✅ define maybeRecalcTotal (was missing)
  function maybeRecalcTotal(){
    if (!els.totalAuto?.checked) return;
    const qty = numOrNull(els.qty.value) ?? 0;
    const std = getHMSSeconds(els.stdH, els.stdM, els.stdS);
    const total = Math.max(0, Math.floor(qty * std));
    setHMS(els.totH, els.totM, els.totS, total);
  }
}
