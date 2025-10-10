
import { injectChrome, getAuthSession } from './layout.js';
import { buildSideMenu } from './menu.js';

(async function boot(){
  await injectChrome();
  const session = await getAuthSession();
  if(!session){ window.location.href='/'; return; }
  window.__sessionCache = session;
  buildSideMenu();
  const hint = localStorage.getItem('display_name_hint') || (session.user && session.user.email) || 'User';
  document.getElementById('welcome').textContent = `Welcome, ${hint}.`;
})();
