// assets/js/admin.users.js
import { initClient, setSessionToken, getSessionToken, fetchWithAuth, callRpc } from './supa.js';

const supa = initClient();

const elEmail = document.getElementById('email');
const elPass  = document.getElementById('password');
const btnLogin = document.getElementById('login');
const btnLogout = document.getElementById('logout');
const authMsg = document.getElementById('auth-msg');

async function updateAuthUI() {
  const token = getSessionToken();
  btnLogout.style.display = token ? '' : 'none';
  btnLogin.style.display = token ? 'none' : '';
  elEmail.disabled = !!token;
  elPass.disabled = !!token;
  if (token) {
    authMsg.textContent = 'Signed in.';
    await loadUsers();
  } else {
    authMsg.textContent = 'Not signed in.';
    document.getElementById('users').innerHTML = '<em>Sign in to view workers.</em>';
  }
}

btnLogin.addEventListener('click', async () => {
  try {
    const { data, error } = await supa.auth.signInWithPassword({
      email: elEmail.value.trim(),
      password: elPass.value.trim(),
    });
    if (error) throw error;
    setSessionToken(data.session.access_token);
    authMsg.textContent = 'Signed in.';
    await updateAuthUI();
  } catch (e) {
    authMsg.textContent = 'Login failed: ' + (e.message || e);
  }
});

btnLogout.addEventListener('click', async () => {
  try { await supa.auth.signOut(); } catch {}
  setSessionToken(null);
  await updateAuthUI();
});

async function loadUsers() {
  const res = await fetchWithAuth(`/rest/v1/admin_workers_list?select=*`);
  if (!res.ok) {
    document.getElementById('users').innerHTML = 'Error loading users: ' + await res.text();
    return;
  }
  const rows = await res.json();
  const el = document.getElementById('users');
  el.innerHTML = rows.map(r => `
    <div class="card">
      <div class="row between">
        <div><strong>${r.display_name}</strong></div>
        <div class="muted">ID: ${r.profile_id}</div>
      </div>
      <div>Status: ${r.is_active ? 'Active' : 'Inactive'}</div>
      <div class="row">
        <input type="password" placeholder="New PIN (min 4)" id="pin-${r.profile_id}" />
        <button data-id="${r.profile_id}" class="set-pin">Set PIN</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.set-pin').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const pin = document.getElementById('pin-'+id).value.trim();
      const msg = document.getElementById('msg');
      try {
        await callRpc('admin_set_worker_pin', { p_profile_id: id, p_new_pin: pin });
        msg.textContent = 'PIN updated for user.';
      } catch (e) {
        msg.textContent = 'Error: ' + (e.message || e);
      }
    });
  });
}

// Boot
updateAuthUI();
