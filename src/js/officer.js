import { getProposals } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

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
  const cls =
    status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls}">${status}</span>`;
}

async function init() {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="text-muted">Loading dashboard...</div>`;

  let auth;
  try {
    auth = await requireRoles(["officer", "president"]);
    if (!auth) return; // requireRoles already redirects
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    return;
  }

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const proposals = await getProposals();

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const p of proposals || []) counts[p.status] = (counts[p.status] || 0) + 1;

    const recent = (proposals || []).slice(0, 5);

    const heading =
      auth.role === "president" ? "President Dashboard (Officer View)" : "Officer Dashboard";

    content.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between mb-3">
        <div>
          <h3 class="mb-1">${heading}</h3>
          <div class="text-muted small">Welcome, <b>${auth.me?.full_name || "Officer"}</b></div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Pending Proposals</div>
              <div class="stat-value">${counts.pending || 0}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-hourglass-split"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Approved</div>
              <div class="stat-value">${counts.approved || 0}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-check2-circle"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Rejected</div>
              <div class="stat-value">${counts.rejected || 0}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-x-circle"></i></div>
          </div>
        </div>
      </div>

      <div class="card card-soft p-3">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h5 class="mb-0">Recent Proposals</h5>
          <div class="d-flex gap-2">
            <a class="btn btn-sm btn-outline-primary" href="/pages/officer-proposals.html">
              <i class="bi bi-file-earmark-text me-1"></i> Manage Proposals
            </a>
            <a class="btn btn-sm btn-outline-primary" href="/pages/officer-payments-list.html">
              <i class="bi bi-clipboard-data me-1"></i> Proposal Payments
            </a>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Required/Student</th>
                <th>Status</th>
                <th>Created</th>
                <th class="text-end">Payments</th>
              </tr>
            </thead>
            <tbody>
              ${
                recent.length
                  ? recent
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
                                <i class="bi bi-receipt me-1"></i> View
                              </a>
                            </td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="5" class="text-muted">No proposals yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();