/**
 * API client — thin fetch wrapper with auth header injection.
 *
 * api.*   → calls /api/v1/*  (auth, config, employees, payroll, leave)
 * raw.*   → calls /*          (attendance, iclock — mounted without prefix)
 */

const BASE = '/api/v1';

function getToken() {
  return localStorage.getItem('auth_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle no-content responses (204)
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    const message = data.detail || data.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

const api = {
  get: (path) => request(path, { method: 'GET' }),

  post: (path, body) => request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  patch: (path, body) => request(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),

  delete: (path) => request(path, { method: 'DELETE' }),
};

// Routes mounted WITHOUT /api/v1 prefix (attendance_router, adms_router)
async function rawRequest(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const message = data.detail || data.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const raw = {
  get: (path) => rawRequest(path, { method: 'GET' }),
  post: (path, body) => rawRequest(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => rawRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => rawRequest(path, { method: 'DELETE' }),
};

export default api;
