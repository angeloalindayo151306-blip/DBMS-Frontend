import { getProposals, createProposal, editProposal } from './api.js';
import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';

const fmtDate = (s) => (s ? new Date(s).toLocaleString() : '—');
const money = (n) =>
  `₱ ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

function badge(status) {
  const cls =
    status === 'approved'
      ? 'success'
      : status === 'rejected'
      ? 'danger'
      : 'warning';
  return `<span class="badge text-bg-${cls}">${status}</span>`;
}

async function init() {
  const content = document.getElementById('content');
  const auth = await requireRoles(['officer']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  async function load() {
    const proposals = await getProposals();

    content.innerHTML = `
      <div class="card card-soft p-3 mb-3" style="max-width:900px;">
        <h5 class="mb-3">Create Proposal</h5>
        <form id="createForm" class="row g-2">
          <div class="col-12 col-md-6">
            <input class="form-control" id="title" placeholder="Title" required />
          </div>
          <div class="col-12 col-md-6">
            <input class="form-control" id="budget_total" type="number" min="0" step="0.01" placeholder="Budget Total" required />
          </div>
          <div class="col-12 col-md-6">
            <input class="form-control" id="required_per_student" type="number" min="0" step="0.01" placeholder="Required per student" required />
          </div>
          <div class="col-12">
            <textarea class="form-control" id="description" placeholder="Description (optional)"></textarea>
          </div>
          <div class="col-12">
            <button class="btn btn-primary" type="submit" id="btnCreate">Create</button>
          </div>
          <div class="col-12" id="msg"></div>
        </form>
      </div>

      <div class="card card-soft p-3">
        <h5 class="mb-3">List</h5>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Budget</th>
                <th>Req/Student</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                (proposals || []).length
                  ? proposals
                      .map(
                        (p) => `
                    <tr>
                      <td>${p.title}</td>
                      <td>${badge(p.status)}</td>
                      <td>${money(p.budget_total)}</td>
                      <td>${money(p.required_per_student)}</td>
                      <td>${fmtDate(p.created_at)}</td>
                      <td class="text-end">
                        <a class="btn btn-sm btn-outline-primary" href="/pages/officer-payments.html?id=${
                          p.id
                        }">
                          Payments
                        </a>
                        ${
                          p.status === 'pending'
                            ? `<button class="btn btn-sm btn-outline-secondary ms-1" data-edit="${p.id}">Edit</button>`
                            : ``
                        }
                      </td>
                    </tr>
                  `
                      )
                      .join('')
                  : `<tr><td colspan="6" class="text-muted">No proposals yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    // create
    document
      .getElementById('createForm')
      .addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('msg');
        const btn = document.getElementById('btnCreate');
        msg.innerHTML = '';
        btn.disabled = true;

        try {
          const payload = {
            title: document.getElementById('title').value.trim(),
            description:
              document.getElementById('description').value.trim() || undefined,
            budget_total: Number(document.getElementById('budget_total').value),
            required_per_student: Number(
              document.getElementById('required_per_student').value
            ),
          };

          await createProposal(payload);
          msg.innerHTML = `<div class="alert alert-success">Created!</div>`;
          await load();
        } catch (err) {
          msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        } finally {
          btn.disabled = false;
        }
      });

    // edit (simple prompt-based)
    content.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-edit');
        const newTitle = prompt('New title (leave blank to keep):');
        if (newTitle === null) return;

        try {
          const payload = {};
          if (newTitle.trim()) payload.title = newTitle.trim();

          // Optional: more prompts
          const newBudget = prompt('New budget total (leave blank to keep):');
          if (newBudget && newBudget.trim())
            payload.budget_total = Number(newBudget);

          const newReq = prompt(
            'New required per student (leave blank to keep):'
          );
          if (newReq && newReq.trim())
            payload.required_per_student = Number(newReq);

          await editProposal(id, payload);
          await load();
        } catch (e) {
          alert(e.message);
        }
      });
    });
  }

  try {
    await load();
  } catch (e) {
    content.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
  }
}

init();
