import { apiFetch, getProposals, setProposalStatus } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

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

const money = (n) =>
  `₱ ${num(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

function badge(statusRaw) {
  const status = String(statusRaw || "pending").toLowerCase();
  const cls =
    status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls} text-capitalize">${escapeHtml(status)}</span>`;
}

function toast(type, html) {
  const toastEl = document.getElementById("appToast");
  const bodyEl = document.getElementById("appToastBody");

  const map = {
    success: { cls: "text-bg-success", icon: "bi-check2-circle" },
    danger: { cls: "text-bg-danger", icon: "bi-x-circle" },
    warning: { cls: "text-bg-warning", icon: "bi-exclamation-triangle" },
    info: { cls: "text-bg-info", icon: "bi-info-circle" },
  };

  const t = map[type] || map.info;
  toastEl.className = `toast align-items-center border-0 ${t.cls}`;
  bodyEl.innerHTML = `<i class="bi ${t.icon} me-2"></i>${html}`;

  new bootstrap.Toast(toastEl, { delay: 2600 }).show();
}

let bsConfirmModal = null;
function confirmModal({
  title = "Confirm",
  body = "Are you sure?",
  okText = "Confirm",
  okBtnClass = "btn-danger",
} = {}) {
  const modalEl = document.getElementById("confirmModal");
  if (!bsConfirmModal) bsConfirmModal = new bootstrap.Modal(modalEl);

  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmBody").innerHTML = body;

  const okBtn = document.getElementById("confirmOkBtn");
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

/* ===================== DATA STATE ===================== */
let auth = null;

// proposals
let proposals = [];
let proposalStatus = "pending";
let proposalQuery = "";
let selectedProposal = null;
let proposalModal = null;

// expenses
let expenses = [];
let expenseStatus = "pending";
let expenseQuery = "";
let expenseProposalIdFilter = "";
let selectedExpense = null;
let expenseModal = null;

/* ===================== HELPERS ===================== */
function computeRequired(p) {
  if (p?.required_per_student != null) return num(p.required_per_student);
  const bd = Array.isArray(p?.breakdown) ? p.breakdown : [];
  return bd.reduce((s, b) => s + num(b?.amount), 0);
}

function setActiveButtons(selector, status) {
  document.querySelectorAll(selector).forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-status") === status);
  });
}

function creatorLabel(p) {
  const c = p?.creator;
  if (!c) return "—";
  const name =
    c.full_name ||
    [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") ||
    "—";
  const title = c.officer_title ? ` (${c.officer_title})` : "";
  return `${name}${title}`;
}

function creatorSearchHay(p) {
  const c = p?.creator;
  if (!c) return "";
  return `${c.full_name || ""} ${c.officer_title || ""} ${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
}

/* ===================== PROPOSALS UI ===================== */
function setProposalCounts() {
  const pending = proposals.filter((p) => String(p?.status).toLowerCase() === "pending").length;
  const approved = proposals.filter((p) => String(p?.status).toLowerCase() === "approved").length;
  const rejected = proposals.filter((p) => String(p?.status).toLowerCase() === "rejected").length;

  document.getElementById("countPending").textContent = String(pending);
  document.getElementById("countApproved").textContent = String(approved);
  document.getElementById("countRejected").textContent = String(rejected);
  document.getElementById("countAll").textContent = String(proposals.length);

  document.getElementById("badgeProposalPending").textContent = String(pending);
}

function filteredProposals() {
  const q = proposalQuery.trim().toLowerCase();

  return proposals.filter((p) => {
    const st = String(p?.status || "").toLowerCase();
    const okStatus = proposalStatus === "all" ? true : st === proposalStatus;

    if (!okStatus) return false;
    if (!q) return true;

    const title = String(p?.title || "").toLowerCase();
    const desc = String(p?.description || "").toLowerCase();
    const createdBy = String(p?.created_by || "").toLowerCase();
    const creatorHay = creatorSearchHay(p);

    return (
      title.includes(q) ||
      desc.includes(q) ||
      createdBy.includes(q) ||
      creatorHay.includes(q)
    );
  });
}

function renderProposalsTable() {
  const tbody = document.getElementById("approvalsTbody");

  const rows = filteredProposals()
    .slice()
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No proposals found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((p) => {
      const title = escapeHtml(p?.title || "Untitled Proposal");
      const desc = escapeHtml(p?.description || "");
      const by = escapeHtml(creatorLabel(p));

      return `
        <tr>
          <td>
            <div class="fw-semibold">${title}</div>
            ${desc ? `<div class="small text-muted">${desc}</div>` : ""}
            <div class="small text-muted">Submitted by: <b>${by}</b></div>
          </td>
          <td>${fmtDate(p?.created_at)}</td>
          <td>${badge(p?.status)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary btnViewProposal" data-id="${escapeHtml(p?.id)}">
              <i class="bi bi-eye me-1"></i> View
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillProposalModal(p) {
  selectedProposal = p;

  const by = creatorLabel(p);

  document.getElementById("pmTitle").textContent = p?.title || "Untitled Proposal";
  document.getElementById("pmMeta").textContent =
    `Created: ${fmtDate(p?.created_at)} • ID: ${p?.id || "—"} • Submitted by: ${by}`;

  document.getElementById("pmStatus").innerHTML = badge(p?.status);
  document.getElementById("pmRequired").textContent = money(computeRequired(p));
  document.getElementById("pmDescription").textContent = p?.description ? String(p.description) : "";

  const breakdown = Array.isArray(p?.breakdown) ? p.breakdown : [];
  const bdTbody = document.getElementById("pmBreakdownTbody");
  bdTbody.innerHTML = breakdown.length
    ? breakdown
        .map(
          (b) => `
            <tr>
              <td>${escapeHtml(b?.name || "—")}</td>
              <td class="text-end">${money(b?.amount)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="2" class="text-muted">No breakdown data.</td></tr>`;

  document.getElementById("pmComment").value = "";
  document.getElementById("pmExistingComment").textContent = p?.dean_comment
    ? `Existing comment: ${p.dean_comment}`
    : "";

  const canReview = auth?.role === "dean" && String(p?.status).toLowerCase() === "pending";
  document.getElementById("btnApprove").classList.toggle("d-none", !canReview);
  document.getElementById("btnReject").classList.toggle("d-none", !canReview);

  document.getElementById("pmFooterHint").textContent =
    auth?.role !== "dean"
      ? "You can view proposals, but only the Dean can approve/reject."
      : String(p?.status).toLowerCase() !== "pending"
        ? "This proposal is already reviewed."
        : "";
}

/* ===================== EXPENSES UI (unchanged) ===================== */
function setExpenseCounts() {
  const pending = expenses.filter((e) => String(e?.status).toLowerCase() === "pending").length;
  const approved = expenses.filter((e) => String(e?.status).toLowerCase() === "approved").length;
  const rejected = expenses.filter((e) => String(e?.status).toLowerCase() === "rejected").length;

  document.getElementById("expCountPending").textContent = String(pending);
  document.getElementById("expCountApproved").textContent = String(approved);
  document.getElementById("expCountRejected").textContent = String(rejected);
  document.getElementById("expCountAll").textContent = String(expenses.length);

  document.getElementById("badgeExpensePending").textContent = String(pending);
}

function filteredExpenses() {
  const q = expenseQuery.trim().toLowerCase();
  return expenses.filter((e) => {
    const st = String(e?.status || "").toLowerCase();
    const okStatus = expenseStatus === "all" ? true : st === expenseStatus;

    const okEvent = !expenseProposalIdFilter
      ? true
      : String(e?.proposal_id || "") === String(expenseProposalIdFilter);

    if (!okStatus || !okEvent) return false;
    if (!q) return true;

    const item = String(e?.item_name || "").toLowerCase();
    const by = String(e?.spender?.full_name || e?.spender?.id || "").toLowerCase();
    const ev = String(e?.proposal?.title || "").toLowerCase();

    return item.includes(q) || by.includes(q) || ev.includes(q);
  });
}

function renderExpensesTable() {
  const tbody = document.getElementById("expensesTbody");
  const rows = filteredExpenses();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No expenses found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((e) => {
      const eventTitle = e?.proposal?.title ? escapeHtml(e.proposal.title) : "General";
      const spentBy = escapeHtml(e?.spender?.full_name || "—");

      return `
        <tr>
          <td class="text-nowrap">${fmtDate(e?.spent_at)}</td>
          <td>
            <div class="fw-semibold">${escapeHtml(e?.item_name || "—")}</div>
            ${e?.qty ? `<div class="small text-muted">Qty: ${escapeHtml(e.qty)}</div>` : ""}
          </td>
          <td>${eventTitle}</td>
          <td>${spentBy}</td>
          <td class="text-end">${money(e?.amount)}</td>
          <td>${badge(e?.status)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary btnViewExpense" data-id="${escapeHtml(e?.id)}">
              <i class="bi bi-eye me-1"></i> View
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function fillExpenseModal(e) {
  selectedExpense = e;

  document.getElementById("exTitle").textContent = "Expense Details";
  document.getElementById("exMeta").textContent = `Spent: ${fmtDate(e?.spent_at)} • ID: ${e?.id || "—"}`;

  document.getElementById("exItem").textContent = e?.item_name || "—";
  document.getElementById("exAmount").textContent = money(e?.amount);
  document.getElementById("exStatus").innerHTML = badge(e?.status);

  document.getElementById("exEvent").textContent = e?.proposal?.title || "General / Not linked";
  document.getElementById("exSpentBy").textContent = e?.spender?.full_name || "—";
  document.getElementById("exNotes").textContent = e?.notes || "—";

  document.getElementById("exComment").value = "";
  document.getElementById("exExistingComment").textContent = e?.dean_comment
    ? `Existing comment: ${e.dean_comment}`
    : "";

  const canReview = auth?.role === "dean" && String(e?.status).toLowerCase() === "pending";
  document.getElementById("btnExpApprove").classList.toggle("d-none", !canReview);
  document.getElementById("btnExpReject").classList.toggle("d-none", !canReview);

  document.getElementById("exFooterHint").textContent =
    auth?.role !== "dean"
      ? "You can view expenses, but only the Dean can approve/reject."
      : String(e?.status).toLowerCase() !== "pending"
        ? "This expense is already reviewed."
        : "";

  const wrap = document.getElementById("exReceiptWrap");
  wrap.innerHTML = `<div class="text-muted small">Loading receipt...</div>`;

  try {
    const r = await apiFetch(`/expenses/${encodeURIComponent(e.id)}/receipt-url`);
    const url = r?.signedUrl || null;

    if (!url) {
      wrap.innerHTML = `<div class="text-muted small">No receipt uploaded.</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        <a class="btn btn-sm btn-outline-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">
          <i class="bi bi-box-arrow-up-right me-1"></i> Open Receipt
        </a>
      </div>
      <img src="${escapeHtml(url)}" alt="Receipt" class="img-fluid border rounded" />
    `;
  } catch {
    wrap.innerHTML = `<div class="text-danger small">Failed to load receipt.</div>`;
  }
}

/* ===================== LOADERS ===================== */
async function loadProposals() {
  proposals = await getProposals();
  if (!Array.isArray(proposals)) proposals = [];

  setProposalCounts();
  renderProposalsTable();

  // Populate event filter dropdown for expenses (approved only)
  const select = document.getElementById("expenseEventFilter");
  const approved = proposals
    .filter((p) => String(p?.status).toLowerCase() === "approved")
    .slice()
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

  const current = select.value;

  select.innerHTML = `
    <option value="">All events (including General)</option>
    ${approved
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title || "Untitled")}</option>`)
      .join("")}
  `;

  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

async function loadExpenses() {
  const rows = await apiFetch("/expenses");
  expenses = Array.isArray(rows) ? rows : [];
  setExpenseCounts();
  renderExpensesTable();
}

/* ===================== INIT ===================== */
async function init() {
  auth = await requireRoles(["dean", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);
  document.getElementById("viewerName").textContent = auth.me?.full_name || auth.role;

  proposalModal = new bootstrap.Modal(document.getElementById("proposalModal"));
  expenseModal = new bootstrap.Modal(document.getElementById("expenseModal"));

  await Promise.all([loadProposals(), loadExpenses()]);

  document.getElementById("btnRefreshAll").addEventListener("click", async () => {
    await Promise.all([loadProposals(), loadExpenses()]);
    toast("success", "Refreshed successfully.");
  });

  // proposal filters
  document.getElementById("proposalSearch").addEventListener("input", (e) => {
    proposalQuery = e.target.value || "";
    renderProposalsTable();
  });

  document.querySelectorAll(".propStatusTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      proposalStatus = btn.getAttribute("data-status") || "pending";
      setActiveButtons(".propStatusTab", proposalStatus);
      renderProposalsTable();
    });
  });

  // expense filters
  document.getElementById("expenseSearch").addEventListener("input", (e) => {
    expenseQuery = e.target.value || "";
    renderExpensesTable();
  });

  document.getElementById("expenseEventFilter").addEventListener("change", (e) => {
    expenseProposalIdFilter = e.target.value || "";
    renderExpensesTable();
  });

  document.querySelectorAll(".expStatusTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      expenseStatus = btn.getAttribute("data-status") || "pending";
      setActiveButtons(".expStatusTab", expenseStatus);
      renderExpensesTable();
    });
  });

  // view proposal
  document.getElementById("approvalsTbody").addEventListener("click", (e) => {
    const btn = e.target.closest(".btnViewProposal");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    const p = proposals.find((x) => String(x?.id) === String(id));
    if (!p) return;

    fillProposalModal(p);
    proposalModal.show();
  });

  // view expense
  document.getElementById("expensesTbody").addEventListener("click", async (e) => {
    const btn = e.target.closest(".btnViewExpense");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    const ex = expenses.find((x) => String(x?.id) === String(id));
    if (!ex) return;

    await fillExpenseModal(ex);
    expenseModal.show();
  });

  // Proposal approve/reject
  const lockProposalButtons = (locked) => {
    const a = document.getElementById("btnApprove");
    const r = document.getElementById("btnReject");
    if (a) a.disabled = locked;
    if (r) r.disabled = locked;
  };

  document.getElementById("btnApprove").addEventListener("click", async () => {
    if (!selectedProposal) return;

    const ok = await confirmModal({
      title: "Approve Proposal",
      body: "Approve this proposal?",
      okText: "Approve",
      okBtnClass: "btn-success",
    });
    if (!ok) return;

    lockProposalButtons(true);
    try {
      const comment = document.getElementById("pmComment").value || "";
      await setProposalStatus(selectedProposal.id, {
        status: "approved",
        dean_comment: comment.trim() ? comment.trim() : undefined,
      });
      toast("success", "Proposal approved.");
      proposalModal.hide();
      await loadProposals();
    } catch (err) {
      toast("danger", escapeHtml(err.message || "Failed to approve."));
    } finally {
      lockProposalButtons(false);
    }
  });

  document.getElementById("btnReject").addEventListener("click", async () => {
    if (!selectedProposal) return;

    const ok = await confirmModal({
      title: "Reject Proposal",
      body: "Reject this proposal?",
      okText: "Reject",
      okBtnClass: "btn-danger",
    });
    if (!ok) return;

    lockProposalButtons(true);
    try {
      const comment = document.getElementById("pmComment").value || "";
      await setProposalStatus(selectedProposal.id, {
        status: "rejected",
        dean_comment: comment.trim() ? comment.trim() : undefined,
      });
      toast("danger", "Proposal rejected.");
      proposalModal.hide();
      await loadProposals();
    } catch (err) {
      toast("danger", escapeHtml(err.message || "Failed to reject."));
    } finally {
      lockProposalButtons(false);
    }
  });

  // Expense approve/reject
  const lockExpenseButtons = (locked) => {
    const a = document.getElementById("btnExpApprove");
    const r = document.getElementById("btnExpReject");
    if (a) a.disabled = locked;
    if (r) r.disabled = locked;
  };

  document.getElementById("btnExpApprove").addEventListener("click", async () => {
    if (!selectedExpense) return;

    const ok = await confirmModal({
      title: "Approve Expense",
      body: "Approve this expense record?",
      okText: "Approve",
      okBtnClass: "btn-success",
    });
    if (!ok) return;

    lockExpenseButtons(true);
    try {
      const comment = document.getElementById("exComment").value || "";
      await apiFetch(`/expenses/${encodeURIComponent(selectedExpense.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "approved",
          dean_comment: comment.trim() ? comment.trim() : undefined,
        }),
      });

      toast("success", "Expense approved.");
      expenseModal.hide();
      await loadExpenses();
    } catch (err) {
      toast("danger", escapeHtml(err.message || "Failed to approve expense."));
    } finally {
      lockExpenseButtons(false);
    }
  });

  document.getElementById("btnExpReject").addEventListener("click", async () => {
    if (!selectedExpense) return;

    const ok = await confirmModal({
      title: "Reject Expense",
      body: "Reject this expense record?",
      okText: "Reject",
      okBtnClass: "btn-danger",
    });
    if (!ok) return;

    lockExpenseButtons(true);
    try {
      const comment = document.getElementById("exComment").value || "";
      await apiFetch(`/expenses/${encodeURIComponent(selectedExpense.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "rejected",
          dean_comment: comment.trim() ? comment.trim() : undefined,
        }),
      });

      toast("danger", "Expense rejected.");
      expenseModal.hide();
      await loadExpenses();
    } catch (err) {
      toast("danger", escapeHtml(err.message || "Failed to reject expense."));
    } finally {
      lockExpenseButtons(false);
    }
  });
}

init();