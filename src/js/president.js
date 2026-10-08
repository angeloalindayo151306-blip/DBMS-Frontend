import { getMe, getProposals } from "./api.js";
import { extractRole, roleToPage } from "./role.js";
import { renderSidebar } from "./ui.js";

const el = (id) => document.getElementById(id);
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(status) {
  const st = (status || "pending").toLowerCase();
  const cls = st === "approved" ? "success" : st === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls}">${st}</span>`;
}

let CACHE = [];

function applyFilters(rows) {
  const q = (el("searchBox").value || "").toLowerCase().trim();
  const status = el("statusFilter").value;

  return (rows || []).filter((p) => {
    const title = (p.title || "").toLowerCase();
    if (q && !title.includes(q)) return false;
    if (status !== "all" && (p.status || "").toLowerCase() !== status) return false;
    return true;
  });
}

function renderTable(rows) {
  const tbody = el("recentTbody");
  const filtered = applyFilters(rows);
  el("recentMeta").textContent = `Showing ${filtered.length} of ${(rows || []).length} proposal(s)`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No proposals found.</td></tr>`;
    return;
  }

  const recent = filtered.slice(0, 8);

  tbody.innerHTML = recent
    .map(
      (p) => `
        <tr>
          <td>
            <div class="fw-semibold">${escapeHtml(p.title || "(Untitled)")}</div>
            <div class="small text-muted">${escapeHtml(p.description || "")}</div>
          </td>
          <td>${badge(p.status)}</td>
          <td>${fmtDate(p.created_at)}</td>
          <td class="text-end">
            <a class="btn btn-sm btn-primary" href="/pages/officer-payments.html?id=${p.id}">
              <i class="bi bi-receipt me-1"></i>View
            </a>
          </td>
        </tr>
      `
    )
    .join("");
}

async function load() {
  el("msg").innerHTML = "";
  el("recentTbody").innerHTML = `<tr><td colspan="4" class="text-muted">Loading…</td></tr>`;
  el("pageMeta").textContent = "Fetching proposals…";

  const proposals = await getProposals();
  CACHE = Array.isArray(proposals) ? proposals : [];

  // stats
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const p of CACHE) {
    const st = (p.status || "pending").toLowerCase();
    counts[st] = (counts[st] || 0) + 1;
  }

  el("statPending").textContent = counts.pending || 0;
  el("statApproved").textContent = counts.approved || 0;
  el("statRejected").textContent = counts.rejected || 0;

  el("pageMeta").textContent = `Fetched ${CACHE.length} proposal(s)`;
  renderTable(CACHE);
}

async function init() {
  const contentMsg = el("msg");

  try {
    const me = await getMe();
    const role = extractRole(me);

    if (role !== "president") {
      window.location.href = roleToPage(role);
      return;
    }

    renderSidebar(el("sidebar"), role);
    el("welcomeName").textContent = me.full_name || "President";

    // UI controls
    el("searchBox").addEventListener("input", () => renderTable(CACHE));
    el("statusFilter").addEventListener("change", () => renderTable(CACHE));
    el("btnReload").addEventListener("click", load);

    await load();
  } catch (e) {
    contentMsg.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    el("pageMeta").textContent = "Error";
  }
}

init();