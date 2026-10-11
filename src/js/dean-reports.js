import { getDepartmentReport, getProposals, apiFetch } from "./api.js";
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

function getRowId(r) {
  return r?.proposal_id || r?.id || "";
}

// Meaning (based on updated backend):
// required_per_student = fee per student
// budget_total = expected collection (fee_per_student * student_count)
// collected_total = collected
// remaining_budget = outstanding (expected - collected)
// spent_total = approved expenses linked to this event
// net_total = collected - spent
const getFee = (r) => num(r?.required_per_student);
const getExpected = (r) => num(r?.budget_total);
const getCollected = (r) => num(r?.collected_total);
const getOutstanding = (r) => num(r?.remaining_budget);
const getSpent = (r) => num(r?.spent_total || 0);
const getNet = (r) =>
  r?.net_total != null ? num(r.net_total) : getCollected(r) - getSpent(r);

function normalizeBreakdown(bd) {
  if (!bd) return [];
  if (Array.isArray(bd)) return bd;

  if (typeof bd === "string") {
    try {
      const parsed = JSON.parse(bd);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

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
  const list = await getProposals();
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

  container.innerHTML = `
    <div class="d-flex align-items-start justify-content-between gap-2">
      <div>
        <div class="fw-semibold">${escapeHtml(r.title || "Untitled Event")}</div>
        <div class="small text-muted">${badgeHtml(r.status)}</div>
      </div>
    </div>

    <hr class="my-3" />

    <div class="small">
      <div class="d-flex justify-content-between"><span class="text-muted">Fee / Student</span><span class="fw-semibold">${money(getFee(r))}</span></div>
      <div class="d-flex justify-content-between mt-1"><span class="text-muted">Expected</span><span class="fw-semibold">${money(getExpected(r))}</span></div>
      <div class="d-flex justify-content-between mt-1"><span class="text-muted">Collected</span><span class="fw-semibold">${money(getCollected(r))}</span></div>
      <div class="d-flex justify-content-between mt-1"><span class="text-muted">Outstanding</span><span class="fw-semibold">${money(getOutstanding(r))}</span></div>
      <div class="d-flex justify-content-between mt-1"><span class="text-muted">Spent (Approved)</span><span class="fw-semibold">${money(getSpent(r))}</span></div>
      <div class="d-flex justify-content-between mt-1"><span class="text-muted">Net</span><span class="fw-semibold">${money(getNet(r))}</span></div>
    </div>

    <hr class="my-3" />

    <div class="small">
      <div class="d-flex justify-content-between"><span class="text-muted">Created</span><span>${fmtDate(r.created_at)}</span></div>
      <div class="d-flex justify-content-between mt-1"><span class="text-muted">Reviewed</span><span>${fmtDate(r.reviewed_at)}</span></div>
    </div>

    <hr class="my-3" />

    <div class="fw-semibold mb-2">Breakdown</div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr><th>Item</th><th class="text-end">Amount</th></tr>
        </thead>
        <tbody>
          ${
            breakdown.length
              ? breakdown
                  .map(
                    (b) => `
                      <tr>
                        <td>${escapeHtml(b?.name ?? "—")}</td>
                        <td class="text-end">${money(b?.amount ?? 0)}</td>
                      </tr>
                    `
                  )
                  .join("")
              : `<tr><td colspan="2" class="text-muted">No breakdown data.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

async function renderDetailsWithFallback(detailsBox, row) {
  const initial = normalizeBreakdown(row?.breakdown);
  if (initial.length) return renderDetails(detailsBox, row);

  try {
    const map = await ensureProposalsMap();
    const pid = String(getRowId(row) || "");
    const p = map.get(pid);

    if (p && normalizeBreakdown(p.breakdown).length) {
      return renderDetails(detailsBox, { ...p, ...row, breakdown: p.breakdown });
    }
  } catch {}

  renderDetails(detailsBox, row);
}

function downloadCSV(rows) {
  const headers = [
    "Title",
    "Status",
    "FeePerStudent",
    "Expected",
    "Collected",
    "Outstanding",
    "SpentApproved",
    "Net",
    "CreatedAt",
    "ReviewedAt",
  ];

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
        getFee(r),
        getExpected(r),
        getCollected(r),
        getOutstanding(r),
        getSpent(r),
        getNet(r),
        r?.created_at ?? "",
        r?.reviewed_at ?? "",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename = `dfms-report-${new Date().toISOString().slice(0, 10)}.csv`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function renderTableRows(tbody, rows, selectedId) {
  tbody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = node("td", "text-muted", "No matching results.");
    td.colSpan = 8;
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

    tr.appendChild(node("td", "fw-semibold", r?.title || "Untitled"));

    const tdStatus = document.createElement("td");
    tdStatus.innerHTML = badgeHtml(r?.status);
    tr.appendChild(tdStatus);

    tr.appendChild(node("td", "text-end", money(getFee(r))));
    tr.appendChild(node("td", "text-end", money(getExpected(r))));
    tr.appendChild(node("td", "text-end", money(getCollected(r))));
    tr.appendChild(node("td", "text-end", money(getOutstanding(r))));
    tr.appendChild(node("td", "text-end", money(getSpent(r))));
    tr.appendChild(node("td", "text-end", money(getNet(r))));

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
      tbody.innerHTML = `<tr><td colspan="8" class="text-muted">Loading report data...</td></tr>`;
      renderDetails(detailsBox, null);
      selectedId = null;
      proposalsById = null;

      const [raw, summary] = await Promise.all([
        getDepartmentReport(),
        apiFetch("/reports/summary").catch(() => null),
      ]);

      report = Array.isArray(raw) ? raw.slice() : [];
      report.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

      const approvedCount = report.filter((r) => String(r?.status).toLowerCase() === "approved")
        .length;

      const totalExpected = report.reduce((s, r) => s + getExpected(r), 0);
      const totalCollected = report.reduce((s, r) => s + getCollected(r), 0);
      const totalOutstanding = report.reduce((s, r) => s + getOutstanding(r), 0);

      const totalSpentEvent = report.reduce((s, r) => s + getSpent(r), 0);
      const generalSpent = summary?.total_spent_general != null ? num(summary.total_spent_general) : 0;
      const cashOnHand = summary?.cash_on_hand != null ? num(summary.cash_on_hand) : totalCollected - totalSpentEvent - generalSpent;

      const setText = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
      };

      setText("statApprovedCount", String(approvedCount));
      setText("statTotalBudget", money(totalExpected)); // HTML label already "Total Expected"
      setText("statTotalCollected", money(totalCollected));
      setText("statTotalRemaining", money(totalOutstanding));

      // optional extra KPI cards
      setText("statTotalSpent", money(totalSpentEvent + generalSpent));
      setText("statCashOnHand", money(cashOnHand));

      currentRows = report.slice();
      renderTableRows(tbody, currentRows, selectedId);
    } finally {
      loading = false;
    }
  };

  const applyFilters = () => {
    const q = String(document.getElementById("searchBox")?.value || "").trim().toLowerCase();
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
    tbody.innerHTML = `<tr><td colspan="8" class="text-danger">${escapeHtml(
      e?.message || "Failed to load report."
    )}</td></tr>`;
  }
}

init();