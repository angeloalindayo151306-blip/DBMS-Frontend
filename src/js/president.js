import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['president']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  content.innerHTML = `
    <div class="card card-soft p-3" style="max-width:720px;">
      <div class="mb-2"><b>Welcome,</b> ${
        auth.me.full_name || 'President'
      }</div>
      <div class="text-muted">
        Use the sidebar to create Student accounts.
      </div>
    </div>
  `;
}

init();
