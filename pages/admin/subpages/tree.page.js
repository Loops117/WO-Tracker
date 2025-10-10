// /pages/admin/tree.page.js
export async function init({ mount /*, fetchWithAuth, session */ }) {
  const root = mount.querySelector('#tree-root');
  if (root) {
    const p = document.createElement('p');
    p.textContent = 'Tree module initialized.';
    root.appendChild(p);
  }
}
