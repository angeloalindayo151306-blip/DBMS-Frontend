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
    const key = normalizeTitle(me.officer_title || (role === "president" ? "president" : ""));
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
    else if ((role === "officer" || role === "president") && me.officer_title) subLine.textContent = me.officer_title;
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