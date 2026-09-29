import { requireRoles } from './guard.js';
import { renderSidebar } from './ui.js';
import { createOfficerAccount, createStudentAccount } from './api.js';

async function init() {
  const content = document.getElementById('content');

  // only Dean + President can open
  const auth = await requireRoles(['dean', 'president']);
  if (!auth) return;

  renderSidebar(document.getElementById('sidebar'), auth.role);

  const role = auth.role;

  content.innerHTML = `
    ${
      role === 'dean'
        ? `
      <div class="card card-soft p-3 mb-3" style="max-width: 720px;">
        <h5 class="mb-3">Create Officer / President Account</h5>

        <form id="officerForm">
          <div class="mb-2">
            <label class="form-label">Full Name</label>
            <input class="form-control" id="o_full_name" required>
          </div>

          <div class="mb-2">
            <label class="form-label">Email</label>
            <input class="form-control" id="o_email" type="email" required>
          </div>

          <div class="mb-2">
            <label class="form-label">Password</label>
            <input class="form-control" id="o_password" type="password" minlength="6" required>
          </div>

          <div class="mb-3">
            <label class="form-label">Officer Title</label>
            <select class="form-select" id="o_title" required>
              <option>President</option>
              <option>VP Internal</option>
              <option>VP External</option>
              <option>Secretary</option>
              <option>PIO</option>
              <option>Auditor</option>
              <option>Treasurer</option>
            </select>
          </div>

          <button class="btn btn-primary" id="btnOfficer" type="submit">Create Account</button>
        </form>

        <div id="officerMsg" class="mt-3"></div>
      </div>
    `
        : ''
    }

    ${
      role === 'president'
        ? `
      <div class="card card-soft p-3" style="max-width: 720px;">
        <h5 class="mb-3">Create Student Account</h5>

        <form id="studentForm">
          <div class="mb-2">
            <label class="form-label">Full Name</label>
            <input class="form-control" id="s_full_name" required>
          </div>

          <div class="mb-2">
            <label class="form-label">Email</label>
            <input class="form-control" id="s_email" type="email" required>
          </div>

          <div class="mb-3">
            <label class="form-label">Password</label>
            <input class="form-control" id="s_password" type="password" minlength="6" required>
          </div>

          <button class="btn btn-primary" id="btnStudent" type="submit">Create Student</button>
        </form>

        <div id="studentMsg" class="mt-3"></div>
      </div>
    `
        : ''
    }
  `;

  // Dean creates officers/president
  if (role === 'dean') {
    document
      .getElementById('officerForm')
      .addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('officerMsg');
        const btn = document.getElementById('btnOfficer');
        msg.innerHTML = '';
        btn.disabled = true;

        try {
          const payload = {
            full_name: document.getElementById('o_full_name').value.trim(),
            email: document.getElementById('o_email').value.trim(),
            password: document.getElementById('o_password').value,
            officer_title: document.getElementById('o_title').value,
          };

          const result = await createOfficerAccount(payload);

          msg.innerHTML = `
          <div class="alert alert-success">
            Created: <b>${result.email}</b><br>
            Role: <b>${result.role}</b><br>
            Title: <b>${result.officer_title}</b>
          </div>
        `;
          e.target.reset();
        } catch (err) {
          msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        } finally {
          btn.disabled = false;
        }
      });
  }

  // President creates students
  if (role === 'president') {
    document
      .getElementById('studentForm')
      .addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('studentMsg');
        const btn = document.getElementById('btnStudent');
        msg.innerHTML = '';
        btn.disabled = true;

        try {
          const payload = {
            full_name: document.getElementById('s_full_name').value.trim(),
            email: document.getElementById('s_email').value.trim(),
            password: document.getElementById('s_password').value,
          };

          const result = await createStudentAccount(payload);

          msg.innerHTML = `
          <div class="alert alert-success">
            Student created: <b>${result.email}</b>
          </div>
        `;
          e.target.reset();
        } catch (err) {
          msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        } finally {
          btn.disabled = false;
        }
      });
  }
}

init();
