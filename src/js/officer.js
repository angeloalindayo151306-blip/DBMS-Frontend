import { getProposals } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const el = (id) => document.getElementById(id);

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");
const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

function sumBreakdown(breakdown) {
  if (!Array.isArray(breakdown)) return 0;
  return breakdown.reduce((s, it) => s + Number(it?.amount || 0), 0);
}

function requiredPerStudentFromProposal(p) {
  const bt = sumBreakdown(p.breakdown);
  return bt > 0 ? bt : Number(p.required_per_student || 0);
}

function statusBadge(status) {
  const normalized = (status || "pending").toLowerCase();
  const cls =
    normalized === "approved"
      ? "success"
      : normalized === "rejected"
      ? "danger"
      : "warning";
  return `<span class="badge text-bg-${cls}">${normalized}</span>`;
}

function setLoadingState() {
  el("dashMsg").innerHTML = "";
  el("dashMeta").textContent = "Loading…";
  el("statPending").textContent = "—";
  el("statApproved").textContent = "—";
  el("statRejected").textContent = "—";
  el("recentTbody").innerHTML = `<tr><td colspan="5" class="text-muted">Loading…</td></tr>`;
  el("recentEmpty").classList.add("d-none");
}

async function init() {
  setLoadingState();

  let auth;
  try {
    auth = await requireRoles(["officer", "president"]);
    if (!auth) return;
  } catch (e) {
    el("dashMsg").innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    return;
  }

  renderSidebar(el("sidebar"), auth.role);

  el("dashTitle").textContent =
    auth.role === "president" ? "President Dashboard (Officer View)" : "Officer Dashboard";
  el("dashName").textContent = auth.me?.full_name || "Officer";

  try {
    const proposals = await getProposals(); // expects array

    if (!Array.isArray(proposals)) {
      throw new Error("Unexpected /proposals response (expected array).");
    }

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const p of proposals) {
      const st = (p.status || "pending").toLowerCase();
      counts[st] = (counts[st] || 0) + 1;
    }

    el("statPending").textContent = counts.pending || 0;
    el("statApproved").textContent = counts.approved || 0;
    el("statRejected").textContent = counts.rejected || 0;

    el("dashMeta").textContent = `Fetched ${proposals.length} proposal(s)`;

    const recent = proposals.slice(0, 5);

    if (!recent.length) {
      el("recentTbody").innerHTML = `<tr><td colspan="5" class="text-muted">No proposals found.</td></tr>`;
      el("recentEmpty").classList.remove("d-none");
      return;
    }

    el("recentTbody").innerHTML = recent
      .map(
        (p) => `
          <tr>
            <td>
              <div class="fw-semibold">${p.title}</div>
              <div class="small text-muted">${p.description || ""}</div>
            </td>
            <td>${money(requiredPerStudentFromProposal(p))}</td>
            <td>${statusBadge(p.status)}</td>
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
  } catch (e) {
    el("dashMsg").innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    el("dashMeta").textContent = "Error loading proposals";
  }
}

init();