import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";
import { getProposals } from "./api.js";

const el = (id) => document.getElementById(id);
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function badge(status) {
  const st = (status || "pending").toLowerCase();
  const cls = st === "approved" ? "success" : st === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls}">${st}</span>`;
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function render(rows) {
  const tbody = el("proposalsTbody");
  const filtered = applyFilters(rows);

  el("listMeta").textContent = `Showing ${filtered.length} of ${(rows || []).length} proposal(s)`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No proposals found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((p) => `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(p.title || "(Untitled)")}</div>
          <div class="small text-muted">${escapeHtml(p.description || "")}</div>
        </td>
        <td>${badge(p.status)}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td class="text-end">
          <a class="btn btn-sm btn-primary" href="/pages/officer-payments.html?id=${p.id}">
            <i class="bi bi-receipt me-1"></i>View Payments
          </a>
        </td>
      </tr>
    `)
    .join("");
}

async function load() {
  el("msg").innerHTML = "";
  el("proposalsTbody").innerHTML = `<tr><td colspan="4" class="text-muted">Loading…</td></tr>`;

  const proposals = await getProposals();
  CACHE = Array.isArray(proposals) ? proposals : [];
  render(CACHE);
}

async function init() {
  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(el("sidebar"), auth.role);

  el("pageHint").textContent = "Select any proposal to view student payments and receipts.";

  el("searchBox").addEventListener("input", () => render(CACHE));
  el("statusFilter").addEventListener("change", () => render(CACHE));
  el("btnReload").addEventListener("click", load);

  try {
    await load();
  } catch (e) {
    el("msg").innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();