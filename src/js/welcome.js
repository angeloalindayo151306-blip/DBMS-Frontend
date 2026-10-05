import { getMe } from "./api.js";
import { extractRole, roleToPage } from "./role.js";

const el = (id) => document.getElementById(id);

function fullName(me) {
  // try multiple possible fields (depends on what /me returns)
  const parts = [me.first_name, me.middle_name, me.last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return me.full_name || me.name || me.display_name || "User";
}

function addItem(container, key, value) {
  const div = document.createElement("div");
  div.className = "welcome-item";
  div.innerHTML = `<div class="k">${key}</div><div class="v">${value ?? "-"}</div>`;
  container.appendChild(div);
}

function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Your ACTUAL image files (based on your screenshot) live in: src/public/
 * So the URL paths are simply: /filename.png
 *
 * NOTE: you have "vp internal.png" with a SPACE, so we must use %20 in URL.
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

// if you add a dean picture later, put it in src/public/dean.png
const DEAN_AVATAR = "/dean.png";

function avatarFor(me, role) {
  if (role === "dean") return DEAN_AVATAR; // will fallback to default if missing

  if (role === "officer" || role === "president") {
    const key = normalizeTitle(
      me.officer_title || (role === "president" ? "president" : "")
    );
    return TITLE_TO_AVATAR[key] || "/default.png";
  }

  // student (or unknown): default
  return "/default.png";
}

// safe logout without assuming your auth.js exports logout()
async function doLogout() {
  try {
    const mod = await import("./auth.js");
    if (typeof mod.logout === "function") {
      await mod.logout();
      return;
    }
  } catch (_) {}

  // fallback: signOut via supabase client if available
  try {
    const mod = await import("./supabaseClient.js");
    const sb = mod.supabase || mod.supabaseClient;
    if (sb?.auth?.signOut) await sb.auth.signOut();
  } catch (_) {}
}

// optional: get email from Supabase session if /me doesn't return email
async function getEmailFallback() {
  try {
    const mod = await import("./supabaseClient.js");
    const sb = mod.supabase || mod.supabaseClient;
    if (!sb?.auth?.getUser) return null;
    const { data } = await sb.auth.getUser();
    return data?.user?.email || null;
  } catch (_) {
    return null;
  }
}

async function init() {
  const msg = el("message");
  const grid = el("infoGrid");
  const avatar = el("avatar");
  const subLine = el("subLine");

  try {
    const me = await getMe();
    const role = extractRole(me);
    if (!role) throw new Error("Role not found from /me. Check backend response.");

    // email: use /me first, then fallback to supabase user
    const email = me.email || (await getEmailFallback()) || "-";

    // LEFT PANEL
    if (el("fullName")) el("fullName").textContent = fullName(me);
    if (subLine) {
      if (role === "dean") subLine.textContent = "Dean";
      else if ((role === "officer" || role === "president") && me.officer_title)
        subLine.textContent = me.officer_title;
      else subLine.textContent = "DFMS User";
    }

    if (el("rolePill")) {
      // If you want the pill to highlight position more, use officer_title when present
      const pillText =
        (role === "officer" || role === "president") && me.officer_title
          ? me.officer_title.toUpperCase()
          : role.toUpperCase();
      el("rolePill").textContent = pillText;
    }

    if (avatar) {
      avatar.src = avatarFor(me, role);
      avatar.onerror = () => (avatar.src = "/default.png");
    }

    // Quick Info (left)
    const side = el("sideInfo");
    if (side) {
      side.innerHTML = `
        <div><strong>Email</strong><span>${email}</span></div>
        <div><strong>Role</strong><span>${role}</span></div>
        ${
          (role === "officer" || role === "president") && me.officer_title
            ? `<div><strong>Position</strong><span>${me.officer_title}</span></div>`
            : ""
        }
      `;
    }

    // RIGHT GRID
    if (grid) {
      grid.innerHTML = "";
      addItem(grid, "Email", email);
      addItem(grid, "Role", role);

      if (role === "student") {
        addItem(grid, "Course", me.course);
        addItem(grid, "Year Level", me.year_level);
        addItem(grid, "Mobile", me.mobile_number);
        addItem(grid, "Address", me.address);
      }

      if (role === "officer" || role === "president") {
        addItem(grid, "Position", me.officer_title || "Officer");
      }

      if (role === "dean") {
        addItem(grid, "Office", "Dean");
      }
    }

    // Buttons
    el("btnContinue")?.addEventListener("click", () => {
      window.location.href = roleToPage(role);
    });

    el("btnLogout")?.addEventListener("click", async () => {
      await doLogout();
      window.location.href = "/pages/login.html";
    });
  } catch (err) {
    if (msg) msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    if (el("btnContinue")) el("btnContinue").disabled = true;
  }
}

init();