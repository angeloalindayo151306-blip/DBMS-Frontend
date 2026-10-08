import { getProposals, getDepartmentReport } from "./api.js";
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

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function renderLoading(content) {
  content.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div>
        <div class="placeholder-glow"><span class="placeholder col-4"></span></div>
        <div class="placeholder-glow"><span class="placeholder col-6"></span></div>
      </div>
      <div class="placeholder-glow">
        <span class="placeholder col-2" style="width: 120px;"></span>
      </div>
    </div>

    <div class="row g-3 mb-3">
      ${Array.from({ length: 4 })
        .map(
          () => `
            <div class="col-12 col-md-3">
              <div class="card card-soft p-3">
                <div class="placeholder-glow">
                  <div class="placeholder col-6 mb-2"></div>
                  <div class="placeholder col-4"></div>
                </div>
              </div>
            </div>
          `
        )
        .join("")}
    </div>

    <div class="row g-3">
      <div class="col-12 col-lg-7">
        <div class="card card-soft p-3">
          <div class="placeholder-glow"><span class="placeholder col-4"></span></div>
          <div class="placeholder-glow mt-2"><span class="placeholder col-12"></span></div>
          <div class="placeholder-glow mt-2"><span class="placeholder col-12"></span></div>
          <div class="placeholder-glow mt-2"><span class="placeholder col-12"></span></div>
        </div>
      </div>
      <div class="col-12 col-lg-5">
        <div class="card card-soft p-3">
          <div class="placeholder-glow"><span class="placeholder col-6"></span></div>
          <div class="placeholder-glow mt-2"><span class="placeholder col-12"></span></div>
          <div class="placeholder-glow mt-2"><span class="placeholder col-12"></span></div>
          <div class="placeholder-glow mt-2"><span class="placeholder col-12"></span></div>
        </div>
      </div>
    </div>
  `;
}

let isLoading = false;

async function loadDashboard() {
  if (isLoading) return;
  isLoading = true;

  const content = document.getElementById("content");
  renderLoading(content);

  const auth = await requireRoles(["dean"]);
  if (!auth) {
    isLoading = false;
    return;
  }

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const [proposalsRaw, reportRaw] = await Promise.all([
      getProposals(),
      getDepartmentReport(),
    ]);

    const proposals = asArray(proposalsRaw).slice();
    const report = asArray(reportRaw).slice();

    // newest first
    proposals.sort(
      (a, b) =>
        new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    );

    const pending = proposals.filter((p) => String(p?.status).toLowerCase() === "pending");
    const approved = proposals.filter((p) => String(p?.status).toLowerCase() === "approved");
    const rejected = proposals.filter((p) => String(p?.status).toLowerCase() === "rejected");

    const pendingCount = pending.length;
    const approvedCount = approved.length;
    const rejectedCount = rejected.length;

    // Your report row includes: budget_total, required_per_student, breakdown, etc.
    // It does NOT include collected_total / remaining_budget (based on what you pasted).
    const hasCollectedData = report.some((r) => r && r.collected_total != null);

    const getBudget = (r) => {
      // budget_total exists in your response; fallback to required_per_student if needed
      const b = r?.budget_total;
      return b != null ? num(b) : num(r?.required_per_student);
    };

    const getCollected = (r) => num(r?.collected_total || 0);

    const getRemaining = (r) => {
      if (r?.remaining_budget != null) return num(r.remaining_budget);
      const budget = getBudget(r);
      const collected = getCollected(r);
      return Math.max(0, budget - collected);
    };

    const totalBudget = report.reduce((s, r) => s + getBudget(r), 0);
    const totalCollected = report.reduce((s, r) => s + getCollected(r), 0);
    const totalRemaining = report.reduce((s, r) => s + getRemaining(r), 0);

    const recentPending = pending.slice(0, 5);

    // If there is no collected_total in the report, show "Top Budgeted Events" instead
    const metricLabel = hasCollectedData ? "Collected" : "Budget";
    const topTitle = hasCollectedData ? "Top Collected Events" : "Top Budgeted Events";

    const topEvents = report
      .slice()
      .sort((a, b) => {
        const aVal = hasCollectedData ? getCollected(a) : getBudget(a);
        const bVal = hasCollectedData ? getCollected(b) : getBudget(b);
        return bVal - aVal;
      })
      .slice(0, 5);

    const deanName = escapeHtml(auth.me?.full_name || "Dean");

    content.innerHTML = `
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h3 class="mb-1">Dean Dashboard</h3>
          <div class="text-muted small">
            Welcome, <b>${deanName}</b> · Last updated: ${fmtDate(new Date().toISOString())}
          </div>
        </div>

        <div class="d-flex gap-2">
          <a class="btn btn-outline-primary btn-sm" href="/pages/dean-approvals.html">
            <i class="bi bi-check2-square me-1"></i> Approvals
          </a>
          <a class="btn btn-outline-primary btn-sm" href="/pages/dean-reports.html">
            <i class="bi bi-bar-chart-line me-1"></i> Reports
          </a>
          <button id="btnRefresh" class="btn btn-primary btn-sm">
            <i class="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Pending Proposals</div>
              <div class="stat-value">${pendingCount}</div>
              <div class="small text-muted">Needs review</div>
            </div>
            <div class="stat-icon"><i class="bi bi-inbox"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Approved</div>
              <div class="stat-value">${approvedCount}</div>
              <div class="small text-muted">Rejected: <b>${rejectedCount}</b></div>
            </div>
            <div class="stat-icon"><i class="bi bi-check2-circle"></i></div>
          </div>
        </div>

        <div class="col-12 col-md-3">
          <div class="card card-soft p-3 stat">
            <div>
              <div class="stat-title">Total Collected</div>
              <div class="stat-value" style="font-size:22px">${money(totalCollected)}</div>
              <div class="small text-muted">
                ${hasCollectedData ? "From department report" : "No collection totals yet"}
              </div>
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
              <h5 class="mb-0">Recent Pending Proposals</h5>
              <a class="btn btn-sm btn-outline-primary" href="/pages/dean-approvals.html">
                <i class="bi bi-arrow-right-circle me-1"></i> Review queue
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
                          .map((p) => {
                            const title = escapeHtml(p?.title || "Untitled Proposal");
                            const desc = escapeHtml(p?.description || "");
                            return `
                              <tr>
                                <td>
                                  <div class="fw-semibold">${title}</div>
                                  ${desc ? `<div class="small text-muted">${desc}</div>` : ""}
                                </td>
                                <td>${fmtDate(p?.created_at)}</td>
                                <td>${badge(p?.status)}</td>
                              </tr>
                            `;
                          })
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
              <h5 class="mb-0">${topTitle}</h5>
              <a class="btn btn-sm btn-outline-primary" href="/pages/dean-reports.html">
                <i class="bi bi-bar-chart-line me-1"></i> View reports
              </a>
            </div>

            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th class="text-end">${metricLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    topEvents.length
                      ? topEvents
                          .map((r) => {
                            const title = escapeHtml(r?.title || "Untitled Event");
                            const status = escapeHtml(r?.status || "");
                            const budget = getBudget(r);
                            const collected = getCollected(r);
                            const showVal = hasCollectedData ? collected : budget;

                            // only show progress if collected totals exist
                            const pct =
                              hasCollectedData && budget > 0
                                ? Math.min(100, (collected / budget) * 100)
                                : null;

                            return `
                              <tr>
                                <td>
                                  <div class="fw-semibold">${title}</div>
                                  <div class="small text-muted">${status}</div>
                                  ${
                                    pct === null
                                      ? ""
                                      : `
                                        <div class="progress mt-2" style="height: 6px;">
                                          <div class="progress-bar" style="width: ${pct.toFixed(0)}%"></div>
                                        </div>
                                        <div class="small text-muted mt-1">
                                          ${pct.toFixed(0)}% of budget
                                        </div>
                                      `
                                  }
                                </td>
                                <td class="text-end"><b>${money(showVal)}</b></td>
                              </tr>
                            `;
                          })
                          .join("")
                      : `<tr><td colspan="2" class="text-muted">No report data.</td></tr>`
                  }
                </tbody>
              </table>
            </div>

            <div class="small text-muted mt-2">
              Tip: Use <b>Reports</b> for full breakdown and totals.
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("btnRefresh")?.addEventListener("click", () => {
      window.location.reload();
    });
  } catch (e) {
    content.innerHTML = `
      <div class="alert alert-danger">
        <div class="fw-semibold mb-1">Failed to load dashboard</div>
        <div class="small">${escapeHtml(e?.message || "Unknown error")}</div>
      </div>
    `;
  } finally {
    isLoading = false;
  }
}

loadDashboard();