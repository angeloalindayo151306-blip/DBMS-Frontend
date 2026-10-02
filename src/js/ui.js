import { logout } from "./auth.js";

function navItemsForRole(role) {
  if (role === "student") {
    return [
      { label: "Dashboard", href: "/pages/student.html", icon: "bi-speedometer2" },
      { label: "Events", href: "/pages/student-events.html", icon: "bi-calendar-event" },
      { label: "Make Payment", href: "/pages/student-pay.html", icon: "bi-cash-coin" },
      { label: "History/Receipts", href: "/pages/student-history.html", icon: "bi-receipt" }
    ];
  }

  if (role === "officer") {
    return [
      { label: "Dashboard", href: "/pages/officer.html", icon: "bi-speedometer2" },
      { label: "Proposals", href: "/pages/officer-proposals.html", icon: "bi-file-earmark-text" },
      { label: "Proposal Payments", href: "/pages/officer-payments-list.html", icon: "bi-clipboard-data" }
    ];
  }

  if (role === "dean") {
    return [
      { label: "Dashboard", href: "/pages/dean.html", icon: "bi-speedometer2" },
      { label: "Approvals", href: "/pages/dean-approvals.html", icon: "bi-check2-square" },
      { label: "Reports", href: "/pages/dean-reports.html", icon: "bi-bar-chart-line" },
      { label: "Accounts", href: "/pages/accounts.html", icon: "bi-people" }
    ];
  }

  if (role === "president") {
    return [
      { label: "Dashboard", href: "/pages/president.html", icon: "bi-speedometer2" },
      { label: "Proposals", href: "/pages/officer-proposals.html", icon: "bi-file-earmark-text" },
      { label: "Proposal Payments", href: "/pages/officer-payments-list.html", icon: "bi-clipboard-data" },
      { label: "Accounts", href: "/pages/accounts.html", icon: "bi-people" }
    ];
  }

  return [{ label: "Login", href: "/pages/login.html", icon: "bi-box-arrow-in-right" }];
}

export function renderSidebar(el, role) {
  const items = navItemsForRole(role);
  const current = window.location.pathname;

  el.innerHTML = `
    <div class="brand">
      <div class="brand-icon"><i class="bi bi-laptop"></i></div>
      <div>
        <div class="brand-title">DFMS</div>
        <div class="brand-subtitle">College of Computer Studies</div>
      </div>
    </div>

    <div class="role-pill">
      <i class="bi bi-person-badge"></i>
      <span>Role:</span> <b style="text-transform:capitalize">${role ?? "unknown"}</b>
    </div>

    ${items
      .map(
        (i) => `
          <a class="${current === i.href ? "active" : ""}" href="${i.href}">
            <i class="bi ${i.icon}"></i>
            <span>${i.label}</span>
          </a>
        `
      )
      .join("")}

    <hr>

    <a href="#" id="btnLogout">
      <i class="bi bi-box-arrow-left"></i>
      <span>Logout</span>
    </a>
  `;

  el.querySelector("#btnLogout").addEventListener("click", async (e) => {
    e.preventDefault();
    await logout();
    window.location.href = "/pages/login.html";
  });
}