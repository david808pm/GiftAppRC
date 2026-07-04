const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'giftapp_backend_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredToken() {
  return getToken();
}

async function request(method, path, body = null) {
  const url = `${API_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.', {
      cause: networkError,
    });
  }

  if (response.status === 401) {
    clearToken();
    const err = new Error('Sesión expirada. Inicia sesión nuevamente.');
    err.status = 401;
    throw err;
  }

  // No content (e.g. 204 from some DELETE endpoints): nothing to parse.
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    if (!response.ok) {
      throw new Error(`Error del servidor (${response.status}).`);
    }
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Error del servidor (${response.status}).`);
  }

  if (!response.ok) {
    const messages = Array.isArray(data.message) ? data.message : [data.message || 'Error del servidor.'];
    throw new Error(messages.join(' '));
  }

  return data;
}

async function uploadRequest(method, path, formData) {
  const url = `${API_URL}${path}`;
  const headers = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, { method, headers, body: formData });
  } catch (networkError) {
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.', {
      cause: networkError,
    });
  }

  if (response.status === 401) {
    clearToken();
    const err = new Error('Sesión expirada. Inicia sesión nuevamente.');
    err.status = 401;
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Error del servidor (${response.status}).`);
  }

  if (!response.ok) {
    const messages = Array.isArray(data.message) ? data.message : [data.message || 'Error del servidor.'];
    throw new Error(messages.join(' '));
  }

  return data;
}

async function downloadBlobRequest(method, path, queryParams = {}) {
  const qs = new URLSearchParams(queryParams).toString();
  const url = `${API_URL}${path}${qs ? '?' + qs : ''}`;
  const headers = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, { method, headers });
  } catch (networkError) {
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión.', {
      cause: networkError,
    });
  }

  if (response.status === 401) {
    clearToken();
    const err = new Error('Sesión expirada. Inicia sesión nuevamente.');
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    let msg;
    try {
      const data = await response.json();
      const messages = Array.isArray(data.message) ? data.message : [data.message || 'Error del servidor.'];
      msg = messages.join(' ');
    } catch {
      msg = `Error del servidor (${response.status}).`;
    }
    throw new Error(msg);
  }

  return response.blob();
}

export const apiClient = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  upload: (path, formData) => uploadRequest('POST', path, formData),
  downloadBlob: (path, queryParams = {}) => downloadBlobRequest('GET', path, queryParams),
};
