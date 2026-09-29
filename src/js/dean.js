import { getMe, getProposals, getDepartmentReport } from './api.js';
import { extractRole, roleToPage } from './role.js';
import { renderSidebar } from './ui.js';

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

async function init() {
  const content = document.getElementById('content');

  try {
    const me = await getMe();
    const role = extractRole(me);

    if (role !== 'dean') {
      window.location.href = roleToPage(role);
      return;
    }

    renderSidebar(document.getElementById('sidebar'), role);

    const [proposals, report] = await Promise.all([
      getProposals(),
      getDepartmentReport(),
    ]);

    const pendingCount = (proposals || []).filter(
      (p) => p.status === 'pending'
    ).length;

    const totalBudget = (report || []).reduce(
      (s, r) => s + Number(r.budget_total || 0),
      0
    );
    const totalCollected = (report || []).reduce(
      (s, r) => s + Number(r.collected_total || 0),
      0
    );
    const totalRemaining = (report || []).reduce(
      (s, r) => s + Number(r.remaining_budget || 0),
      0
    );

    content.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-12 col-md-3">
          <div class="card card-soft p-3">
            <div class="text-muted">Pending Proposals</div>
            <div style="font-size:28px;font-weight:700">${pendingCount}</div>
          </div>
        </div>
        <div class="col-12 col-md-3">
          <div class="card card-soft p-3">
            <div class="text-muted">Total Budget</div>
            <div style="font-size:22px;font-weight:700">${money(
              totalBudget
            )}</div>
          </div>
        </div>
        <div class="col-12 col-md-3">
          <div class="card card-soft p-3">
            <div class="text-muted">Total Collected</div>
            <div style="font-size:22px;font-weight:700">${money(
              totalCollected
            )}</div>
          </div>
        </div>
        <div class="col-12 col-md-3">
          <div class="card card-soft p-3">
            <div class="text-muted">Remaining Budget</div>
            <div style="font-size:22px;font-weight:700">${money(
              totalRemaining
            )}</div>
          </div>
        </div>
      </div>

      <div class="card card-soft p-3">
        <h5 class="mb-3">Department Summary (by Proposal)</h5>
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
                      .slice(0, 8)
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
                  : `<tr><td colspan="5" class="text-muted">No data.</td></tr>`
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
