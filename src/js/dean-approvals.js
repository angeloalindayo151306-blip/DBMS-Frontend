import { getProposals, setProposalStatus } from "./api.js";
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

function computeRequired(p) {
  if (p?.required_per_student != null) return num(p.required_per_student);
  const breakdown = Array.isArray(p?.breakdown) ? p.breakdown : [];
  return breakdown.reduce((s, b) => s + num(b?.amount), 0);
}

function toast(message, variant = "primary") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const id = `t_${Math.random().toString(16).slice(2)}`;
  container.insertAdjacentHTML(
    "beforeend",
    `
    <div id="${id}" class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `
  );

  const el = document.getElementById(id);
  const t = new bootstrap.Toast(el, { delay: 2500 });
  el.addEventListener("hidden.bs.toast", () => el.remove());
  t.show();
}

function confirmAction(message) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById("confirmModal");
    const msgEl = document.getElementById("confirmMessage");
    const okBtn = document.getElementById("confirmOkBtn");

    if (!modalEl || !msgEl || !okBtn) {
      resolve(window.confirm(message));
      return;
    }

    msgEl.textContent = message;

    const modal = new bootstrap.Modal(modalEl);

    const onOk = () => {
      cleanup();
      modal.hide();
      resolve(true);
    };
    const onHide = () => {
      cleanup();
      resolve(false);
    };
    function cleanup() {
      okBtn.removeEventListener("click", onOk);
      modalEl.removeEventListener("hidden.bs.modal", onHide);
    }

    okBtn.addEventListener("click", onOk);
    modalEl.addEventListener("hidden.bs.modal", onHide);

    modal.show();
  });
}

let auth = null;
let proposals = [];
let currentStatus = "pending";
let currentQuery = "";
let selected = null;
let proposalModal = null;

function setCounts() {
  const pending = proposals.filter((p) => String(p?.status).toLowerCase() === "pending").length;
  const approved = proposals.filter((p) => String(p?.status).toLowerCase() === "approved").length;
  const rejected = proposals.filter((p) => String(p?.status).toLowerCase() === "rejected").length;

  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };

  setText("countPending", pending);
  setText("countApproved", approved);
  setText("countRejected", rejected);
  setText("countAll", proposals.length);
}

function setActiveStatusTab(status) {
  document.querySelectorAll(".statusTab").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-status") === status);
  });
}

function filteredRows() {
  const q = currentQuery.trim().toLowerCase();
  return proposals.filter((p) => {
    const status = String(p?.status || "").toLowerCase();
    const okStatus = currentStatus === "all" ? true : status === currentStatus;
    const okQuery = !q ? true : String(p?.title || "").toLowerCase().includes(q);
    return okStatus && okQuery;
  });
}

function renderTable() {
  const tbody = document.getElementById("approvalsTbody");
  if (!tbody) return;

  const rows = filteredRows().slice();
  rows.sort(
    (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
  );

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No proposals found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((p) => {
      const title = escapeHtml(p?.title || "Untitled Proposal");
      const desc = escapeHtml(p?.description || "");
      const id = escapeHtml(p?.id || "");
      return `
        <tr>
          <td>
            <div class="fw-semibold">${title}</div>
            ${desc ? `<div class="small text-muted">${desc}</div>` : ""}
          </td>
          <td>${fmtDate(p?.created_at)}</td>
          <td>${badge(p?.status)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary btnView" data-id="${id}">
              <i class="bi bi-eye me-1"></i> View
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function fillModal(p) {
  selected = p;

  document.getElementById("pmTitle").textContent = p?.title || "Untitled Proposal";
  document.getElementById("pmMeta").textContent = `Created: ${fmtDate(p?.created_at)} • ID: ${p?.id}`;

  document.getElementById("pmStatus").innerHTML = badge(p?.status);
  document.getElementById("pmRequired").textContent = money(computeRequired(p));
  document.getElementById("pmDescription").textContent = p?.description ? String(p.description) : "";

  const existing = document.getElementById("pmExistingComment");
  existing.textContent = p?.dean_comment ? `Existing comment: ${p.dean_comment}` : "";

  document.getElementById("pmComment").value = "";

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

  const canReview = auth?.role === "dean" && String(p?.status).toLowerCase() === "pending";
  document.getElementById("btnApprove").classList.toggle("d-none", !canReview);
  document.getElementById("btnReject").classList.toggle("d-none", !canReview);

  const hint = document.getElementById("pmFooterHint");
  hint.textContent =
    auth?.role !== "dean"
      ? "You can view proposals, but only the Dean can approve/reject."
      : String(p?.status).toLowerCase() !== "pending"
        ? "This proposal is already reviewed."
        : "";
}

async function refreshData() {
  const res = await getProposals(); // dean/president sees all
  proposals = Array.isArray(res) ? res : [];
  setCounts();
  renderTable();
}

async function init() {
  auth = await requireRoles(["dean", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  const viewerNameEl = document.getElementById("viewerName");
  if (viewerNameEl) viewerNameEl.textContent = auth.me?.full_name || auth.role;

  await refreshData();

  setActiveStatusTab(currentStatus);

  // Setup proposal modal
  const proposalModalEl = document.getElementById("proposalModal");
  proposalModal = new bootstrap.Modal(proposalModalEl);

  // Filters
  document.getElementById("searchBox")?.addEventListener("input", (e) => {
    currentQuery = e.target.value || "";
    renderTable();
  });

  document.querySelectorAll(".statusTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentStatus = btn.getAttribute("data-status") || "pending";
      setActiveStatusTab(currentStatus);
      renderTable();
    });
  });

  document.getElementById("btnRefresh")?.addEventListener("click", () => window.location.reload());

  // View click (event delegation)
  document.getElementById("approvalsTbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btnView");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    const p = proposals.find((x) => String(x?.id) === String(id));
    if (!p) return;

    fillModal(p);
    proposalModal.show();
  });

  const lock = (on) => {
    document.getElementById("btnApprove").disabled = on;
    document.getElementById("btnReject").disabled = on;
  };

  document.getElementById("btnApprove")?.addEventListener("click", async () => {
    if (!selected) return;

    const ok = await confirmAction("Approve this proposal?");
    if (!ok) return;

    lock(true);
    try {
      const comment = document.getElementById("pmComment")?.value || "";
      await setProposalStatus(selected.id, {
        status: "approved",
        dean_comment: comment.trim() ? comment.trim() : undefined,
      });
      toast("Proposal approved.", "success");
      proposalModal.hide();
      await refreshData();
    } catch (e) {
      toast(e?.message || "Failed to approve.", "danger");
    } finally {
      lock(false);
    }
  });

  document.getElementById("btnReject")?.addEventListener("click", async () => {
    if (!selected) return;

    const ok = await confirmAction("Reject this proposal?");
    if (!ok) return;

    lock(true);
    try {
      const comment = document.getElementById("pmComment")?.value || "";
      await setProposalStatus(selected.id, {
        status: "rejected",
        dean_comment: comment.trim() ? comment.trim() : undefined,
      });
      toast("Proposal rejected.", "danger");
      proposalModal.hide();
      await refreshData();
    } catch (e) {
      toast(e?.message || "Failed to reject.", "danger");
    } finally {
      lock(false);
    }
  });
}

init();