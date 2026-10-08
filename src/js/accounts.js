import { requireRoles } from "./guard.js";
import { renderSidebar } from "./ui.js";
import {
  createOfficerAccount,
  createStudentAccount,
  createDeanAccount,
  listAccounts,
  updateAccount,
  deleteAccount,   // used as DISABLE (ban)
  enableAccount,   // you will add this in api.js (snippet below)
} from "./api.js";

const el = (id) => document.getElementById(id);

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

function safe(v) {
  return v ?? "";
}

function fullNameRow(p) {
  return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") || "(No name)";
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let AUTH_ROLE = null;
let ACCOUNTS_CACHE = [];
let bsEditModal = null;

// ---------- Toast ----------
let bsToast = null;
function toast(type, html) {
  const toastEl = el("appToast");
  const bodyEl = el("appToastBody");

  const map = {
    success: { cls: "text-bg-success", icon: "bi-check2-circle" },
    danger: { cls: "text-bg-danger", icon: "bi-x-circle" },
    warning: { cls: "text-bg-warning", icon: "bi-exclamation-triangle" },
    info: { cls: "text-bg-info", icon: "bi-info-circle" },
  };

  const t = map[type] || map.info;
  toastEl.className = `toast align-items-center border-0 ${t.cls}`;
  bodyEl.innerHTML = `<i class="bi ${t.icon} me-2"></i>${html}`;

  if (!bsToast) bsToast = new bootstrap.Toast(toastEl, { delay: 2600 });
  bsToast.show();
}

// ---------- Confirm modal ----------
let bsConfirmModal = null;
function confirmModal({
  title = "Confirm",
  body = "Are you sure?",
  okText = "Confirm",
  okBtnClass = "btn-danger",
} = {}) {
  const modalEl = el("confirmModal");
  if (!bsConfirmModal) bsConfirmModal = new bootstrap.Modal(modalEl);

  const previouslyFocused = document.activeElement;

  el("confirmTitle").textContent = title;
  el("confirmBody").innerHTML = body;

  const okBtn = el("confirmOkBtn");
  okBtn.textContent = okText;
  okBtn.className = `btn ${okBtnClass}`;

  return new Promise((resolve) => {
    const onOk = () => {
      okBtn.blur();
      cleanup();
      bsConfirmModal.hide();
      resolve(true);
    };

    const onHidden = () => {
      cleanup();
      previouslyFocused?.focus?.();
      resolve(false);
    };

    function cleanup() {
      okBtn.removeEventListener("click", onOk);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
    }

    okBtn.addEventListener("click", onOk);
    modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });

    bsConfirmModal.show();
  });
}
// ------------------------------------

function canManageTarget(targetRole) {
  if (AUTH_ROLE === "dean") return true;
  // President can manage student/officer only
  return targetRole === "student" || targetRole === "officer";
}

function applyClientFilters(rows) {
  const roleVal = el("filterRole").value;
  const q = (el("searchAccount").value || "").toLowerCase().trim();

  return (rows || []).filter((p) => {
    const isDisabled = !!p.disabled;

    // Disabled Accounts filter
    if (roleVal === "banned") {
      if (!isDisabled) return false;
    } else {
      // For ALL and specific roles: ACTIVE ONLY
      if (isDisabled) return false;

      if (roleVal !== "all" && p.role !== roleVal) return false;
    }

    if (q) {
      const hay = `${fullNameRow(p)} ${p.email ?? ""} ${p.mobile_number ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function roleBadge(role, disabled) {
  const r = (role || "").toLowerCase();
  const cls =
    r === "dean" ? "dark" :
    r === "president" ? "primary" :
    r === "officer" ? "secondary" :
    "info";

  const dis = disabled
    ? `<span class="badge text-bg-warning ms-2">DISABLED</span>`
    : "";

  return `<span class="badge text-bg-${cls}">${escapeHtml(r || "-")}</span>${dis}`;
}

function renderAccounts(rows) {
  const tbody = el("accountsTbody");
  const filtered = applyClientFilters(rows);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No accounts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((p) => {
      const name = fullNameRow(p);
      const email = p.email ?? "-";
      const role = p.role ?? "-";
      const pos = p.officer_title ?? "-";
      const cy = p.course ? `${p.course} / ${p.year_level ?? "-"}` : "-";
      const mobile = p.mobile_number ?? "-";

      const disabledFlag = !!p.disabled;

      const allowed = canManageTarget(role);
      const btnDisabled = allowed ? "" : "disabled";
      const hint = allowed ? "" : `title="Not allowed"`;

      // If disabled => show Enable, else show Disable
      const enableBtn = disabledFlag
        ? `<button class="btn btn-sm btn-outline-success btn-enable ms-2" data-id="${p.id}" ${btnDisabled} ${hint}>
             <i class="bi bi-arrow-counterclockwise me-1"></i>Enable
           </button>`
        : "";

      const disableBtn = !disabledFlag
        ? `<button class="btn btn-sm btn-outline-danger btn-disable ms-2" data-id="${p.id}" ${btnDisabled} ${hint}>
             <i class="bi bi-slash-circle me-1"></i>Disable
           </button>`
        : "";

      return `
        <tr ${disabledFlag ? 'style="opacity:.75;"' : ""}>
          <td class="fw-semibold">${escapeHtml(name)}</td>
          <td>${escapeHtml(email)}</td>
          <td>${roleBadge(role, disabledFlag)}</td>
          <td>${escapeHtml(pos)}</td>
          <td>${escapeHtml(cy)}</td>
          <td>${escapeHtml(mobile)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary btn-edit" data-id="${p.id}" ${btnDisabled} ${hint}>
              <i class="bi bi-pencil-square me-1"></i>Edit
            </button>
            ${enableBtn}
            ${disableBtn}
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEdit(btn.dataset.id));
  });

  tbody.querySelectorAll(".btn-disable").forEach((btn) => {
    btn.addEventListener("click", () => onDisable(btn.dataset.id));
  });

  tbody.querySelectorAll(".btn-enable").forEach((btn) => {
    btn.addEventListener("click", () => onEnable(btn.dataset.id));
  });
}

async function loadAccounts() {
  const tbody = el("accountsTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="text-muted">Loading…</td></tr>`;

  const roleVal = el("filterRole").value;

  // Only fetch disabled from backend when viewing "Disabled Accounts"
  const include_disabled = roleVal === "banned";

  const rows = await listAccounts({ include_disabled });
  ACCOUNTS_CACHE = Array.isArray(rows) ? rows : [];
  renderAccounts(ACCOUNTS_CACHE);
}

function updateRoleUI() {
  const role = el("role").value;
  el("officerTitleWrap").style.display = role === "officer" ? "block" : "none";
}

function collectBasePayload() {
  const first_name = el("first_name").value.trim();
  const middle_name = el("middle_name").value.trim();
  const last_name = el("last_name").value.trim();

  return {
    email: el("email").value.trim(),
    password: el("password").value,

    first_name,
    ...(middle_name ? { middle_name } : {}),
    last_name,

    date_of_birth: el("date_of_birth").value,
    mobile_number: el("mobile_number").value.trim(),
    address: el("address").value.trim(),

    course: el("course").value,
    year_level: Number(el("year_level").value),
  };
}

function openEdit(id) {
  const row = ACCOUNTS_CACHE.find((x) => String(x.id) === String(id));
  if (!row) return;

  if (!canManageTarget(row.role)) {
    toast("danger", "You are not allowed to edit this role.");
    return;
  }

  el("editMsg").innerHTML = "";
  el("editId").value = row.id;

  el("editEmail").value = row.email ?? "";
  el("editRole").value = row.role ?? "";

  el("editFirst").value = safe(row.first_name);
  el("editMiddle").value = safe(row.middle_name);
  el("editLast").value = safe(row.last_name);

  el("editDob").value = safe(row.date_of_birth);
  el("editAge").value = calcAge(row.date_of_birth);

  el("editMobile").value = safe(row.mobile_number);
  el("editAddress").value = safe(row.address);

  el("editCourse").value = safe(row.course);
  el("editYear").value = row.year_level ?? "";
  el("editOfficerTitle").value = safe(row.officer_title);

  el("editNewPassword").value = "";

  el("editDob").onchange = (e) => {
    el("editAge").value = calcAge(e.target.value);
  };

  bsEditModal.show();
}

async function saveEdit() {
  const editMsg = el("editMsg");
  const btnSave = el("btnSaveAccount");

  editMsg.innerHTML = "";
  btnSave.disabled = true;

  try {
    const id = el("editId").value;

    const payload = {
      first_name: el("editFirst").value.trim(),
      middle_name: el("editMiddle").value.trim() || null,
      last_name: el("editLast").value.trim(),

      date_of_birth: el("editDob").value || null,
      mobile_number: el("editMobile").value.trim() || null,
      address: el("editAddress").value.trim() || null,

      course: el("editCourse").value || null,
      year_level: el("editYear").value ? Number(el("editYear").value) : null,

      officer_title: el("editOfficerTitle").value.trim() || null,
    };

    const new_password = el("editNewPassword").value || "";
    if (new_password.trim()) payload.new_password = new_password;

    await updateAccount(id, payload);

    toast("success", "Account updated successfully.");
    await loadAccounts();
    bsEditModal.hide();
  } catch (err) {
    toast("danger", err.message);
  } finally {
    btnSave.disabled = false;
  }
}

async function onDisable(id) {
  const row = ACCOUNTS_CACHE.find((x) => String(x.id) === String(id));
  if (!row) return;

  if (!canManageTarget(row.role)) {
    toast("danger", "Not allowed to disable this role.");
    return;
  }

  const ok = await confirmModal({
    title: "Disable Account",
    body: `
      Disable login access for this account?<br><br>
      <b>Name:</b> ${escapeHtml(fullNameRow(row))}<br>
      <b>Email:</b> ${escapeHtml(row.email ?? "-")}<br>
      <b>Role:</b> ${escapeHtml(row.role ?? "-")}<br><br>
      <span class="text-muted">This will prevent login, but keeps records/history.</span>
    `,
    okText: "Disable",
    okBtnClass: "btn-danger",
  });

  if (!ok) return;

  try {
    // backend uses DELETE as disable/ban
    await deleteAccount(id);
    toast("success", "Account disabled successfully.");
    await loadAccounts();
  } catch (err) {
    toast("danger", err.message);
  }
}

async function onEnable(id) {
  const row = ACCOUNTS_CACHE.find((x) => String(x.id) === String(id));
  if (!row) return;

  if (!canManageTarget(row.role)) {
    toast("danger", "Not allowed to enable this role.");
    return;
  }

  const ok = await confirmModal({
    title: "Enable Account",
    body: `
      Enable login access for this account?<br><br>
      <b>Name:</b> ${escapeHtml(fullNameRow(row))}<br>
      <b>Email:</b> ${escapeHtml(row.email ?? "-")}<br>
      <b>Role:</b> ${escapeHtml(row.role ?? "-")}
    `,
    okText: "Enable",
    okBtnClass: "btn-success",
  });

  if (!ok) return;

  try {
    await enableAccount(id);
    toast("success", "Account enabled successfully.");
    await loadAccounts();
  } catch (err) {
    toast("danger", err.message);
  }
}

async function init() {
  const auth = await requireRoles(["dean", "president"]);
  if (!auth) return;

  AUTH_ROLE = auth.role;
  renderSidebar(el("sidebar"), auth.role);

  const isPresident = auth.role === "president";

  el("pageHint").textContent = isPresident
    ? "President can create Student/Officer and manage Student/Officer accounts."
    : "Dean can create and manage Student/Officer/President/Dean accounts.";

  el("listHint").textContent = isPresident
    ? "Showing Students and Officers only."
    : "Showing all roles.";

  // Restrict role dropdown for president
  const roleSelect = el("role");
  const roleNote = el("roleNote");

  if (isPresident) {
    [...roleSelect.options].forEach((opt) => {
      if (opt.value === "dean" || opt.value === "president") opt.remove();
    });
    roleNote.textContent = "Dean/President accounts are Dean-only.";
  } else {
    roleNote.textContent = "Role rules are enforced by backend.";
  }

  // Restrict filter dropdown for president
  const filterRole = el("filterRole");
  if (isPresident) {
    [...filterRole.options].forEach((opt) => {
      if (opt.value === "dean" || opt.value === "president") opt.remove();
    });
  }

  // Bootstrap modal
  bsEditModal = new bootstrap.Modal(el("editAccountModal"));

  // Create form handlers
  updateRoleUI();
  roleSelect.addEventListener("change", updateRoleUI);

  el("date_of_birth").addEventListener("change", () => {
    el("age").value = calcAge(el("date_of_birth").value);
  });

  el("btnClear").addEventListener("click", () => {
    el("accountForm").reset();
    el("msg").innerHTML = "";
    el("age").value = "";
    updateRoleUI();
  });

  el("accountForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const btnCreate = el("btnCreate");
    btnCreate.disabled = true;

    try {
      const role = roleSelect.value;
      const payload = collectBasePayload();

      let result;
      if (role === "student") {
        result = await createStudentAccount(payload);
      } else if (role === "officer") {
        const officer_title = el("officer_title").value;
        result = await createOfficerAccount({ ...payload, officer_title });
      } else if (role === "president") {
        result = await createOfficerAccount({ ...payload, officer_title: "President" });
      } else if (role === "dean") {
        result = await createDeanAccount(payload);
      } else {
        throw new Error("Invalid role selected.");
      }

      toast(
        "success",
        `Created successfully: <b>${escapeHtml(result.email ?? payload.email)}</b>` +
          (result.role ? `<br>Role: <b>${escapeHtml(result.role)}</b>` : "") +
          (result.officer_title ? `<br>Position: <b>${escapeHtml(result.officer_title)}</b>` : "")
      );

      el("accountForm").reset();
      el("age").value = "";
      updateRoleUI();

      await loadAccounts();
    } catch (err) {
      toast("danger", err.message);
    } finally {
      btnCreate.disabled = false;
    }
  });

  // List handlers
  el("btnReloadAccounts").addEventListener("click", loadAccounts);
  el("filterRole").addEventListener("change", loadAccounts);
  el("searchAccount").addEventListener("input", () => renderAccounts(ACCOUNTS_CACHE));

  // Show disabled toggle
  if (el("showDisabled")) {
    el("showDisabled").addEventListener("change", loadAccounts);
  }

  // Save edit
  el("btnSaveAccount").addEventListener("click", saveEdit);

  await loadAccounts();
}

init();