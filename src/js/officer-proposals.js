import { getProposals, createProposal, editProposal } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");
const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const el = (id) => document.getElementById(id);

function badge(status) {
  const cls = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls}">${status}</span>`;
}

function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* Toast (replaces alert) */
let bsToast = null;
function toast(type, html) {
  const toastEl = el("appToast");
  const bodyEl = el("appToastBody");

  const cls = {
    success: "text-bg-success",
    danger: "text-bg-danger",
    warning: "text-bg-warning",
    info: "text-bg-info",
  }[type] || "text-bg-info";

  toastEl.className = `toast align-items-center border-0 ${cls}`;
  bodyEl.innerHTML = html;

  if (!bsToast) bsToast = new bootstrap.Toast(toastEl, { delay: 2600 });
  bsToast.show();
}

async function init() {
  const content = el("content");

  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(el("sidebar"), auth.role);

  el("pageHint").textContent =
    auth.role === "president"
      ? "President view: monitor proposals and collections."
      : "Officer view: create proposals and monitor collections.";

  const myUserId = auth.me?.id; // used to avoid showing Edit for other people’s proposals

  // local state for breakdown rows (same logic as before)
  let items = [
    { name: "Registration", amount: 50 },
    { name: "Palaro", amount: 300 },
  ];

  const calcTotal = () => items.reduce((sum, it) => sum + Number(it.amount || 0), 0);

  function renderItemsTable() {
    const rows = items
      .map(
        (it, idx) => `
        <tr>
          <td>
            <input class="form-control form-control-sm" data-name="${idx}"
              value="${escapeHtml(it.name || "")}" placeholder="Item name" required>
          </td>
          <td style="width:200px;">
            <input class="form-control form-control-sm" data-amount="${idx}" type="number"
              min="0" step="0.01" value="${Number(it.amount || 0)}" required>
          </td>
          <td style="width:110px;" class="text-end">
            <button class="btn btn-sm btn-outline-danger" data-remove="${idx}" type="button">
              <i class="bi bi-trash me-1"></i>Remove
            </button>
          </td>
        </tr>
      `
      )
      .join("");

    return `
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-2">
          <thead>
            <tr>
              <th>Fee Item</th>
              <th>Amount (PHP)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-sm btn-outline-primary" id="btnAddItem" type="button">
          <i class="bi bi-plus-circle me-1"></i>Add Item
        </button>
        <div class="ms-auto">
          <span class="text-muted">Total required per student:</span>
          <b id="totalRequired">${money(calcTotal())}</b>
        </div>
      </div>
    `;
  }

  // Edit modal init (replaces prompt)
  const editModalEl = el("editProposalModal");
  const bsEditModal = new bootstrap.Modal(editModalEl);
  let proposalsById = new Map();

  function openEditModal(p) {
    el("editModalMsg").innerHTML = "";
    el("editProposalId").value = p.id;
    el("editTitle").value = p.title || "";
    el("editDesc").value = p.description || "";
    bsEditModal.show();
  }

  el("btnSaveProposalEdit").addEventListener("click", async () => {
    const btn = el("btnSaveProposalEdit");
    btn.disabled = true;

    try {
      const id = el("editProposalId").value;
      const p = proposalsById.get(id);

      if (!p) throw new Error("Proposal not found.");
      if (p.status !== "pending") throw new Error("Only pending proposals can be edited.");

      const newTitle = el("editTitle").value.trim();
      const newDesc = el("editDesc").value.trim();

      const payload = {};
      if (newTitle) payload.title = newTitle;
      payload.description = newDesc; // allow clearing description

      await editProposal(id, payload);

      toast("success", "Proposal updated successfully.");
      bsEditModal.hide();
      await load();
    } catch (e) {
      el("editModalMsg").innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
    } finally {
      btn.disabled = false;
    }
  });

  async function load() {
    const proposals = await getProposals(); // backend now can return all proposals for officers/president

    proposalsById = new Map((proposals || []).map((p) => [p.id, p]));

    content.innerHTML = `
      <!-- Create Proposal -->
      <div class="card card-soft p-3 mb-3" style="max-width: 1100px;">
        <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
          <div>
            <h5 class="mb-0"><i class="bi bi-plus-square me-2"></i>Create Proposal</h5>
            <div class="text-muted small">Add a fee breakdown. Total is computed automatically.</div>
          </div>
        </div>

        <form id="createForm" class="row g-3">
          <div class="col-12 col-md-6">
            <label class="form-label">Title</label>
            <input class="form-control" id="title" placeholder="e.g., CCS Days Fees" required />
          </div>

          <div class="col-12 col-md-6">
            <label class="form-label">Description (optional)</label>
            <input class="form-control" id="description" placeholder="Optional notes" />
          </div>

          <div class="col-12">
            <label class="form-label">Breakdown</label>
            <div id="itemsWrap">${renderItemsTable()}</div>
          </div>

          <div class="col-12 d-flex gap-2">
            <button class="btn btn-primary" id="btnCreate" type="submit">
              <i class="bi bi-send me-1"></i>Create Proposal
            </button>
          </div>

          <div class="col-12" id="msg"></div>
        </form>
      </div>

      <!-- Proposals List -->
      <div class="card card-soft p-3" style="max-width: 1100px;">
        <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 mb-2">
          <div>
            <h5 class="mb-0"><i class="bi bi-folder2-open me-2"></i>Proposals</h5>
            <div class="text-muted small">View breakdown, status, and open payments monitoring.</div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Required/Student</th>
                <th>Created</th>
                <th class="text-end">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                (proposals || []).length
                  ? proposals
                      .map((p) => {
                        const breakdown = Array.isArray(p.breakdown) ? p.breakdown : [];

                        const breakdownHtml = breakdown.length
                          ? `
                            <details class="mt-1">
                              <summary class="small text-muted">View breakdown</summary>
                              <ul class="small mb-0">
                                ${breakdown
                                  .map((it) => `<li>${escapeHtml(it.name)} — ${money(it.amount)}</li>`)
                                  .join("")}
                              </ul>
                            </details>
                          `
                          : `<div class="small text-muted">No breakdown stored</div>`;

                        // IMPORTANT: Only show Edit if:
                        // - pending
                        // - created_by matches current user id (prevents "Not your proposal")
                        const canEdit = p.status === "pending" && myUserId && p.created_by === myUserId;

                        return `
                          <tr>
                            <td>
                              <div class="fw-semibold">${escapeHtml(p.title)}</div>
                              <div class="small text-muted">${escapeHtml(p.description || "")}</div>
                              ${breakdownHtml}
                            </td>
                            <td>${badge(p.status)}</td>
                            <td>${money(p.required_per_student)}</td>
                            <td>${fmtDate(p.created_at)}</td>
                            <td class="text-end">
                              <a class="btn btn-sm btn-outline-primary" href="/pages/officer-payments.html?id=${p.id}">
                                <i class="bi bi-receipt me-1"></i>Payments
                              </a>
                              ${
                                canEdit
                                  ? `<button class="btn btn-sm btn-outline-secondary ms-1" data-edit="${p.id}" type="button">
                                       <i class="bi bi-pencil me-1"></i>Edit
                                     </button>`
                                  : ``
                              }
                            </td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `<tr><td colspan="5" class="text-muted">No proposals yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    // ---- Breakdown controls wiring (same logic, just re-wired after render) ----
    const itemsWrap = el("itemsWrap");

    function refreshItemsUI() {
      itemsWrap.innerHTML = renderItemsTable();
      wireItemsEvents();
    }

    function wireItemsEvents() {
      el("btnAddItem").addEventListener("click", () => {
        items.push({ name: "", amount: 0 });
        refreshItemsUI();
      });

      itemsWrap.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-remove"));
          items.splice(idx, 1);
          if (items.length === 0) items.push({ name: "", amount: 0 });
          refreshItemsUI();
        });
      });

      itemsWrap.querySelectorAll("[data-name]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const idx = Number(inp.getAttribute("data-name"));
          items[idx].name = inp.value;
        });
      });

      itemsWrap.querySelectorAll("[data-amount]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const idx = Number(inp.getAttribute("data-amount"));
          items[idx].amount = Number(inp.value || 0);
          const totalEl = el("totalRequired");
          if (totalEl) totalEl.textContent = money(calcTotal());
        });
      });
    }

    wireItemsEvents();

    // ---- Create Proposal (same logic) ----
    el("createForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const msg = el("msg");
      const btn = el("btnCreate");
      msg.innerHTML = "";
      btn.disabled = true;

      try {
        const title = el("title").value.trim();
        const description = el("description").value.trim();

        const breakdown = items
          .map((it) => ({ name: (it.name || "").trim(), amount: Number(it.amount || 0) }))
          .filter((it) => it.name.length > 0);

        if (breakdown.length === 0) throw new Error("Please add at least 1 breakdown item.");
        if (breakdown.some((it) => !Number.isFinite(it.amount) || it.amount < 0)) {
          throw new Error("All breakdown amounts must be 0 or more.");
        }

        await createProposal({
          title,
          description: description || undefined,
          breakdown,
        });

        msg.innerHTML = `<div class="alert alert-success mb-0">Proposal created!</div>`;

        // reset
        e.target.reset();
        items = [{ name: "Registration", amount: 50 }];
        await load();
      } catch (err) {
        msg.innerHTML = `<div class="alert alert-danger mb-0">${err.message}</div>`;
      } finally {
        btn.disabled = false;
      }
    });

    // ---- Edit button wiring (now opens modal, not prompt) ----
    content.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-edit");
        const p = proposalsById.get(id);
        if (!p) return;
        openEditModal(p);
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