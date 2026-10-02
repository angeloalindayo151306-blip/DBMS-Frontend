import { getEvents, getMyPayments } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function sumBreakdown(breakdown) {
  if (!Array.isArray(breakdown)) return 0;
  return breakdown.reduce((s, it) => s + Number(it?.amount || 0), 0);
}

function getRequiredForEvent(ev) {
  const b = Array.isArray(ev?.breakdown) ? ev.breakdown : [];
  const bTotal = sumBreakdown(b);
  return bTotal > 0 ? bTotal : Number(ev?.required_per_student || 0);
}

function getReceiptNo(p) {
  if (Array.isArray(p.receipts)) return p.receipts[0]?.receipt_no ?? "—";
  if (p.receipts && typeof p.receipts === "object") return p.receipts.receipt_no ?? "—";
  return "—";
}

function badge(text, type) {
  return `<span class="badge text-bg-${type}">${text}</span>`;
}

async function init() {
  const content = document.getElementById("content");
  const auth = await requireRoles(["student"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const [events, payments] = await Promise.all([getEvents(), getMyPayments()]);
    const eventById = new Map((events || []).map((e) => [e.id, e]));

    // Total paid per event/proposal
    const totalPaidByProposal = new Map();
    for (const p of payments || []) {
      const k = p.proposal_id;
      totalPaidByProposal.set(k, (totalPaidByProposal.get(k) || 0) + Number(p.amount || 0));
    }

    const approvedEvents = (events || []).length;
    const totalPaid = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

    // Compute balances per event
    const balances = (events || []).map((e) => {
      const required = getRequiredForEvent(e);
      const paid = totalPaidByProposal.get(e.id) || 0;
      const remaining = Math.max(required - paid, 0);
      const status =
        required <= 0
          ? "—"
          : remaining === 0
          ? badge("Fully Paid", "success")
          : paid > 0
          ? badge("Partial Pay", "warning")
          : badge("Unpaid", "secondary");

      return { id: e.id, title: e.title, required, paid, remaining, status };
    });

    const fullyPaidCount = balances.filter((b) => b.required > 0 && b.remaining === 0 && b.paid > 0).length;
    const totalRemaining = balances.reduce((s, b) => s + Number(b.remaining || 0), 0);

    // Recent payments
    const recent = (payments || []).slice(0, 5).map((p) => {
      const ev = eventById.get(p.proposal_id);
      const required = getRequiredForEvent(ev);
      const totalForEvent = totalPaidByProposal.get(p.proposal_id) || 0;

      const statusHtml =
        required > 0
          ? totalForEvent >= required
            ? badge("Fully Paid", "success")
            : badge("Partial Pay", "warning")
          : "—";

      return {
        title: ev?.title || p.proposal_id,
        amount: p.amount,
        date: p.paid_at || p.created_at,
        receipt: getReceiptNo(p),
        statusHtml
      };
    });

    // Show top 5 events with remaining balance (largest first)
    const dueList = balances
      .filter((b) => b.required > 0 && b.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 5);

    content.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between mb-3">
        <div>
          <h3 class="mb-1">Student Dashboard</h3>
          <div class="text-muted small">
            Welcome, <b>${auth.me?.full_name || "Student"}</b>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Approved Events</div>
              <div class="stat-value">${approvedEvents}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-calendar-check"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Total Paid</div>
              <div class="stat-value" style="font-size:24px">${money(totalPaid)}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-cash-coin"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Remaining Balance</div>
              <div class="stat-value" style="font-size:24px">${money(totalRemaining)}</div>
              <div class="small text-muted">Fully paid events: <b>${fullyPaidCount}</b></div>
            </div>
            <div class="stat-icon"><i class="bi bi-wallet2"></i></div>
          </div>
        </div>
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-7">
          <div class="card card-soft p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h5 class="mb-0">Recent Payments</h5>
              <a class="btn btn-sm btn-outline-primary" href="/pages/student-history.html">View all</a>
            </div>

            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
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
                                <td>${fmtDate(r.date)}</td>
                                <td>${r.statusHtml}</td>
                                <td>${r.receipt}</td>
                              </tr>
                            `
                          )
                          .join("")
                      : `<tr><td colspan="5" class="text-muted">No payments yet.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="card card-soft p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h5 class="mb-0">Balances Due</h5>
              <a class="btn btn-sm btn-primary" href="/pages/student-events.html">Pay now</a>
            </div>

            ${
              dueList.length
                ? `
                  <div class="table-responsive">
                    <table class="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th class="text-end">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${dueList
                          .map(
                            (d) => `
                              <tr>
                                <td>
                                  <div><b>${d.title}</b></div>
                                  <div class="small text-muted">
                                    Paid: ${money(d.paid)} / ${money(d.required)}
                                  </div>
                                </td>
                                <td class="text-end">
                                  <div><b>${money(d.remaining)}</b></div>
                                  <a class="btn btn-sm btn-outline-primary mt-1"
                                     href="/pages/student-pay.html?proposal_id=${d.id}&amount=${encodeURIComponent(
                              d.remaining
                            )}">
                                    Pay
                                  </a>
                                </td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `
                : `<div class="text-muted">No remaining balances. Good job!</div>`
            }
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();