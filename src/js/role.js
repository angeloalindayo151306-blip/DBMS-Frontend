export function extractRole(me) {
  const role =
    me?.role ??
    me?.profile?.role ??
    me?.profiles?.role ??
    me?.data?.role ??
    null;

  return typeof role === 'string' ? role.toLowerCase() : null;
}

export function roleToPage(role) {
  if (role === 'student') return '/pages/student.html';
  if (role === 'officer') return '/pages/officer.html';
  if (role === 'dean') return '/pages/dean.html';
  if (role === 'president') return '/pages/president.html';
  return '/pages/login.html';
}
