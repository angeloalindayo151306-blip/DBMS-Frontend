import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";
import { createOfficerAccount, createStudentAccount, createDeanAccount } from "./api.js";

function calcAge(dobStr) {
  if (!dobStr) return "";
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return String(age);
}

// Officer positions (NOT including President here)
// President account is created by selecting role "president" (Dean only).
function officerTitleOptions() {
  const titles = ["VP Internal", "VP External", "Secretary", "PIO", "Auditor", "Treasurer"];
  return titles.map((t) => `<option value="${t}">${t}</option>`).join("");
}

async function init() {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="text-muted">Loading...</div>`;

  const auth = await requireRoles(["dean", "president"]);
  if (!auth) return;

  renderSidebar(document.getElementById("sidebar"), auth.role);

  const isDean = auth.role === "dean";
  const isPresident = auth.role === "president";

  // ✅ President can create Student + Officer only
  // ✅ Dean can create Student + Officer + President + Dean
  const roleChoices = isPresident
    ? [
        { value: "student", label: "Student" },
        { value: "officer", label: "Officer" }
      ]
    : [
        { value: "student", label: "Student" },
        { value: "officer", label: "Officer" },
        { value: "president", label: "President" },
        { value: "dean", label: "Dean" }
      ];

  content.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3">
      <div>
        <h3 class="mb-1">Account Management</h3>
        <div class="text-muted small">
          ${isPresident
            ? "President can create Student and Officer accounts (no Dean)."
            : "Dean can create Student, Officer, President, and Dean accounts."}
        </div>
      </div>
    </div>

    <div class="card card-soft p-3" style="max-width: 980px;">
      <form id="accountForm" class="row g-3">

        <div class="col-12 col-md-4">
          <label class="form-label">Role</label>
          <select class="form-select" id="role" required>
            ${roleChoices.map(r => `<option value="${r.value}">${r.label}</option>`).join("")}
          </select>
          <div class="form-text">
            ${isPresident ? "Dean accounts are Dean-only." : "President cannot create Dean accounts (backend enforced)."}
          </div>
        </div>

        <div class="col-12 col-md-4" id="officerTitleWrap" style="display:none;">
          <label class="form-label">Officer Position</label>
          <select class="form-select" id="officer_title">
            ${officerTitleOptions()}
          </select>
        </div>

        <hr class="my-1">

        <div class="col-12 col-md-4">
          <label class="form-label">Email</label>
          <input class="form-control" id="email" type="email" required />
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Password</label>
          <input class="form-control" id="password" type="password" minlength="6" required />
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Mobile Number</label>
          <input class="form-control" id="mobile_number" type="text" required />
        </div>

        <hr class="my-1">

        <div class="col-12 col-md-4">
          <label class="form-label">First Name</label>
          <input class="form-control" id="first_name" required />
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Middle Name</label>
          <input class="form-control" id="middle_name" />
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Last Name</label>
          <input class="form-control" id="last_name" required />
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Date of Birth</label>
          <input class="form-control" id="date_of_birth" type="date" required />
        </div>

        <div class="col-12 col-md-2">
          <label class="form-label">Age</label>
          <input class="form-control" id="age" type="text" readonly />
        </div>

        <div class="col-12 col-md-6">
          <label class="form-label">Address</label>
          <input class="form-control" id="address" required />
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Course (CCS)</label>
          <select class="form-select" id="course" required>
            <option value="IT">IT</option>
            <option value="CS">CS</option>
          </select>
        </div>

        <div class="col-12 col-md-4">
          <label class="form-label">Year Level</label>
          <select class="form-select" id="year_level" required>
            <option value="1">1st Year</option>
            <option value="2">2nd Year</option>
            <option value="3">3rd Year</option>
            <option value="4">4th Year</option>
            <option value="5">5th Year</option>
          </select>
        </div>

        <div class="col-12 d-flex gap-2">
          <button class="btn btn-primary" id="btnCreate" type="submit">
            <i class="bi bi-person-plus me-1"></i> Create Account
          </button>
          <button class="btn btn-outline-primary" id="btnClear" type="button">Clear</button>
        </div>

        <div class="col-12" id="msg"></div>
      </form>
    </div>
  `;

  const form = document.getElementById("accountForm");
  const msg = document.getElementById("msg");
  const btnCreate = document.getElementById("btnCreate");
  const btnClear = document.getElementById("btnClear");

  const roleEl = document.getElementById("role");
  const officerTitleWrap = document.getElementById("officerTitleWrap");

  const dobEl = document.getElementById("date_of_birth");
  const ageEl = document.getElementById("age");

  function updateRoleUI() {
    const role = roleEl.value;
    officerTitleWrap.style.display = role === "officer" ? "block" : "none";
  }

  function collectBasePayload() {
    const first_name = document.getElementById("first_name").value.trim();
    const middle_name = document.getElementById("middle_name").value.trim();
    const last_name = document.getElementById("last_name").value.trim();

    return {
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,

      first_name,
      ...(middle_name ? { middle_name } : {}),
      last_name,

      date_of_birth: document.getElementById("date_of_birth").value,
      mobile_number: document.getElementById("mobile_number").value.trim(),
      address: document.getElementById("address").value.trim(),

      course: document.getElementById("course").value,
      year_level: Number(document.getElementById("year_level").value)
    };
  }

  updateRoleUI();
  roleEl.addEventListener("change", updateRoleUI);

  dobEl.addEventListener("change", () => {
    ageEl.value = calcAge(dobEl.value);
  });

  btnClear.addEventListener("click", () => {
    form.reset();
    msg.innerHTML = "";
    ageEl.value = "";
    updateRoleUI();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.innerHTML = "";
    btnCreate.disabled = true;

    try {
      const role = roleEl.value;
      const payload = collectBasePayload();

      let result;

      if (role === "student") {
        result = await createStudentAccount(payload);

      } else if (role === "officer") {
        const officer_title = document.getElementById("officer_title").value;
        result = await createOfficerAccount({ ...payload, officer_title });

      } else if (role === "president") {
        // Dean only (President won’t have this option in dropdown)
        result = await createOfficerAccount({ ...payload, officer_title: "President" });

      } else if (role === "dean") {
        // Dean only (President won’t have this option in dropdown)
        result = await createDeanAccount(payload);

      } else {
        throw new Error("Invalid role selected.");
      }

      msg.innerHTML = `
        <div class="alert alert-success">
          Created successfully: <b>${result.email ?? payload.email}</b><br>
          ${result.role ? `Role: <b>${result.role}</b><br>` : ""}
          ${result.officer_title ? `Position: <b>${result.officer_title}</b>` : ""}
        </div>
      `;

      form.reset();
      ageEl.value = "";
      updateRoleUI();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    } finally {
      btnCreate.disabled = false;
    }
  });
}

init();