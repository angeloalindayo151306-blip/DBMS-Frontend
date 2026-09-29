import { getOfficerProposalPayments } from './api.js';
import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['officer']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  const id = qs('id');
  if (!id) {
    content.innerHTML = `<div class="alert alert-warning">Missing proposal id.</div>`;
    return;
  }

  try {
    const payments = await getOfficerProposalPayments(id);

    content.innerHTML = `
      <div class="card card-soft p-3">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Student</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Ref</th>
                <th>Date</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${
                (payments || []).length
                  ? payments
                      .map(
                        (p) => `
                    <tr>
                      <td>${p.student_id}</td>
                      <td>${money(p.amount)}</td>
                      <td>${p.method || '—'}</td>
                      <td>${p.reference_no || '—'}</td>
                      <td>${fmtDate(p.paid_at || p.created_at)}</td>
                      <td>${p.receipts?.[0]?.receipt_no ?? '—'}</td>
                    </tr>
                  `
                      )
                      .join('')
                  : `<tr><td colspan="6" class="text-muted">No payments yet.</td></tr>`
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
