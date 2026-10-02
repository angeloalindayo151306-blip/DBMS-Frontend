import { API_BASE_URL } from './config.js';
import { getAccessToken } from './auth.js';

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// --- auth/profile ---
export function getMe() {
  return apiFetch('/me');
}

// --- student ---
export function getEvents() {
  return apiFetch('/events');
}

export function createPayment(payload) {
  return apiFetch('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMyPayments() {
  return apiFetch('/my/payments');
}

// --- officer/dean ---
export function getProposals(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch(`/proposals${qs}`);
}

export function createProposal(payload) {
  return apiFetch('/proposals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function editProposal(id, payload) {
  return apiFetch(`/proposals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function setProposalStatus(id, payload) {
  return apiFetch(`/proposals/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getOfficerProposalPayments(proposalId) {
  return apiFetch(`/officer/proposals/${proposalId}/payments`);
}

// --- dean ---
export function getDepartmentReport() {
  return apiFetch('/reports/department');
}
export function createOfficerAccount(payload) {
  return apiFetch('/accounts/officers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createStudentAccount(payload) {
  return apiFetch('/accounts/students', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createDeanAccount(payload) {
  return apiFetch("/accounts/deans", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}