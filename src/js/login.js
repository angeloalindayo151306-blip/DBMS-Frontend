import { login } from './auth.js';
import { getMe } from './api.js';
import { extractRole, roleToPage } from './role.js';

const form = document.getElementById('loginForm');
const msg = document.getElementById('message');
const btn = document.getElementById('btnLogin');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.innerHTML = '';
  btn.disabled = true;
  btn.textContent = 'Logging in...';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { error } = await login(email, password);
    if (error) throw error;

    const me = await getMe();
    const role = extractRole(me);

    if (!role)
      throw new Error('Role not found from /me. Check backend response.');
      window.location.href = '/pages/welcome.html';
  } catch (err) {
    msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});
