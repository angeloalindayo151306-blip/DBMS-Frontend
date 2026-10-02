import { getMe, getProposals } from "./api.js";
import { extractRole, roleToPage } from "./role.js";
import { renderSidebar } from "./ui.js";

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

async function init() {
  const content = document.getElementById("content");

  try {
    const me = await getMe();
    const role = extractRole(me);

    if (role !== "president") {
      window.location.href = roleToPage(role);
      return;
    }

    renderSidebar(document.getElementById("sidebar"), role);

    const proposals = await getProposals();

    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const p of proposals || []) counts[p.status] = (counts[p.status] || 0) + 1;

    const recent = (proposals || []).slice(0, 5);

    content.innerHTML = `

      <div class="row g-3 mb-3">
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3">
            <div class="text-muted">Pending Proposals</div>
            <div style="font-size:28px;font-weight:700">${counts.pending || 0}</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3">
            <div class="text-muted">Approved</div>
            <div style="font-size:28px;font-weight:700">${counts.approved || 0}</div>
          </div>
        </div>
        <div class="col-12 col-md-4">
          <div class="card card-soft p-3">
            <div class="text-muted">Rejected</div>
            <div style="font-size:28px;font-weight:700">${counts.rejected || 0}</div>
          </div>
        </div>
      </div>

      <div class="card card-soft p-3">
        <h5 class="mb-3">Recent Proposals</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${
                recent.length
                  ? recent
                      .map(
                        (p) => `
                          <tr>
                            <td>${p.title}</td>
                            <td>
                              <span class="badge text-bg-${
                                p.status === "approved"
                                  ? "success"
                                  : p.status === "rejected"
                                  ? "danger"
                                  : "warning"
                              }">${p.status}</span>
                            </td>
                            <td>${fmtDate(p.created_at)}</td>
                          </tr>
                        `
                      )
                      .join("")
                  : `<tr><td colspan="3" class="text-muted">No proposals yet.</td></tr>`
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