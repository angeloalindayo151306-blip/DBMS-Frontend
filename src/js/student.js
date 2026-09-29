import { getMe, getEvents, getMyPayments } from './api.js';
import { extractRole, roleToPage } from './role.js';
import { renderSidebar } from './ui.js';

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');

async function init() {
  const content = document.getElementById('content');

  try {
    const me = await getMe();
    const role = extractRole(me);

    if (role !== 'student') {
      window.location.href = roleToPage(role);
      return;
    }

    renderSidebar(document.getElementById('sidebar'), role);

    // Load dashboard data
    const [events, payments] = await Promise.all([
      getEvents(),
      getMyPayments(),
    ]);

    const totalPaid = (payments || []).reduce(
      (s, p) => s + Number(p.amount || 0),
      0
    );

    // Map proposal_id -> event title/required
    const eventById = new Map((events || []).map((e) => [e.id, e]));
    const recent = (payments || []).slice(0, 5).map((p) => {
      const ev = eventById.get(p.proposal_id);
      return {
        title: ev?.title || p.proposal_id,
        amount: p.amount,
        paid_at: p.paid_at || p.created_at,
        receipt: p.receipts?.[0]?.receipt_no || '—',
      };
    });

    content.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3">
            <div class="text-muted">Approved Events</div>
            <div style="font-size:28px;font-weight:700">${
              (events || []).length
            }</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3">
            <div class="text-muted">Total Paid</div>
            <div style="font-size:28px;font-weight:700">${money(
              totalPaid
            )}</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3">
            <div class="text-muted">Payments Made</div>
            <div style="font-size:28px;font-weight:700">${
              (payments || []).length
            }</div>
          </div>
        </div>
      </div>

      <div class="card card-soft p-3">
        <h5 class="mb-3">Recent Payments</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Event</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${
                recent.length
                  ? recent
                      .map(
                        (r) => `
                    <tr>
                      <td>${r.title}</td>
                      <td>${money(r.amount)}</td>
                      <td>${fmtDate(r.paid_at)}</td>
                      <td>${r.receipt}</td>
                    </tr>
                  `
                      )
                      .join('')
                  : `<tr><td colspan="4" class="text-muted">No payments yet.</td></tr>`
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
