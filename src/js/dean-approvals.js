import { getProposals, setProposalStatus } from './api.js';
import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['dean', 'president']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  async function load() {
    const pending = await getProposals('pending');

    content.innerHTML = `
      <div class="card card-soft p-3">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                (pending || []).length
                  ? pending
                      .map(
                        (p) => `
                    <tr>
                      <td>
                        <div><b>${p.title}</b></div>
                        <div class="text-muted small">${
                          p.description || ''
                        }</div>
                      </td>
                      <td>${fmtDate(p.created_at)}</td>
                      <td class="text-end">
                        <button class="btn btn-sm btn-success" data-approve="${
                          p.id
                        }">Approve</button>
                        <button class="btn btn-sm btn-danger ms-1" data-reject="${
                          p.id
                        }">Reject</button>
                      </td>
                    </tr>
                  `
                      )
                      .join('')
                  : `<tr><td colspan="3" class="text-muted">No pending proposals.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    content.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-approve');
        const comment = prompt('Dean comment (optional):') ?? '';
        await setProposalStatus(id, {
          status: 'approved',
          dean_comment: comment || undefined,
        });
        await load();
      });
    });

    content.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-reject');
        const comment = prompt('Reason (optional):') ?? '';
        await setProposalStatus(id, {
          status: 'rejected',
          dean_comment: comment || undefined,
        });
        await load();
      });
    });
  }

  try {
    await load();
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();
