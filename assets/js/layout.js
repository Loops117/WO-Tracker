
import { initClient } from './supa.js';
const supa = initClient();

export async function getAuthSession(){ const {data}=await supa.auth.getSession(); return data.session;}
export async function injectChrome(){
  await Promise.all([injectPartial('header','/assets/partials/header.html'),injectPartial('footer','/assets/partials/footer.html')]);
  await wireHeader();
}
async function injectPartial(slot,url){ const mount=document.querySelector(`[data-partial="${slot}"]`); if(!mount) return; const res=await fetch(url,{cache:'no-store'}); mount.innerHTML=await res.text();}
async function wireHeader(){
  const session=await getAuthSession();
  const logoutBtn=document.getElementById('logout-btn'); const logoLink=document.getElementById('logo-link');
  if(session){ if(logoutBtn) logoutBtn.style.display=''; if(logoLink) logoLink.setAttribute('href','/pages/dashboard.html');}
  else { if(logoutBtn) logoutBtn.style.display='none'; if(logoLink) logoLink.setAttribute('href','/');}
  logoutBtn?.addEventListener('click', async ()=>{ await supa.auth.signOut(); window.location.href='/';});
}
