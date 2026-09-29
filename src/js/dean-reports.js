import { getDepartmentReport } from './api.js';
import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['dean', 'president']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  try {
    const report = await getDepartmentReport();

    content.innerHTML = `
      <div class="card card-soft p-3">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Budget</th>
                <th>Collected</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              ${
                (report || []).length
                  ? report
                      .map(
                        (r) => `
                    <tr>
                      <td>${r.title}</td>
                      <td>${r.status}</td>
                      <td>${money(r.budget_total)}</td>
                      <td>${money(r.collected_total)}</td>
                      <td>${money(r.remaining_budget)}</td>
                    </tr>
                  `
                      )
                      .join('')
                  : `<tr><td colspan="5" class="text-muted">No report data.</td></tr>`
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
