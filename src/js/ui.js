import { logout } from './auth.js';

function navItemsForRole(role) {
  if (role === 'student') {
    return [
      { label: 'Dashboard', href: '/pages/student.html' },
      { label: 'Events', href: '/pages/student-events.html' },
      { label: 'Make Payment', href: '/pages/student-pay.html' },
      { label: 'History/Receipts', href: '/pages/student-history.html' },
    ];
  }

  if (role === 'officer') {
    return [
      { label: 'Dashboard', href: '/pages/officer.html' },
      { label: 'Proposals', href: '/pages/officer-proposals.html' },
      // (optional later) student creation link for officers
    ];
  }

  if (role === 'dean') {
    return [
      { label: 'Dashboard', href: '/pages/dean.html' },
      { label: 'Approvals', href: '/pages/dean-approvals.html' },
      { label: 'Reports', href: '/pages/dean-reports.html' },
      { label: 'Accounts', href: '/pages/accounts.html' }, // Dean creates officers here
    ];
  }

  if (role === 'president') {
    return [
      { label: 'Dashboard', href: '/pages/president.html' },
      { label: 'Create Students', href: '/pages/accounts.html' }, // President creates students here
    ];
  }

  return [{ label: 'Login', href: '/pages/login.html' }];
}

export function renderSidebar(el, role) {
  const items = navItemsForRole(role);
  const current = window.location.pathname;

  el.innerHTML = `
    <h5 class="mb-3">DFMS</h5>
    <div class="small mb-3">Role: <b>${role ?? 'unknown'}</b></div>

    ${items
      .map(
        (i) =>
          `<a class="${current === i.href ? 'active' : ''}" href="${i.href}">${
            i.label
          }</a>`
      )
      .join('')}

    <hr style="opacity:.25">
    <a href="#" id="btnLogout">Logout</a>
  `;

  el.querySelector('#btnLogout').addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
    window.location.href = '/pages/login.html';
  });
}
