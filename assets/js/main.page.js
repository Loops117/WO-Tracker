
import { initClient, fetchWithAuth } from './supa.js';
import { injectChrome, getAuthSession } from './layout.js';
const supa = initClient();

(async function init(){
  await injectChrome();
  const session = await getAuthSession();
  if(session){ window.location.href='/pages/dashboard.html'; return; }
  loadActiveUsers();
})();

function nameToEmail(displayName){
  const tokens=(displayName||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
  let local=''; if(tokens.length>=2){ local=tokens[0].replace(/[^a-z0-9]/g,'')+tokens[tokens.length-1].replace(/[^a-z0-9]/g,''); }
  else if(tokens.length===1){ local=tokens[0].replace(/[^a-z0-9]/g,''); } else { local='user'; }
  return `${local}@lbinventory.com`;
}

async function loadActiveUsers(){
  const grid=document.getElementById('worker-grid');
  grid.innerHTML='<div class="muted">Loading users…</div>';
  try{
    const res=await fetchWithAuth('/rest/v1/profiles?select=id,display_name,role,is_active,email&is_active=eq.true&order=display_name');
    if(!res.ok) throw new Error(await res.text());
    const users=await res.json();
    if(!users.length){ grid.innerHTML='<div class="muted">No active users found.</div>'; return; }
    grid.innerHTML = users.map(u => {
      const email = (u.email && u.email.trim().length ? u.email.trim() : nameToEmail(u.display_name));
      return `
        <button class="user-btn" data-id="${u.id}" data-name="${u.display_name}" data-email="${email}">
          <span class="user-name">${u.display_name}</span>
        </button>
      `;
    }).join('');
    grid.querySelectorAll('.user-btn').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const name=btn.dataset.name; const email=btn.dataset.email;
        const password=prompt('Enter password for '+name+':');
        if(password===null) return; const trimmed=(password||'').trim();
        if(trimmed.length<6){ alert('Password must be at least 6 characters.'); return; }
        const { error } = await supa.auth.signInWithPassword({ email, password: trimmed });
        if(error){ alert(error.message||'Login failed.'); return; }
        localStorage.setItem('display_name_hint', name);
        window.location.href='/pages/dashboard.html';
      });
    });
  }catch(e){
    grid.innerHTML = '<div class="muted">Error loading users.</div>';
    console.error(e);
  }
}
