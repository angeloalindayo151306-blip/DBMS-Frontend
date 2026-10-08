import { getDepartmentReport, getProposals } from "./api.js";
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

function badgeHtml(statusRaw) {
  const status = String(statusRaw || "pending").toLowerCase();
  const cls =
    status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls} text-capitalize">${escapeHtml(status)}</span>`;
}

// Row id helper (supports both `id` and `proposal_id`)
function getRowId(r) {
  return r?.id || r?.proposal_id || "";
}

// Money helpers based on your known fields
function getBudget(r) {
  return r?.budget_total != null ? num(r.budget_total) : num(r?.required_per_student);
}
function getCollected(r) {
  return num(r?.collected_total ?? r?.collected ?? 0);
}
function getRemaining(r) {
  if (r?.remaining_budget != null) return num(r.remaining_budget);
  return Math.max(0, getBudget(r) - getCollected(r));
}

// Normalize breakdown into an array of {name, amount}
function normalizeBreakdown(bd) {
  if (!bd) return [];
  if (Array.isArray(bd)) return bd;

  // if breakdown is JSON string
  if (typeof bd === "string") {
    try {
      const parsed = JSON.parse(bd);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // if breakdown is an object (sometimes becomes {0:{...},1:{...}} or {items:[...]}
  if (typeof bd === "object") {
    if (Array.isArray(bd.items)) return bd.items;
    const vals = Object.values(bd);
    if (vals.every((v) => v && typeof v === "object")) return vals;
  }

  return [];
}

let proposalsById = null;
async function ensureProposalsMap() {
  if (proposalsById) return proposalsById;

  const list = await getProposals(); // existing endpoint; dean/president allowed
  const arr = Array.isArray(list) ? list : [];

  proposalsById = new Map(arr.map((p) => [String(p?.id), p]));
  return proposalsById;
}

function renderDetails(container, r) {
  if (!container) return;

  if (!r) {
    container.innerHTML = `<div class="text-muted small">Select an event from the table to view details.</div>`;
    return;
  }

  const breakdown = normalizeBreakdown(r.breakdown);
  const budget = getBudget(r);
  const collected = getCollected(r);
  const remaining = getRemaining(r);

  container.innerHTML = `
    <div class="d-flex align-items-start justify-content-between gap-2">
      <div>
        <div class="fw-semibold">${escapeHtml(r.title || "Untitled Event")}</div>
        <div class="small text-muted">${badgeHtml(r.status)}</div>
      </div>
    </div>

    <hr class="my-3" />

    <div class="small">
      <div class="d-flex justify-content-between">
        <span class="text-muted">Budget</span>
        <span class="fw-semibold">${money(budget)}</span>
      </div>
      <div class="d-flex justify-content-between mt-1">
        <span class="text-muted">Collected</span>
        <span class="fw-semibold">${money(collected)}</span>
      </div>
      <div class="d-flex justify-content-between mt-1">
        <span class="text-muted">Remaining</span>
        <span class="fw-semibold">${money(remaining)}</span>
      </div>
    </div>

    <hr class="my-3" />

    <div class="small">
      <div class="d-flex justify-content-between">
        <span class="text-muted">Created</span>
        <span>${fmtDate(r.created_at)}</span>
      </div>
      <div class="d-flex justify-content-between mt-1">
        <span class="text-muted">Reviewed</span>
        <span>${fmtDate(r.reviewed_at)}</span>
      </div>
    </div>

    <hr class="my-3" />

    <div class="fw-semibold mb-2">Breakdown</div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Item</th>
            <th class="text-end">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${
            breakdown.length
              ? breakdown
                  .map((b) => {
                    const name = b?.name ?? b?.item ?? b?.description ?? "—";
                    const amt = b?.amount ?? b?.cost ?? b?.value ?? 0;
                    return `
                      <tr>
                        <td>${escapeHtml(name)}</td>
                        <td class="text-end">${money(amt)}</td>
                      </tr>
                    `;
                  })
                  .join("")
              : `<tr><td colspan="2" class="text-muted">No breakdown data.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

async function renderDetailsWithFallback(detailsBox, row) {
  // First try using the report row itself
  const initial = normalizeBreakdown(row?.breakdown);
  if (initial.length) {
    renderDetails(detailsBox, row);
    return;
  }

  // If no breakdown in report row, fetch from proposals (existing endpoint)
  try {
    const map = await ensureProposalsMap();
    const pid = String(getRowId(row) || "");
    const p = map.get(pid);

    if (p && normalizeBreakdown(p.breakdown).length) {
      // merge fields (prefer report for collected totals, prefer proposal for breakdown)
      renderDetails(detailsBox, {
        ...p,
        ...row,
        breakdown: p.breakdown,
      });
      return;
    }
  } catch {
    // ignore and just render what we have
  }

  renderDetails(detailsBox, row);
}

function downloadCSV(rows) {
  const headers = ["Title", "Status", "Budget", "Collected", "Remaining", "Created At", "Reviewed At"];

  const csvEscape = (val) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r?.title ?? "",
        r?.status ?? "",
        getBudget(r),
        getCollected(r),
        getRemaining(r),
        r?.created_at ?? "",
        r?.reviewed_at ?? "",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename = `dfms-department-report-${new Date().toISOString().slice(0, 10)}.csv`;

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, "_blank", "noopener");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderTableRows(tbody, rows, selectedId) {
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = el("td", "text-muted", "No matching results.");
    td.colSpan = 6;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const id = String(getRowId(r) || "");
    const tr = document.createElement("tr");
    tr.dataset.id = id;
    tr.style.cursor = "pointer";
    if (selectedId && String(selectedId) === id) tr.classList.add("table-active");

    tr.appendChild(el("td", "fw-semibold", r?.title || "Untitled"));

    const tdStatus = document.createElement("td");
    tdStatus.innerHTML = badgeHtml(r?.status);
    tr.appendChild(tdStatus);

    tr.appendChild(el("td", "text-end", money(getBudget(r))));
    tr.appendChild(el("td", "text-end", money(getCollected(r))));
    tr.appendChild(el("td", "text-end", money(getRemaining(r))));

    const tdAction = el("td", "text-end");
    const btn = el("button", "btn btn-sm btn-outline-primary btnView");
    btn.type = "button";
    btn.innerHTML = `<i class="bi bi-eye me-1"></i> View`;
    tdAction.appendChild(btn);
    tr.appendChild(tdAction);

    tbody.appendChild(tr);
  }
}

async function init() {
  const auth = await requireRoles(["dean", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  const viewerNameEl = document.getElementById("viewerName");
  if (viewerNameEl) viewerNameEl.textContent = auth.me?.full_name || auth.role;

  const tbody = document.getElementById("reportTbody");
  const detailsBox = document.getElementById("detailsBox");

  let report = [];
  let currentRows = [];
  let selectedId = null;
  let loading = false;

  const load = async () => {
    if (loading) return;
    loading = true;

    try {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Loading report data...</td></tr>`;
      renderDetails(detailsBox, null);
      selectedId = null;
      proposalsById = null; // clear proposal cache on refresh

      const raw = await getDepartmentReport();
      report = Array.isArray(raw) ? raw.slice() : [];

      report.sort(
        (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
      );

      const approvedCount = report.filter((r) => String(r?.status).toLowerCase() === "approved")
        .length;

      const totalBudget = report.reduce((s, r) => s + getBudget(r), 0);
      const totalCollected = report.reduce((s, r) => s + getCollected(r), 0);
      const totalRemaining = report.reduce((s, r) => s + getRemaining(r), 0);

      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      setText("statApprovedCount", String(approvedCount));
      setText("statTotalBudget", money(totalBudget));
      setText("statTotalCollected", money(totalCollected));
      setText("statTotalRemaining", money(totalRemaining));

      const hasCollectedData = report.some(
        (r) => r && (r.collected_total != null || r.collected != null)
      );
      const noCollectedAlert = document.getElementById("noCollectedAlert");
      if (noCollectedAlert) noCollectedAlert.classList.toggle("d-none", hasCollectedData);

      currentRows = report.slice();
      renderTableRows(tbody, currentRows, selectedId);
    } finally {
      loading = false;
    }
  };

  const applyFilters = () => {
    const q = String(document.getElementById("searchBox")?.value || "")
      .trim()
      .toLowerCase();

    const status = String(document.getElementById("statusFilter")?.value || "all").toLowerCase();

    currentRows = report.filter((r) => {
      const okText = !q || String(r?.title || "").toLowerCase().includes(q);
      const okStatus = status === "all" || String(r?.status || "").toLowerCase() === status;
      return okText && okStatus;
    });

    if (selectedId && !currentRows.some((r) => String(getRowId(r)) === String(selectedId))) {
      selectedId = null;
      renderDetails(detailsBox, null);
    }

    renderTableRows(tbody, currentRows, selectedId);
  };

  document.getElementById("searchBox")?.addEventListener("input", applyFilters);
  document.getElementById("statusFilter")?.addEventListener("change", applyFilters);

  // Click row or View button → show details (with breakdown fallback)
  tbody.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;

    const id = tr.dataset.id;
    const row = report.find((x) => String(getRowId(x)) === String(id));
    if (!row) return;

    selectedId = id;
    renderTableRows(tbody, currentRows, selectedId);
    await renderDetailsWithFallback(detailsBox, row);
  });

  document.getElementById("btnCsv")?.addEventListener("click", () => downloadCSV(currentRows));
  document.getElementById("btnRefresh")?.addEventListener("click", load);

  try {
    await load();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger">${escapeHtml(
      e?.message || "Failed to load report."
    )}</td></tr>`;
  }
}

init();