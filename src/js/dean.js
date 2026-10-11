import { apiFetch, getDepartmentReport, getProposals } from "./api.js";
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

const money = (n) => `₱ ${num(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

let isLoading = false;

/** cache payment stats per proposal so switching dropdown is faster */
const paymentStatsCache = new Map();
/** prevents race conditions when switching events quickly */
let eventRenderToken = 0;

function renderLoading(content) {
  content.innerHTML = `
    <div class="text-muted">Loading dashboard...</div>
  `;
}

function statCard({ title, value, subtitle = "", icon = "bi-graph-up" }) {
  return `
    <div class="card card-soft p-3 stat h-100">
      <div>
        <div class="stat-title">${escapeHtml(title)}</div>
        <div class="stat-value" style="font-size:22px">${escapeHtml(value)}</div>
        ${subtitle ? `<div class="small text-muted">${subtitle}</div>` : ""}
      </div>
      <div class="stat-icon"><i class="bi ${icon}"></i></div>
    </div>
  `;
}

function metricRow(label, value, muted = false) {
  return `
    <div class="d-flex justify-content-between align-items-center py-1">
      <div class="small ${muted ? "text-muted" : ""}">${escapeHtml(label)}</div>
      <div class="fw-semibold">${escapeHtml(value)}</div>
    </div>
  `;
}

/**
 * Computes student payment stats for a proposal.
 * Requires endpoint: GET /officer/proposals/:id/payments
 * (Dean must be allowed by backend authorization.)
 */
async function getStudentPayStats({ proposalId, requiredPerStudent, studentCount }) {
  const cacheKey = String(proposalId);
  if (paymentStatsCache.has(cacheKey)) return paymentStatsCache.get(cacheKey);

  const payments = await apiFetch(`/officer/proposals/${encodeURIComponent(proposalId)}/payments`);

  const paidByStudent = new Map();
  for (const p of payments || []) {
    const sid = p?.student_id;
    if (!sid) continue;
    paidByStudent.set(sid, (paidByStudent.get(sid) || 0) + num(p?.amount));
  }

  const paidAny = paidByStudent.size;
  const notPaid = Math.max(0, num(studentCount) - paidAny);

  let fullyPaid = null;
  let partialPaid = null;

  if (num(requiredPerStudent) > 0) {
    fullyPaid = [...paidByStudent.values()].filter((t) => t >= num(requiredPerStudent)).length;
    partialPaid = Math.max(0, paidAny - fullyPaid);
  }

  const out = { studentCount: num(studentCount), paidAny, notPaid, fullyPaid, partialPaid };
  paymentStatsCache.set(cacheKey, out);
  return out;
}

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
    const [summaryRaw, reportRaw, proposalsRaw] = await Promise.all([
      apiFetch("/reports/summary").catch(() => null),
      getDepartmentReport(),
      getProposals().catch(() => []),
    ]);

    const summary = summaryRaw && typeof summaryRaw === "object" ? summaryRaw : null;
    const report = Array.isArray(reportRaw) ? reportRaw.slice() : [];
    const proposals = Array.isArray(proposalsRaw) ? proposalsRaw : [];

    const deanName = escapeHtml(auth.me?.full_name || "Dean");

    const pendingProposalCount = proposals.filter(
      (p) => String(p?.status).toLowerCase() === "pending"
    ).length;

    const pendingExpenses = summary?.pending_expenses != null ? num(summary.pending_expenses) : 0;

    const totalCollectedAll =
      summary?.total_collected_all != null
        ? num(summary.total_collected_all)
        : report.reduce((s, r) => s + num(r?.collected_total), 0);

    const cashOnHand =
      summary?.cash_on_hand != null ? num(summary.cash_on_hand) : totalCollectedAll;

    const studentCount =
      summary?.student_count != null
        ? num(summary.student_count)
        : report.reduce((max, r) => Math.max(max, num(r?.student_count)), 0);

    // Approved events list (dropdown)
    const approvedEvents = report
      .filter((r) => String(r?.status).toLowerCase() === "approved")
      .slice()
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

    const defaultSelectedId = approvedEvents[0]?.proposal_id || approvedEvents[0]?.id || "";

    content.innerHTML = `
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h3 class="mb-1">Dean Dashboard</h3>
          <div class="text-muted small">
            Welcome, <b>${deanName}</b> · Updated: ${fmtDate(new Date().toISOString())}
          </div>
        </div>

        <div class="d-flex gap-2">
          <a class="btn btn-outline-primary btn-sm" href="/pages/dean-approvals.html">
            <i class="bi bi-check2-square me-1"></i> Approvals
          </a>
          <a class="btn btn-outline-primary btn-sm" href="/pages/dean-reports.html">
            <i class="bi bi-bar-chart-line me-1"></i> Reports
          </a>
          <button id="btnRefresh" class="btn btn-primary btn-sm" type="button">
            <i class="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Department KPIs -->
      <div class="row g-3 mb-3" style="max-width: 1100px;">
        <div class="col-12 col-md-3">
          ${statCard({
            title: "Pending Proposals",
            value: String(pendingProposalCount),
            subtitle: "Needs review",
            icon: "bi-inbox",
          })}
        </div>

        <div class="col-12 col-md-3">
          ${statCard({
            title: "Pending Expenses",
            value: String(pendingExpenses),
            subtitle: "Needs approval",
            icon: "bi-hourglass-split",
          })}
        </div>

        <div class="col-12 col-md-3">
          ${statCard({
            title: "Total Collected (All)",
            value: money(totalCollectedAll),
            subtitle: `Students counted: <b>${studentCount}</b>`,
            icon: "bi-cash-stack",
          })}
        </div>

        <div class="col-12 col-md-3">
          ${statCard({
            title: "Cash on Hand",
            value: money(cashOnHand),
            subtitle: "Collected − Approved spending",
            icon: "bi-safe",
          })}
        </div>
      </div>

      <!-- Event Snapshot -->
      <div class="card card-soft p-3" style="max-width: 1100px;">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <div>
            <h5 class="mb-0"><i class="bi bi-calendar-event me-2"></i>Event Snapshot</h5>
            <div class="text-muted small">Select an approved event to view event-specific totals.</div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <div class="small text-muted">Event:</div>
            <select id="eventSelect" class="form-select form-select-sm" style="min-width: 280px;">
              ${
                approvedEvents.length
                  ? approvedEvents
                      .map((r) => {
                        const id = r.proposal_id || r.id;
                        const selected = String(id) === String(defaultSelectedId) ? "selected" : "";
                        return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(
                          r.title || "Untitled Event"
                        )}</option>`;
                      })
                      .join("")
                  : `<option value="">No approved events</option>`
              }
            </select>
          </div>
        </div>

        <div id="eventBox" class="mt-2"></div>

        <div class="small text-muted mt-2">
          Tip: Outstanding = Expected − Collected. Only <b>approved expenses</b> are counted in Spent.
        </div>
      </div>
    `;

    async function renderEventBoxById(id) {
      const token = ++eventRenderToken;

      const box = document.getElementById("eventBox");
      if (!box) return;

      const row =
        approvedEvents.find((x) => String(x.proposal_id || x.id) === String(id)) || null;

      if (!row) {
        box.innerHTML = `<div class="text-muted small">No event selected.</div>`;
        return;
      }

      const feePerStudent = num(row.required_per_student);
      const expected = num(row.budget_total);
      const collected = num(row.collected_total);
      const outstanding = num(row.remaining_budget);
      const spent = num(row.spent_total || 0);
      const net = row.net_total != null ? num(row.net_total) : collected - spent;

      const perEventStudentCount = num(row.student_count || 0);
      const pct = expected > 0 ? Math.min(100, (collected / expected) * 100) : 0;

      // Base render first (fast)
      box.innerHTML = `
        <div class="row g-3">
          <div class="col-12 col-lg-6">
            <div class="card card-soft p-3 h-100">
              <div class="fw-semibold mb-2">Key Figures</div>

              ${metricRow("Fee / Student", money(feePerStudent), true)}
              ${metricRow("Expected Collection", money(expected), true)}
              ${metricRow("Collected", money(collected))}
              ${metricRow("Outstanding", money(outstanding))}

              <hr class="my-2" />

              ${metricRow("Spent (Approved)", money(spent), true)}
              ${metricRow("Net (Collected − Spent)", money(net))}

              <hr class="my-2" />

              <div class="fw-semibold mb-2">Student Payment Status</div>
              <div class="row g-2">
                <div class="col-6">
                  <div class="pill pill-muted w-100 justify-content-between">
                    <span>Total Students</span><b id="spTotal">—</b>
                  </div>
                </div>
                <div class="col-6">
                  <div class="pill pill-muted w-100 justify-content-between">
                    <span>Paid (any)</span><b id="spPaidAny">—</b>
                  </div>
                </div>
                <div class="col-6">
                  <div class="pill pill-danger w-100 justify-content-between">
                    <span>Not Paid</span><b id="spNotPaid">—</b>
                  </div>
                </div>
                <div class="col-6">
                  <div class="pill pill-success w-100 justify-content-between">
                    <span>Fully Paid</span><b id="spFullyPaid">—</b>
                  </div>
                </div>
                <div class="col-6">
                  <div class="pill pill-warning w-100 justify-content-between">
                    <span>Partial</span><b id="spPartialPaid">—</b>
                  </div>
                </div>
              </div>

              <div id="spHint" class="small text-muted mt-2">Loading payment status…</div>
            </div>
          </div>

          <div class="col-12 col-lg-6">
            <div class="card card-soft p-3 h-100">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="fw-semibold">Collection Progress</div>
                <div class="small text-muted">${expected > 0 ? `${Math.round(pct)}%` : "—"}</div>
              </div>
              <div class="progress" style="height: 10px;">
                <div class="progress-bar ${pct >= 80 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger"}"
                  style="width:${pct}%"></div>
              </div>
              <div class="small text-muted mt-2">
                ${money(collected)} / ${money(expected)}
              </div>
            </div>
          </div>
        </div>
      `;

      // Now compute student stats (requires payments endpoint access)
      try {
        const stats = await getStudentPayStats({
          proposalId: id,
          requiredPerStudent: feePerStudent,
          studentCount: perEventStudentCount,
        });

        // if user switched event while loading, don't overwrite UI
        if (token !== eventRenderToken) return;

        const setText = (id, value) => {
          const node = document.getElementById(id);
          if (node) node.textContent = value;
        };

        setText("spTotal", String(stats.studentCount ?? 0));
        setText("spPaidAny", String(stats.paidAny ?? 0));
        setText("spNotPaid", String(stats.notPaid ?? 0));

        // If required_per_student is 0, fully/partial are not meaningful
        setText("spFullyPaid", stats.fullyPaid == null ? "—" : String(stats.fullyPaid));
        setText("spPartialPaid", stats.partialPaid == null ? "—" : String(stats.partialPaid));

        const hint = document.getElementById("spHint");
        if (hint) {
          hint.textContent =
            stats.fullyPaid == null
              ? "Fully/Partial requires a valid Fee/Student."
              : "Computed from payment records for this event.";
        }
      } catch (e) {
        if (token !== eventRenderToken) return;

        const hint = document.getElementById("spHint");
        if (hint) {
          hint.innerHTML = `Unavailable (need access to payments data).`;
        }

        // Show safe defaults (still show total students)
        const totalEl = document.getElementById("spTotal");
        if (totalEl) totalEl.textContent = String(perEventStudentCount || 0);
        const paidAnyEl = document.getElementById("spPaidAny");
        if (paidAnyEl) paidAnyEl.textContent = "—";
        const notPaidEl = document.getElementById("spNotPaid");
        if (notPaidEl) notPaidEl.textContent = "—";
        const fullyEl = document.getElementById("spFullyPaid");
        if (fullyEl) fullyEl.textContent = "—";
        const partialEl = document.getElementById("spPartialPaid");
        if (partialEl) partialEl.textContent = "—";
      }
    }

    const eventSelect = document.getElementById("eventSelect");
    if (eventSelect) {
      await renderEventBoxById(eventSelect.value || defaultSelectedId);
      eventSelect.addEventListener("change", async () => {
        await renderEventBoxById(eventSelect.value);
      });
    }

    document.getElementById("btnRefresh")?.addEventListener("click", () => loadDashboard());
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