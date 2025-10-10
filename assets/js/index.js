// assets/js/index.js
import { initClient, setSessionToken, getSessionToken, callRpc, fetchWithAuth } from './supa.js';

const supa = initClient();

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Admin login
const elEmail = document.getElementById('email');
const elPass  = document.getElementById('password');
const btnLogin = document.getElementById('admin-login');
const btnLogout = document.getElementById('admin-logout');
const adminMsg = document.getElementById('admin-msg');

function updateAdminUI() {
  const tok = getSessionToken();
  btnLogout.style.display = tok ? '' : 'none';
  btnLogin.style.display = tok ? 'none' : '';
  elEmail.disabled = !!tok;
  elPass.disabled = !!tok;
  adminMsg.textContent = tok ? 'Signed in.' : 'Not signed in.';
}

btnLogin?.addEventListener('click', async () => {
  try {
    const { data, error } = await supa.auth.signInWithPassword({
      email: elEmail.value.trim(),
      password: elPass.value.trim(),
    });
    if (error) throw error;
    setSessionToken(data.session.access_token);
    updateAdminUI();
  } catch (e) {
    adminMsg.textContent = 'Login failed: ' + (e.message || e);
  }
});

btnLogout?.addEventListener('click', async () => {
  try { await supa.auth.signOut(); } catch {}
  setSessionToken(null);
  updateAdminUI();
});

updateAdminUI();

// Worker list + PIN prompt
async function loadWorkers() {
  try {
    // SECURITY DEFINER RPC that returns (profile_id, display_name) for active workers
    const res = await callRpc('list_active_workers', {});
    const rows = Array.isArray(res) ? res : [];
    const box = document.getElementById('worker-list');
    box.innerHTML = rows.map(r => `
      <button class="user-btn" data-id="${r.profile_id}" data-name="${r.display_name}">
        ${r.display_name}
      </button>`).join('');

    box.querySelectorAll('.user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        const pin = window.prompt(`Enter PIN for ${name}`) || '';
        if (!pin) return;
        // Use verify + cache minimal session
        const out = await callRpc('verify_worker_pin', { p_display_name: name, p_pin: pin });
        const pid = out?.[0]?.verify_worker_pin || null;
        if (pid) {
          localStorage.setItem('worker_session', JSON.stringify({ display_name: name, profile_id: pid, pin }));
          window.location.href = './pages/dashboard.html';
        } else {
          alert('Invalid PIN.');
        }
      });
    });
  } catch (e) {
    const box = document.getElementById('worker-list');
    box.innerHTML = `<div class="muted">Could not load workers. ${e.message || e}</div>`;
  }
}
loadWorkers();
