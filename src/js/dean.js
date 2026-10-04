import { getProposals, getDepartmentReport } from "./api.js";
import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";

const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function badge(status) {
  const cls =
    status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls}">${status}</span>`;
}

async function init() {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="text-muted">Loading dashboard...</div>`;

  const auth = await requireRoles(["dean"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const [proposals, report] = await Promise.all([
      getProposals(),         // dean gets all proposals
      getDepartmentReport()   // dean-only report
    ]);

    const pending = (proposals || []).filter((p) => p.status === "pending");
    const approved = (proposals || []).filter((p) => p.status === "approved");
    const rejected = (proposals || []).filter((p) => p.status === "rejected");

    const pendingCount = pending.length;
    const approvedCount = approved.length;
    const rejectedCount = rejected.length;

    const totalBudget = (report || []).reduce((s, r) => s + Number(r.budget_total || 0), 0);
    const totalCollected = (report || []).reduce((s, r) => s + Number(r.collected_total || 0), 0);
    const totalRemaining = (report || []).reduce((s, r) => s + Number(r.remaining_budget || 0), 0);

    const recentPending = pending.slice(0, 5);
    const topCollected = (report || [])
      .slice()
      .sort((a, b) => Number(b.collected_total || 0) - Number(a.collected_total || 0))
      .slice(0, 5);

    content.innerHTML = `
      <div class="d-flex flex-wrap align-items-center justify-content-between mb-3">
        <div>
          <h3 class="mb-1">Dean Dashboard</h3>
          <div class="text-muted small">
            Welcome, <b>${auth.me?.full_name || "Dean"}</b>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Pending Proposals</div>
              <div class="stat-value">${pendingCount}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-inbox"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Approved</div>
              <div class="stat-value">${approvedCount}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-check2-circle"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Total Collected</div>
              <div class="stat-value" style="font-size:22px">${money(totalCollected)}</div>
            </div>
            <div class="stat-icon"><i class="bi bi-cash-stack"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Remaining Budget</div>
              <div class="stat-value" style="font-size:22px">${money(totalRemaining)}</div>
              <div class="small text-muted">Budget: <b>${money(totalBudget)}</b></div>
            </div>
            <div class="stat-icon"><i class="bi bi-wallet2"></i></div>
          </div>
        </div>
      </div>

      <div class="row g-3">
        <div class="col-12 col-lg-7">
          <div class="card card-soft p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h5 class="mb-0">Pending Proposals</h5>
              <a class="btn btn-sm btn-outline-primary" href="/pages/dean-approvals.html">
                <i class="bi bi-check2-square me-1"></i> Go to Approvals
              </a>
            </div>

            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Created</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    recentPending.length
                      ? recentPending
                          .map(
                            (p) => `
                              <tr>
                                <td>
                                  <div class="fw-semibold">${p.title}</div>
                                  <div class="small text-muted">${p.description || ""}</div>
                                </td>
                                <td>${fmtDate(p.created_at)}</td>
                                <td>${badge(p.status)}</td>
                              </tr>
                            `
                          )
                          .join("")
                      : `<tr><td colspan="3" class="text-muted">No pending proposals.</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="card card-soft p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h5 class="mb-0">Top Collected Events</h5>
              <a class="btn btn-sm btn-outline-primary" href="/pages/dean-reports.html">
                <i class="bi bi-bar-chart-line me-1"></i> Reports
              </a>
            </div>

            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th class="text-end">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    topCollected.length
                      ? topCollected
                          .map(
                            (r) => `
                              <tr>
                                <td>
                                  <div class="fw-semibold">${r.title}</div>
                                  <div class="small text-muted">${r.status}</div>
                                </td>
                                <td class="text-end"><b>${money(r.collected_total)}</b></td>
                              </tr>
                            `
                          )
                          .join("")
                      : `<tr><td colspan="2" class="text-muted">No report data.</td></tr>`
                  }
                </tbody>
              </table>
            </div>

            <div class="small text-muted mt-2">
              Rejected: <b>${rejectedCount}</b>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();