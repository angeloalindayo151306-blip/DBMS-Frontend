import { logout } from "./auth.js";

function navItemsForRole(role) {
  if (role === "student") {
    return [
      { label: "Dashboard", href: "/pages/student.html", icon: "bi-speedometer2" },
      { label: "Events", href: "/pages/student-events.html", icon: "bi-calendar-event" },
      { label: "Make Payment", href: "/pages/student-pay.html", icon: "bi-cash-coin" },
      { label: "History/Receipts", href: "/pages/student-history.html", icon: "bi-receipt" },
    ];
  }

  if (role === "officer") {
    return [
      { label: "Dashboard", href: "/pages/officer.html", icon: "bi-speedometer2" },
      { label: "Proposals", href: "/pages/officer-proposals.html", icon: "bi-file-earmark-text" },
      { label: "Proposal Payments", href: "/pages/officer-payments-list.html", icon: "bi-clipboard-data" },
      // NEW:
      { label: "Expenses", href: "/pages/officer-expenses.html", icon: "bi-receipt-cutoff" },
    ];
  }

  if (role === "dean") {
    return [
      { label: "Dashboard", href: "/pages/dean.html", icon: "bi-speedometer2" },
      { label: "Approvals", href: "/pages/dean-approvals.html", icon: "bi-check2-square" },
      // Optional convenience link that opens the Expenses tab (still same page)
     
      { label: "Reports", href: "/pages/dean-reports.html", icon: "bi-bar-chart-line" },
      { label: "Accounts", href: "/pages/accounts.html", icon: "bi-people" },
    ];
  }

  if (role === "president") {
    return [
      { label: "Dashboard", href: "/pages/president.html", icon: "bi-speedometer2" },
      { label: "Proposals", href: "/pages/officer-proposals.html", icon: "bi-file-earmark-text" },
      { label: "Proposal Payments", href: "/pages/officer-payments-list.html", icon: "bi-clipboard-data" },
      // NEW:
      { label: "Expenses", href: "/pages/officer-expenses.html", icon: "bi-receipt-cutoff" },
      { label: "Accounts", href: "/pages/accounts.html", icon: "bi-people" },
    ];
  }

  return [{ label: "Login", href: "/pages/login.html", icon: "bi-box-arrow-in-right" }];
}

export function renderSidebar(el, role) {
  const items = navItemsForRole(role);
  const current = window.location.pathname;
  const hash = window.location.hash || "";

  // active highlight should work with #hash links too
  const isActive = (href) => {
    // exact match (no hash)
    if (href === current) return true;

    // match path + hash for links like /pages/dean-approvals.html#expenses
    if (href.includes("#")) {
      const [path, h] = href.split("#");
      return path === current && (`#${h}` === hash);
    }
    return false;
  };

  el.innerHTML = `
    <div class="brand">
      <div class="brand-icon">
        <img
          src="/CCS logo.jpg"
          alt="CCS Logo"
          class="brand-logo"
          onerror="this.style.display='none';"
        />
      </div>
      <div>
        <div class="brand-title">DFMS</div>
        <div class="brand-subtitle">College of Computer Studies</div>
      </div>
    </div>

    <div class="role-pill">
      <i class="bi bi-person-badge"></i>
      <span>Role:</span>
      <b style="text-transform:capitalize">${role ?? "unknown"}</b>
    </div>

    ${items
      .map(
        (i) => `
          <a class="${isActive(i.href) ? "active" : ""}" href="${i.href}">
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

  // If dean clicks "Expense Approvals" link with #expenses, open expenses tab automatically
  if (current.endsWith("/dean-approvals.html") && hash === "#expenses") {
    const btn = document.querySelector("#tab-expenses");
    if (btn) btn.click();
  }
}