import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";
import { getProposals } from "./api.js";

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : "—");

function badge(status) {
  const cls = status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
  return `<span class="badge text-bg-${cls}">${status}</span>`;
}

async function init() {
  const content = document.getElementById("content");

  const auth = await requireRoles(["officer", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  try {
    const proposals = await getProposals(); // for officer, backend returns only own proposals

    content.innerHTML = `
      <div class="card card-soft p-3">
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                (proposals || []).length
                  ? proposals.map(p => `
                    <tr>
                      <td>${p.title}</td>
                      <td>${badge(p.status)}</td>
                      <td>${fmtDate(p.created_at)}</td>
                      <td class="text-end">
                        <a class="btn btn-sm btn-primary" href="/pages/officer-payments.html?id=${p.id}">
                          View Payments
                        </a>
                      </td>
                    </tr>
                  `).join("")
                  : `<tr><td colspan="4" class="text-muted">No proposals found.</td></tr>`
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