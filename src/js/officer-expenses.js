import { apiFetch, getProposals } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";
import { API_BASE_URL } from "./config.js";
import { getAccessToken } from "./auth.js";

const el = (id) => document.getElementById(id);

const escapeHtml = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n) => `₱ ${num(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

function badge(statusRaw) {
  const status = String(statusRaw || "pending").toLowerCase();
  const cls = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls} text-capitalize">${escapeHtml(status)}</span>`;
}

// ---- toast ----
let bsToast = null;
function toast(type, html) {
  const toastEl = el("appToast");
  const bodyEl = el("appToastBody");

  const map = {
    success: { cls: "text-bg-success", icon: "bi-check2-circle" },
    danger: { cls: "text-bg-danger", icon: "bi-x-circle" },
    warning: { cls: "text-bg-warning", icon: "bi-exclamation-triangle" },
    info: { cls: "text-bg-info", icon: "bi-info-circle" },
  };

  const t = map[type] || map.info;
  toastEl.className = `toast align-items-center border-0 ${t.cls}`;
  bodyEl.innerHTML = `<i class="bi ${t.icon} me-2"></i>${html}`;

  if (!bsToast) bsToast = new bootstrap.Toast(toastEl, { delay: 2600 });
  bsToast.show();
}

// ---- confirm ----
let bsConfirmModal = null;
function confirmModal({ title = "Confirm", body = "Are you sure?", okText = "Confirm", okBtnClass = "btn-danger" } = {}) {
  const modalEl = el("confirmModal");
  if (!bsConfirmModal) bsConfirmModal = new bootstrap.Modal(modalEl);

  el("confirmTitle").textContent = title;
  el("confirmBody").innerHTML = body;

  const okBtn = el("confirmOkBtn");
  okBtn.textContent = okText;
  okBtn.className = `btn ${okBtnClass}`;

  return new Promise((resolve) => {
    const onOk = () => {
      cleanup();
      bsConfirmModal.hide();
      resolve(true);
    };

    const onHidden = () => {
      cleanup();
      resolve(false);
    };

    function cleanup() {
      okBtn.removeEventListener("click", onOk);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
    }

    okBtn.addEventListener("click", onOk);
    modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });

    bsConfirmModal.show();
  });
}

// ---- state ----
let CACHE = [];
let APPROVED_PROPOSALS = [];
let MY_USER_ID = null; // for mine-only filter

// NEW: multi-item state
let items = [{ item_name: "", qty: null, amount: 0, notes: "" }];

function calcTotal() {
  return items.reduce((s, it) => s + num(it?.amount), 0);
}

function renderItemsTable() {
  const rows = items
    .map(
      (it, idx) => `
      <tr>
        <td>
          <input class="form-control form-control-sm" data-item-name="${idx}"
            value="${escapeHtml(it.item_name || "")}" placeholder="e.g., Tarpaulin printing" required />
        </td>
        <td style="width:140px;">
          <input class="form-control form-control-sm" data-item-qty="${idx}" type="number"
            min="1" step="1" value="${it.qty == null ? "" : escapeHtml(it.qty)}" placeholder="e.g., 2" />
        </td>
        <td style="width:180px;">
          <input class="form-control form-control-sm" data-item-amount="${idx}" type="number"
            min="0.01" step="0.01" value="${num(it.amount) || ""}" required />
        </td>
        <td>
          <input class="form-control form-control-sm" data-item-notes="${idx}"
            value="${escapeHtml(it.notes || "")}" placeholder="Notes (optional)" />
        </td>
        <td style="width:110px;" class="text-end">
          <button class="btn btn-sm btn-outline-danger" type="button" data-item-remove="${idx}">
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
            <th>Item Name</th>
            <th>Qty</th>
            <th class="text-nowrap">Amount (PHP)</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center">
      <button class="btn btn-sm btn-outline-primary" id="btnAddExpenseItem" type="button">
        <i class="bi bi-plus-circle me-1"></i>Add Item
      </button>

      <div class="ms-auto">
        <span class="text-muted">Batch total:</span>
        <b id="batchTotal">${money(calcTotal())}</b>
      </div>
    </div>
  `;
}

function wireItemsEvents() {
  const wrap = el("itemsWrap");
  if (!wrap) return;

  el("btnAddExpenseItem").addEventListener("click", () => {
    items.push({ item_name: "", qty: null, amount: 0, notes: "" });
    refreshItemsUI();
  });

  wrap.querySelectorAll("[data-item-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-item-remove"));
      items.splice(idx, 1);
      if (items.length === 0) items.push({ item_name: "", qty: null, amount: 0, notes: "" });
      refreshItemsUI();
    });
  });

  wrap.querySelectorAll("[data-item-name]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.getAttribute("data-item-name"));
      items[idx].item_name = inp.value;
    });
  });

  wrap.querySelectorAll("[data-item-qty]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.getAttribute("data-item-qty"));
      const v = inp.value;
      items[idx].qty = v === "" ? null : Number(v);
    });
  });

  wrap.querySelectorAll("[data-item-amount]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.getAttribute("data-item-amount"));
      items[idx].amount = Number(inp.value || 0);
      const totalEl = el("batchTotal");
      if (totalEl) totalEl.textContent = money(calcTotal());
    });
  });

  wrap.querySelectorAll("[data-item-notes]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const idx = Number(inp.getAttribute("data-item-notes"));
      items[idx].notes = inp.value;
    });
  });
}

function refreshItemsUI() {
  const wrap = el("itemsWrap");
  if (!wrap) return;
  wrap.innerHTML = renderItemsTable();
  wireItemsEvents();
}

function resetCreateForm() {
  el("expenseForm").reset();
  items = [{ item_name: "", qty: null, amount: 0, notes: "" }];
  refreshItemsUI();
}

function toIsoFromDatetimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function loadApprovedProposals() {
  const all = await getProposals();
  const arr = Array.isArray(all) ? all : [];

  APPROVED_PROPOSALS = arr
    .filter((p) => String(p?.status).toLowerCase() === "approved")
    .slice()
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

  const createSel = el("proposalSelect");
  const filterSel = el("eventFilter");

  const createCurrent = createSel.value;
  const filterCurrent = filterSel.value;

  createSel.innerHTML = `
    <option value="">General / Not linked</option>
    ${APPROVED_PROPOSALS.map(
      (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title || "Untitled")}</option>`
    ).join("")}
  `;

  filterSel.innerHTML = `
    <option value="">All events (including General)</option>
    ${APPROVED_PROPOSALS.map(
      (p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title || "Untitled")}</option>`
    ).join("")}
  `;

  if ([...createSel.options].some((o) => o.value === createCurrent)) createSel.value = createCurrent;
  if ([...filterSel.options].some((o) => o.value === filterCurrent)) filterSel.value = filterCurrent;
}

function applyFilters(rows) {
  const q = (el("searchBox").value || "").toLowerCase().trim();
  const status = el("statusFilter").value;
  const eventId = el("eventFilter").value;

  const showAll = !!el("toggleShowAll")?.checked;

  return (rows || []).filter((e) => {
    // mine-only default
    if (!showAll && MY_USER_ID && String(e?.spent_by) !== String(MY_USER_ID)) return false;

    const st = String(e?.status || "").toLowerCase();
    if (status !== "all" && st !== status) return false;

    if (eventId) {
      if (String(e?.proposal_id || "") !== String(eventId)) return false;
    }

    if (q) {
      const hay = `${e?.item_name || ""} ${e?.spender?.full_name || ""} ${e?.proposal?.title || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

async function openReceipt(expenseId) {
  try {
    const r = await apiFetch(`/expenses/${encodeURIComponent(expenseId)}/receipt-url`);
    const url = r?.signedUrl || null;
    if (!url) {
      toast("info", "No receipt uploaded for this expense.");
      return;
    }
    window.open(url, "_blank", "noopener");
  } catch (e) {
    toast("danger", e.message || "Failed to open receipt.");
  }
}

function render(rows) {
  const tbody = el("expensesTbody");
  const filtered = applyFilters(rows);

  el("listMeta").textContent = `Showing ${filtered.length} of ${(rows || []).length} expense(s)`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No expenses found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((e) => {
      const eventTitle = e?.proposal?.title ? escapeHtml(e.proposal.title) : "General";
      const spentBy = escapeHtml(e?.spender?.full_name || "—");

      return `
        <tr>
          <td class="text-nowrap">${fmtDate(e?.spent_at)}</td>
          <td>
            <div class="fw-semibold">${escapeHtml(e?.item_name || "—")}</div>
            ${e?.qty ? `<div class="small text-muted">Qty: ${escapeHtml(e.qty)}</div>` : ""}
            ${e?.notes ? `<div class="small text-muted">${escapeHtml(e.notes)}</div>` : ""}
          </td>
          <td>${eventTitle}</td>
          <td>${spentBy}</td>
          <td class="text-end">${money(e?.amount)}</td>
          <td>${badge(e?.status)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary btnReceipt" data-id="${escapeHtml(e.id)}">
              <i class="bi bi-image me-1"></i> Receipt
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".btnReceipt").forEach((btn) => {
    btn.addEventListener("click", () => openReceipt(btn.dataset.id));
  });
}

async function load() {
  el("msg").innerHTML = "";
  el("expensesTbody").innerHTML = `<tr><td colspan="7" class="text-muted">Loading…</td></tr>`;

  const rows = await apiFetch("/expenses");
  CACHE = Array.isArray(rows) ? rows : [];
  render(CACHE);
}

async function uploadReceipt(expenseId, file) {
  const token = await getAccessToken();
  if (!token) throw new Error("Missing access token.");

  const fd = new FormData();
  fd.append("receipt", file);

  const res = await fetch(`${API_BASE_URL}/expenses/${encodeURIComponent(expenseId)}/receipt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function onCreateExpense(e) {
  e.preventDefault();

  const btn = el("btnCreateExpense");
  btn.disabled = true;

  try {
    const proposal_id = el("proposalSelect").value || null;
    const spent_at_iso = toIsoFromDatetimeLocal(el("spentAt").value);

    // Build items (trim + validate)
    const cleanItems = (items || [])
      .map((it) => ({
        item_name: String(it?.item_name || "").trim(),
        qty: it?.qty === "" || it?.qty == null ? null : Number(it.qty),
        amount: Number(it?.amount),
        notes: String(it?.notes || "").trim() || null,
      }))
      .filter((it) => it.item_name.length > 0); // ignore blank rows

    if (!cleanItems.length) throw new Error("Please add at least 1 expense item.");
    if (cleanItems.some((it) => !Number.isFinite(it.amount) || it.amount <= 0)) {
      throw new Error("All item amounts must be greater than 0.");
    }
    if (cleanItems.some((it) => it.qty != null && (!Number.isFinite(it.qty) || it.qty <= 0))) {
      throw new Error("Qty must be blank or 1 or more.");
    }

    const total = cleanItems.reduce((s, it) => s + num(it.amount), 0);

    const previewList = cleanItems
      .slice(0, 8)
      .map(
        (it) =>
          `<li>${escapeHtml(it.item_name)} — <b>${escapeHtml(money(it.amount))}</b>${
            it.qty ? ` <span class="text-muted">(Qty: ${escapeHtml(it.qty)})</span>` : ""
          }</li>`
      )
      .join("");

    const more = cleanItems.length > 8 ? `<div class="text-muted small">(+${cleanItems.length - 8} more)</div>` : "";

    const ok = await confirmModal({
      title: "Save Expenses",
      body: `
        Save <b>${cleanItems.length}</b> expense item(s) as <b>pending</b> for dean approval?<br><br>
        <b>Batch total:</b> ${escapeHtml(money(total))}<br><br>
        <ul class="mb-2">${previewList}</ul>
        ${more}
        <div class="text-muted">Note: These records cannot be edited/deleted after saving.</div>
      `,
      okText: "Save",
      okBtnClass: "btn-success",
    });

    if (!ok) return;

    // Create one expense row per item (backend unchanged)
    const createdRows = [];
    for (let i = 0; i < cleanItems.length; i++) {
      const it = cleanItems[i];

      const payload = {
        proposal_id,
        item_name: it.item_name,
        qty: it.qty,
        amount: it.amount,
        notes: it.notes,
        ...(spent_at_iso ? { spent_at: spent_at_iso } : {}),
      };

      try {
        const created = await apiFetch("/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        createdRows.push(created);
      } catch (err) {
        throw new Error(`Failed on item #${i + 1} (“${it.item_name}”): ${err.message || "Error"}`);
      }
    }

    // Optional: upload the same receipt to each created expense
    const file = el("receiptFile").files?.[0] || null;
    if (file) {
      const failedUploads = [];
      for (const row of createdRows) {
        try {
          await uploadReceipt(row.id, file);
        } catch (err) {
          failedUploads.push(row.id);
        }
      }
      if (failedUploads.length) {
        toast("warning", `Saved expenses, but receipt upload failed for ${failedUploads.length} item(s).`);
      }
    }

    toast("success", `Saved ${createdRows.length} expense item(s) successfully (pending dean approval).`);
    resetCreateForm();
    await load();
  } catch (err) {
    toast("danger", err.message || "Failed to create expenses.");
  } finally {
    btn.disabled = false;
  }
}

async function init() {
  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(el("sidebar"), auth.role);

  // multi-item UI init
  refreshItemsUI();

  // get current user id (for mine-only default)
  try {
    const me = await apiFetch("/me");
    MY_USER_ID = me?.id || null;
  } catch {
    MY_USER_ID = null;
  }

  el("expenseForm").addEventListener("submit", onCreateExpense);
  el("btnClear").addEventListener("click", resetCreateForm);

  el("btnReload").addEventListener("click", async () => {
    await loadApprovedProposals();
    await load();
    toast("info", "Refreshed.");
  });

  el("statusFilter").addEventListener("change", () => render(CACHE));
  el("eventFilter").addEventListener("change", () => render(CACHE));
  el("searchBox").addEventListener("input", () => render(CACHE));
  el("toggleShowAll").addEventListener("change", () => render(CACHE));

  try {
    await loadApprovedProposals();
    await load();
  } catch (e) {
    el("msg").innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

init();