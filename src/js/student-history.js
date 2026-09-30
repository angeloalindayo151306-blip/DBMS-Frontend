import { getEvents, getMyPayments } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function getReceiptNo(p) {
  // supports receipts as array OR object
  if (Array.isArray(p.receipts)) return p.receipts[0]?.receipt_no ?? "—";
  if (p.receipts && typeof p.receipts === "object") return p.receipts.receipt_no ?? "—";
  return "—";
}

function statusBadge(requiredPerStudent, totalPaidForEvent) {
  if (!requiredPerStudent || requiredPerStudent <= 0) return "—";

  const fullyPaid = Number(totalPaidForEvent) >= Number(requiredPerStudent);
  return fullyPaid
    ? `<span class="badge text-bg-success">Fully Paid</span>`
    : `<span class="badge text-bg-warning">Partial Pay</span>`;
}

async function init() {
  const content = document.getElementById("content");
  const auth = await requireRoles(["student"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const [events, payments] = await Promise.all([getEvents(), getMyPayments()]);
    const eventById = new Map((events || []).map((e) => [e.id, e]));

    // total paid per proposal/event (so we can decide Fully vs Partial)
    const totalPaidByProposal = new Map();
    for (const p of payments || []) {
      const k = p.proposal_id;
      totalPaidByProposal.set(k, (totalPaidByProposal.get(k) || 0) + Number(p.amount || 0));
    }

    content.innerHTML = `
      <div class="card card-soft p-3">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Event</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Ref</th>
                <th>Date</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              ${
                (payments || []).length
                  ? payments
                      .map((p) => {
                        const ev = eventById.get(p.proposal_id);
                        const required = Number(ev?.required_per_student || 0);
                        const totalForEvent = totalPaidByProposal.get(p.proposal_id) || 0;

                        const receipt = getReceiptNo(p);
                        const status = statusBadge(required, totalForEvent);

                        return `
                          <tr>
                            <td>${ev?.title || p.proposal_id}</td>
                            <td>${money(p.amount)}</td>
                            <td>${p.method || "—"}</td>
                            <td>${p.reference_no || "—"}</td>
                            <td>${fmtDate(p.paid_at || p.created_at)}</td>
                            <td>${status}</td>
                            <td>${receipt}</td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `<tr><td colspan="7" class="text-muted">No payments yet.</td></tr>`
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