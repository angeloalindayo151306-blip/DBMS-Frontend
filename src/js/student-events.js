import { getEvents } from './api.js';
import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['student']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  try {
    const events = await getEvents();

    content.innerHTML = `
      <div class="card card-soft p-3">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Required/Student</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                (events || []).length
                  ? events
                      .map(
                        (e) => `
                    <tr>
                      <td>${e.title}</td>
                      <td>${money(e.required_per_student)}</td>
                      <td>${fmtDate(e.created_at)}</td>
                      <td class="text-end">
                        <a class="btn btn-sm btn-primary" href="/pages/student-pay.html?proposal_id=${
                          e.id
                        }">
                          Pay
                        </a>
                      </td>
                    </tr>
                  `
                      )
                      .join('')
                  : `<tr><td colspan="4" class="text-muted">No approved events yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}
init();
