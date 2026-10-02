import { getEvents, getMyPayments, createPayment } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

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

async function init() {
  const content = document.getElementById("content");
  const auth = await requireRoles(["student"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const [events, payments] = await Promise.all([getEvents(), getMyPayments()]);
    const eventById = new Map((events || []).map((e) => [e.id, e]));

    // paid totals per event
    const totalPaidByProposal = new Map();
    for (const p of payments || []) {
      const k = p.proposal_id;
      totalPaidByProposal.set(k, (totalPaidByProposal.get(k) || 0) + Number(p.amount || 0));
    }

    const proposalIdFromUrl = qs("proposal_id");
    const amountFromUrl = qs("amount");

    content.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 class="mb-1">Make Payment</h3>
          <div class="text-muted small">Pay your remaining balance for an event.</div>
        </div>
        <a class="btn btn-outline-primary btn-sm" href="/pages/student-events.html">
          <i class="bi bi-arrow-left me-1"></i> Back to Events
        </a>
      </div>

      <div class="row g-3" style="max-width: 1100px;">
        <div class="col-12 col-lg-7">
          <div class="card card-soft p-3">
            <form id="payForm">
              <div class="mb-3">
                <label class="form-label">Event</label>
                <select class="form-select" id="proposal_id" required>
                  <option value="" disabled ${proposalIdFromUrl ? "" : "selected"}>Select event</option>
                  ${(events || []).map(e => `
                    <option value="${e.id}" ${proposalIdFromUrl === e.id ? "selected" : ""}>
                      ${escapeHtml(e.title)}
                    </option>
                  `).join("")}
                </select>
              </div>

              <div class="mb-3">
                <label class="form-label">Payment Method</label>
                <select class="form-select" id="method" required>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
                <div class="form-text" id="refHint"></div>
              </div>

              <div class="mb-3">
                <label class="form-label">Amount</label>
                <div class="input-group">
                  <span class="input-group-text">₱</span>
                  <input class="form-control" id="amount" type="number" min="1" step="0.01" required />
                </div>
                <div class="form-text" id="amountHint"></div>
              </div>

              <div class="mb-3">
                <label class="form-label">Reference Number</label>
                <input class="form-control" id="reference_no" type="text" placeholder="Optional for Cash" />
              </div>

              <button class="btn btn-primary" id="btnSubmit" type="submit">
                <i class="bi bi-send-check me-1"></i> Submit Payment
              </button>
            </form>

            <div id="msg" class="mt-3"></div>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="card card-soft p-3">
            <h5 class="mb-2"><i class="bi bi-info-circle me-1"></i> Event Summary</h5>
            <div id="summary" class="text-muted">Select an event to view breakdown.</div>
          </div>
        </div>
      </div>
    `;

    const sel = document.getElementById("proposal_id");
    const methodEl = document.getElementById("method");
    const amountEl = document.getElementById("amount");
    const amountHint = document.getElementById("amountHint");
    const refEl = document.getElementById("reference_no");
    const refHint = document.getElementById("refHint");
    const summaryEl = document.getElementById("summary");

    function getRequired(ev) {
      const b = Array.isArray(ev?.breakdown) ? ev.breakdown : [];
      const bt = sumBreakdown(b);
      return b.length ? bt : Number(ev?.required_per_student || 0);
    }

    function updateRefHint() {
      const method = methodEl.value;
      refHint.textContent =
        method === "cash"
          ? "Reference is optional for Cash."
          : "Reference is required for GCash/Bank Transfer.";
    }

    function renderSummary() {
      const id = sel.value;
      const ev = eventById.get(id);

      if (!ev) {
        summaryEl.innerHTML = `<div class="text-muted">Select an event to view breakdown.</div>`;
        amountHint.textContent = "";
        return;
      }

      const required = getRequired(ev);
      const paid = totalPaidByProposal.get(id) || 0;
      const remaining = Math.max(required - paid, 0);

      amountEl.max = remaining > 0 ? String(remaining) : "";
      amountHint.textContent = required > 0 ? `Remaining balance: ${money(remaining)} (max you can pay now)` : "";

      if (amountFromUrl && Number(amountFromUrl) > 0) {
        amountEl.value = amountFromUrl;
      } else if (!amountEl.value) {
        amountEl.value = remaining > 0 ? remaining : "";
      }

      const breakdown = Array.isArray(ev.breakdown) ? ev.breakdown : [];
      const breakdownHtml = breakdown.length
        ? `
          <ul class="mb-0">
            ${breakdown.map(it => `<li>${escapeHtml(it.name)} — ${money(it.amount)}</li>`).join("")}
          </ul>
        `
        : `<div class="text-muted">No breakdown provided.</div>`;

      summaryEl.innerHTML = `
        <div class="fw-bold mb-1">${escapeHtml(ev.title)}</div>
        <div class="small text-muted mb-3">${escapeHtml(ev.description || "")}</div>

        <div class="d-flex justify-content-between small mb-1">
          <span class="text-muted">Required</span><b>${money(required)}</b>
        </div>
        <div class="d-flex justify-content-between small mb-1">
          <span class="text-muted">Paid</span><b>${money(paid)}</b>
        </div>
        <div class="d-flex justify-content-between small mb-3">
          <span class="text-muted">Remaining</span><b>${money(remaining)}</b>
        </div>

        <hr>
        <div class="fw-bold mb-2">Breakdown</div>
        ${breakdownHtml}
      `;
    }

    sel.addEventListener("change", () => {
      amountEl.value = "";
      renderSummary();
    });

    methodEl.addEventListener("change", updateRefHint);

    updateRefHint();
    renderSummary();

    document.getElementById("payForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const msg = document.getElementById("msg");
      const btn = document.getElementById("btnSubmit");
      msg.innerHTML = "";
      btn.disabled = true;

      try {
        const proposal_id = sel.value;
        const ev = eventById.get(proposal_id);
        if (!ev) throw new Error("Please select an event.");

        const required = getRequired(ev);
        const paid = totalPaidByProposal.get(proposal_id) || 0;
        const remaining = Math.max(required - paid, 0);

        const method = methodEl.value;
        const amount = Number(amountEl.value);
        const referenceValue = refEl.value.trim();

        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");
        if (required > 0 && amount > remaining) throw new Error(`Amount exceeds remaining balance (${money(remaining)}).`);
        if (method !== "cash" && !referenceValue) throw new Error("Reference number is required for GCash/Bank Transfer.");

        const payload = {
          proposal_id,
          method,
          amount,
          ...(referenceValue ? { reference_no: referenceValue } : {})
        };

        const result = await createPayment(payload);

        msg.innerHTML = `
          <div class="alert alert-success">
            <div class="fw-bold mb-1"><i class="bi bi-check2-circle me-1"></i> Payment submitted</div>
            Receipt No: <b>${result?.receipt?.receipt_no ?? "N/A"}</b>
            <div class="mt-2">
              <a class="btn btn-sm btn-outline-primary" href="/pages/student-history.html">
                View History/Receipts
              </a>
            </div>
          </div>
        `;

        totalPaidByProposal.set(proposal_id, paid + amount);
        renderSummary();
      } catch (err) {
        msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      } finally {
        btn.disabled = false;
      }
    });
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();