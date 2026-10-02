import { getProposals, createProposal, editProposal } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");
const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function badge(status) {
  const cls =
    status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
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

async function init() {
  const content = document.getElementById("content");
  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  // local state for breakdown rows
  let items = [
    { name: "Registration", amount: 50 },
    { name: "Palaro", amount: 300 }
  ];

  const calcTotal = () =>
    items.reduce((sum, it) => sum + Number(it.amount || 0), 0);

  function renderItemsTable() {
    const rows = items
      .map(
        (it, idx) => `
        <tr>
          <td>
            <input class="form-control form-control-sm" data-name="${idx}" value="${escapeHtml(
              it.name || ""
            )}" placeholder="Item name" required>
          </td>
          <td style="width:180px;">
            <input class="form-control form-control-sm" data-amount="${idx}" type="number" min="0" step="0.01"
              value="${Number(it.amount || 0)}" required>
          </td>
          <td style="width:90px;" class="text-end">
            <button class="btn btn-sm btn-outline-danger" data-remove="${idx}" type="button">Remove</button>
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
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="d-flex gap-2 align-items-center">
        <button class="btn btn-sm btn-outline-primary" id="btnAddItem" type="button">Add Item</button>
        <div class="ms-auto">
          <span class="text-muted">Total required per student:</span>
          <b id="totalRequired">${money(calcTotal())}</b>
        </div>
      </div>
    `;
  }

  async function load() {
    const proposals = await getProposals(); // officer gets own proposals

    content.innerHTML = `
      <div class="card card-soft p-3 mb-3" style="max-width: 980px;">
        <h5 class="mb-3">Create Proposal (Breakdown Fees)</h5>

        <form id="createForm" class="row g-2">
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

          <div class="col-12 mt-2">
            <button class="btn btn-primary" id="btnCreate" type="submit">Create Proposal</button>
          </div>

          <div class="col-12" id="msg"></div>
        </form>
      </div>

      <div class="card card-soft p-3">
        <h5 class="mb-3">My Proposals</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Required/Student</th>
                <th>Created</th>
                <th></th>
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
                                  .map(
                                    (it) =>
                                      `<li>${escapeHtml(it.name)} — ${money(it.amount)}</li>`
                                  )
                                  .join("")}
                              </ul>
                            </details>
                          `
                          : `<div class="small text-muted">No breakdown stored</div>`;

                        return `
                          <tr>
                            <td>
                              <div><b>${escapeHtml(p.title)}</b></div>
                              <div class="small text-muted">${escapeHtml(p.description || "")}</div>
                              ${breakdownHtml}
                            </td>
                            <td>${badge(p.status)}</td>
                            <td>${money(p.required_per_student)}</td>
                            <td>${fmtDate(p.created_at)}</td>
                            <td class="text-end">
                              <a class="btn btn-sm btn-outline-primary" href="/pages/officer-payments.html?id=${p.id}">
                                Payments
                              </a>
                              ${
                                p.status === "pending"
                                  ? `<button class="btn btn-sm btn-outline-secondary ms-1" data-edit="${p.id}" type="button">Edit Title/Desc</button>`
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

    // --- Wire breakdown controls ---
    const itemsWrap = document.getElementById("itemsWrap");

    function refreshItemsUI() {
      itemsWrap.innerHTML = renderItemsTable();
      wireItemsEvents();
    }

    function wireItemsEvents() {
      document.getElementById("btnAddItem").addEventListener("click", () => {
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
          const totalEl = document.getElementById("totalRequired");
          if (totalEl) totalEl.textContent = money(calcTotal());
        });
      });
    }

    wireItemsEvents();

    // --- Create Proposal ---
    document.getElementById("createForm").addEventListener("submit", async (e) => {
      e.preventDefault();

      const msg = document.getElementById("msg");
      const btn = document.getElementById("btnCreate");
      msg.innerHTML = "";
      btn.disabled = true;

      try {
        const title = document.getElementById("title").value.trim();
        const description = document.getElementById("description").value.trim();

        // clean breakdown: remove empty names, ensure amounts valid
        const breakdown = items
          .map((it) => ({ name: (it.name || "").trim(), amount: Number(it.amount || 0) }))
          .filter((it) => it.name.length > 0);

        if (breakdown.length === 0) {
          throw new Error("Please add at least 1 breakdown item.");
        }
        if (breakdown.some((it) => !Number.isFinite(it.amount) || it.amount < 0)) {
          throw new Error("All breakdown amounts must be 0 or more.");
        }

        await createProposal({
          title,
          description: description || undefined,
          breakdown
        });

        msg.innerHTML = `<div class="alert alert-success">Proposal created!</div>`;

        // reset form + items
        e.target.reset();
        items = [{ name: "Registration", amount: 50 }];
        await load();
      } catch (err) {
        msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      } finally {
        btn.disabled = false;
      }
    });

    // --- Edit Title/Desc only (keeps it simple for SP101) ---
    content.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-edit");
        const newTitle = prompt("New title (leave blank to keep):");
        if (newTitle === null) return;

        const newDesc = prompt("New description (leave blank to keep):");
        if (newDesc === null) return;

        const payload = {};
        if (newTitle.trim()) payload.title = newTitle.trim();
        if (newDesc.trim()) payload.description = newDesc.trim();

        if (Object.keys(payload).length === 0) return;

        try {
          await editProposal(id, payload);
          await load();
        } catch (e) {
          alert(e.message);
        }
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