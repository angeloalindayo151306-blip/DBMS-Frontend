import { getMe } from "./api.js";
import { extractRole, roleToPage } from "./role.js";

const el = (id) => document.getElementById(id);

function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(me) {
  const parts = [me.first_name, me.middle_name, me.last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return me.full_name || me.name || me.display_name || "User";
}

const formatCcsId = (n) => (n ? `CCS-${String(n).padStart(6, "0")}` : "—");

/**
 * Your files are in src/public/ so URLs are /filename.png
 * Note: "vp internal.png" has a SPACE, so use %20.
 */
const TITLE_TO_AVATAR = {
  president: "/president.png",
  "vp internal": "/vp%20internal.png",
  "vp external": "/vp-external.png",
  treasurer: "/treasurer.png",
  secretary: "/secretary.png",
  pio: "/pio.png",
  auditor: "/auditor.png",
};

function avatarFor(me, role) {
  if (role === "dean") return "/dean.png"; // if missing, fallback to default below

  if (role === "officer" || role === "president") {
    const key = normalizeTitle(
      me.officer_title || (role === "president" ? "president" : "")
    );
    return TITLE_TO_AVATAR[key] || "/default.png";
  }

  // Student default
  return "/default.png";
}

// Safe logout (works even if you don't export logout() yet)
async function doLogout() {
  try {
    const mod = await import("./auth.js");
    if (typeof mod.logout === "function") {
      await mod.logout();
      return;
    }
  } catch (_) {}

  try {
    const mod = await import("./supabaseClient.js");
    const sb = mod.supabase || mod.supabaseClient;
    if (sb?.auth?.signOut) await sb.auth.signOut();
  } catch (_) {}
}

// If /me doesn't return email, get from Supabase session
async function getEmailFallback() {
  try {
    const mod = await import("./supabaseClient.js");
    const sb = mod.supabase || mod.supabaseClient;
    const { data } = await sb.auth.getUser();
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

/**
 * Ensures there is a field value element (span/div/etc) to put the ID number into.
 * If #vCcsIdNo doesn't exist in HTML, it will insert a row after the row containing #vEmail.
 * This avoids breaking your page even if you did not edit welcome.html.
 */
function ensureValueField({ valueId, labelText, afterValueId }) {
  let valueEl = el(valueId);
  if (valueEl) return valueEl;

  const afterEl = el(afterValueId);
  if (!afterEl) return null;

  // If fields are in a table
  const afterTr = afterEl.closest("tr");
  if (afterTr && afterTr.parentElement) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-muted">${labelText}</td>
      <td class="text-end fw-semibold" id="${valueId}">—</td>
    `;
    afterTr.insertAdjacentElement("afterend", tr);
    return el(valueId);
  }

  // If fields are in div rows
  const row = afterEl.closest(".d-flex") || afterEl.parentElement;
  const wrap = document.createElement("div");
  wrap.className = row?.className || "d-flex justify-content-between";
  wrap.innerHTML = `
    <div class="text-muted">${labelText}</div>
    <div class="fw-semibold" id="${valueId}">—</div>
  `;
  row?.insertAdjacentElement("afterend", wrap);

  return el(valueId);
}

async function init() {
  const msg = el("message");

  try {
    const me = await getMe();
    const role = extractRole(me);
    if (!role) throw new Error("Role not found from /me.");

    const email = me.email || (await getEmailFallback()) || "-";

    // Header text
    el("fullName").textContent = fullName(me);

    // Subtitle
    const subLine = el("subLine");
    if (role === "dean") subLine.textContent = "Dean";
    else if ((role === "officer" || role === "president") && me.officer_title)
      subLine.textContent = me.officer_title;
    else if (role === "student") subLine.textContent = "Student";
    else subLine.textContent = "DFMS User";

    // Role pill text (show position for officers when available)
    const pillText =
      (role === "officer" || role === "president") && me.officer_title
        ? me.officer_title.toUpperCase()
        : role.toUpperCase();
    el("rolePill").textContent = pillText;

    // Avatar
    const avatar = el("avatar");
    avatar.src = avatarFor(me, role);
    avatar.onerror = () => (avatar.src = "/default.png");

    // Fill fields
    el("vEmail").textContent = email;
    el("vMobile").textContent = me.mobile_number || "-";
    el("vCourse").textContent = me.course || "-";
    el("vYear").textContent = me.year_level ?? "-";
    el("vAge").textContent = me.age ?? "-";
    el("vAddress").textContent = me.address || "-";

    // NEW: Show ID No (all roles except Dean; dean will show "—")
    const idField = ensureValueField({
      valueId: "vCcsIdNo",
      labelText: "ID No.",
      afterValueId: "vEmail",
    });
    if (idField) idField.textContent = formatCcsId(me?.ccs_id_no);

    // Buttons
    el("btnContinue").addEventListener("click", () => {
      window.location.href = roleToPage(role);
    });

    el("btnLogout").addEventListener("click", async () => {
      await doLogout();
      window.location.href = "/pages/login.html";
    });
  } catch (err) {
    msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    el("btnContinue").disabled = true;
  }
}

init();