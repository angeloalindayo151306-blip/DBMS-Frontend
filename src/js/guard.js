import { getMe } from './api.js';
import { extractRole, roleToPage } from './role.js';

export async function requireRoles(allowedRoles = []) {
  try {
    const me = await getMe();
    const role = extractRole(me);

    if (!role) {
      window.location.href = '/pages/login.html';
      return null;
    }

    if (allowedRoles.length && !allowedRoles.includes(role)) {
      window.location.href = roleToPage(role);
      return null;
    }

    return { me, role };
  } catch (e) {
    // if token missing/expired => backend returns 401
    if (e.status === 401) window.location.href = '/pages/login.html';
    throw e;
  }
}
