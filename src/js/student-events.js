import { getEvents, getMyPayments } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sumBreakdown(breakdown) {
  if (!Array.isArray(breakdown)) return 0;
  return breakdown.reduce((s, it) => s + Number(it?.amount || 0), 0);
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

    // total paid per event/proposal
    const totalPaidByProposal = new Map();
    for (const p of payments || []) {
      const k = p.proposal_id;
      totalPaidByProposal.set(k, (totalPaidByProposal.get(k) || 0) + Number(p.amount || 0));
    }

    if (!(events || []).length) {
      content.innerHTML = `<div class="card card-soft p-4 text-muted">No approved events yet.</div>`;
      return;
    }

    content.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 class="mb-1">Events</h3>
          <div class="text-muted small">View fee breakdown and pay remaining balances.</div>
        </div>
      </div>

      <div class="row g-3">
        ${(events || []).map((e) => {
          const breakdown = Array.isArray(e.breakdown) ? e.breakdown : [];
          const computedTotal = sumBreakdown(breakdown);
          const required = breakdown.length ? computedTotal : Number(e.required_per_student || 0);

          const paid = totalPaidByProposal.get(e.id) || 0;
          const remaining = Math.max(required - paid, 0);

          const statusHtml =
            required <= 0
              ? "—"
              : remaining === 0
                ? badge("Fully Paid", "success")
                : paid > 0
                  ? badge("Partial Pay", "warning")
                  : badge("Unpaid", "secondary");

          const payBtn =
            required > 0 && remaining > 0
              ? `<a class="btn btn-primary btn-sm"
                    href="/pages/student-pay.html?proposal_id=${e.id}&amount=${encodeURIComponent(remaining)}">
                    <i class="bi bi-cash-coin me-1"></i> Pay ${money(remaining)}
                 </a>`
              : `<button class="btn btn-outline-secondary btn-sm" disabled>
                    <i class="bi bi-check2-circle me-1"></i> No balance
                 </button>`;

          const breakdownHtml =
            breakdown.length
              ? `
                <details class="mt-2">
                  <summary class="small text-muted">View breakdown</summary>
                  <ul class="small mb-0 mt-2">
                    ${breakdown
                      .map((it) => `<li>${escapeHtml(it.name)} — ${money(it.amount)}</li>`)
                      .join("")}
                  </ul>
                </details>
              `
              : `<div class="small text-muted mt-2">No breakdown available.</div>`;

          return `
            <div class="col-12 col-md-6 col-lg-4">
              <div class="card card-soft p-3 h-100">
                <div class="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <div class="fw-bold">${escapeHtml(e.title)}</div>
                    <div class="small text-muted">${escapeHtml(e.description || "")}</div>
                  </div>
                  <div>${statusHtml}</div>
                </div>

                <hr class="my-3">

                <div class="d-flex justify-content-between small">
                  <span class="text-muted">Required</span>
                  <b>${money(required)}</b>
                </div>
                <div class="d-flex justify-content-between small">
                  <span class="text-muted">Paid</span>
                  <b>${money(paid)}</b>
                </div>
                <div class="d-flex justify-content-between small">
                  <span class="text-muted">Remaining</span>
                  <b>${money(remaining)}</b>
                </div>

                ${breakdownHtml}

                <div class="mt-3 d-flex justify-content-end">
                  ${payBtn}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();