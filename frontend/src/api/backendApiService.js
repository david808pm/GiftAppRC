import { apiClient, setToken, clearToken, getStoredToken } from './apiClient';

// ── Token Management ─────────────────────────────────────

export function storeAdminToken(token) {
  setToken(token);
}

export function clearAdminToken() {
  clearToken();
}

export function getAdminToken() {
  return getStoredToken();
}

// ── Auth ─────────────────────────────────────────────────

export async function adminLogin(email, password) {
  const data = await apiClient.post('/auth/login', { email, password });

  if (data.accessToken) {
    storeAdminToken(data.accessToken);
  }

  return data;
}

export async function getAdminMe() {
  const token = getAdminToken();
  if (!token) return null;

  try {
    const data = await apiClient.get('/auth/me');
    return data;
  } catch (err) {
    // Only clear token on confirmed 401 (auth failure).
    // apiClient already clears the token on 401 before throwing.
    // For non-401 errors (400/500/network), preserve the
    // valid token so the user is not logged out by a transient error.
    if (err?.status === 401) {
      clearAdminToken();
    }
    return null;
  }
}

// ── Placeholder exports for future modules ───────────────

export async function fetchCampaigns(params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiClient.get(`/admin/campaigns${query ? '?' + query : ''}`);
}

export async function createCampaign(data) {
  return apiClient.post('/admin/campaigns', data);
}

export async function updateCampaign(id, data) {
  return apiClient.patch(`/admin/campaigns/${id}`, data);
}

export async function deleteCampaign(id) {
  return apiClient.delete(`/admin/campaigns/${id}`);
}

export async function uploadCampaignLogo(campaignId, file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload(`/admin/campaigns/${campaignId}/logo`, formData);
}

export async function fetchEmployees(query = {}) {
  const params = new URLSearchParams(query).toString();
  return apiClient.get(`/admin/employees${params ? '?' + params : ''}`);
}

export async function createEmployee(data) {
  return apiClient.post('/admin/employees', data);
}

export async function updateEmployee(id, data) {
  return apiClient.patch(`/admin/employees/${id}`, data);
}

export async function deleteEmployee(id) {
  return apiClient.delete(`/admin/employees/${id}`);
}

export async function fetchBeneficiaries(query = {}) {
  const params = new URLSearchParams(query).toString();
  return apiClient.get(`/admin/beneficiaries${params ? '?' + params : ''}`);
}

export async function createBeneficiary(data) {
  return apiClient.post('/admin/beneficiaries', data);
}

export async function updateBeneficiary(id, data) {
  return apiClient.patch(`/admin/beneficiaries/${id}`, data);
}

export async function deleteBeneficiary(id) {
  return apiClient.delete(`/admin/beneficiaries/${id}`);
}

export async function fetchGifts(query = {}) {
  const params = new URLSearchParams(query).toString();
  return apiClient.get(`/admin/gifts${params ? '?' + params : ''}`);
}

// ── Gift Mappers ──────────────────────────────────────────

export function mapGiftFromApi(gift) {
  return {
    ...gift,
    imageUrls: gift.images?.map((img) => img.imageUrl) || [],
    stock: Number(gift.stock),
    minAge: Number(gift.minAge),
    maxAge: Number(gift.maxAge),
  };
}

export function mapGiftToApi(gift) {
  const payload = {};
  if (gift.campaignId !== undefined) payload.campaignId = Number(gift.campaignId);
  if (gift.name !== undefined) payload.name = gift.name;
  if (gift.reference !== undefined) payload.reference = gift.reference;
  if (gift.shortDescription !== undefined) payload.shortDescription = gift.shortDescription?.trim() || null;
  if (gift.technicalDescription !== undefined) payload.technicalDescription = gift.technicalDescription?.trim() || null;
  if (gift.dimensions !== undefined) payload.dimensions = gift.dimensions?.trim() || null;
  if (gift.stock !== undefined) payload.stock = Number(gift.stock);
  if (gift.minAge !== undefined) payload.minAge = Number(gift.minAge);
  if (gift.maxAge !== undefined) payload.maxAge = Number(gift.maxAge);
  if (gift.allowedGender !== undefined) payload.allowedGender = gift.allowedGender;
  if (gift.status !== undefined) payload.status = gift.status;
  if (gift.imageUrls !== undefined) payload.imageUrls = gift.imageUrls;
  return payload;
}

export async function getGiftById(id) {
  return apiClient.get(`/admin/gifts/${id}`);
}

export async function createGift(data) {
  return apiClient.post('/admin/gifts', data);
}

export async function updateGift(id, data) {
  return apiClient.patch(`/admin/gifts/${id}`, data);
}

export async function deleteGift(id) {
  return apiClient.delete(`/admin/gifts/${id}`);
}

export async function uploadGiftImage(giftId, file) {
  const formData = new FormData();
  formData.append('image', file);
  return apiClient.upload(`/admin/gifts/${giftId}/images`, formData);
}

export async function fetchSelections(query = {}) {
  const params = new URLSearchParams(query).toString();
  return apiClient.get(`/admin/selections${params ? '?' + params : ''}`);
}

export async function getSelectionById(id) {
  return apiClient.get(`/admin/selections/${id}`);
}

export async function fetchSupportRequests(query = {}) {
  const params = new URLSearchParams(query).toString();
  return apiClient.get(`/admin/support-requests${params ? '?' + params : ''}`);
}

export async function getSupportRequestById(id) {
  return apiClient.get(`/admin/support-requests/${id}`);
}

export async function updateSupportRequest(id, data) {
  return apiClient.patch(`/admin/support-requests/${id}`, data);
}

export async function fetchDashboardStats() {
  return apiClient.get('/admin/dashboard/stats');
}

export async function fetchExportData(query = {}) {
  const params = new URLSearchParams(query).toString();
  return apiClient.get(`/admin/reports/selections/export-data${params ? '?' + params : ''}`);
}

export async function downloadSelectionsExcel(query = {}) {
  return apiClient.downloadBlob('/admin/reports/selections/export-xlsx', query);
}

// ── Import ────────────────────────────────────────────────

export async function importEmployeesBeneficiaries(file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload('/admin/import/employees-beneficiaries', formData);
}

// ── Admin Users ────────────────────────────────────────────

export async function fetchAdminUsers() {
  return apiClient.get('/admin/users');
}

export async function createAdminUser(data) {
  return apiClient.post('/admin/users', data);
}

export async function updateAdminUser(id, data) {
  return apiClient.patch(`/admin/users/${id}`, data);
}

export async function changeAdminUserPassword(id, password) {
  return apiClient.patch(`/admin/users/${id}/password`, { password });
}

export async function updateAdminUserStatus(id, isActive) {
  return apiClient.patch(`/admin/users/${id}/status`, { isActive });
}

// ── Companies ─────────────────────────────────────────────

export async function fetchCompanies() {
  return apiClient.get('/admin/companies');
}

export async function createCompany(data) {
  return apiClient.post('/admin/companies', data);
}

// ── Public ──────────────────────────────────────────────────

export async function getPublicCampaignBySlug(slug) {
  return apiClient.get(`/public/campaigns/${slug}`);
}

// ── Public Employee Auth ──────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const PUBLIC_EMPLOYEE_TOKEN_KEY = 'giftapp_public_employee_token';

export function storePublicEmployeeToken(token) {
  if (token) {
    localStorage.setItem(PUBLIC_EMPLOYEE_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(PUBLIC_EMPLOYEE_TOKEN_KEY);
  }
}

export function getPublicEmployeeToken() {
  return localStorage.getItem(PUBLIC_EMPLOYEE_TOKEN_KEY);
}

export function clearPublicEmployeeSession() {
  localStorage.removeItem(PUBLIC_EMPLOYEE_TOKEN_KEY);
}

async function publicRequest(method, path, body = null) {
  const url = `${API_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  const token = getPublicEmployeeToken();
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
    clearPublicEmployeeSession();
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

export async function publicEmployeeLogin(slug, documentId) {
  return publicRequest('POST', `/public/campaigns/${slug}/employee-login`, { documentId });
}

export async function getPublicEmployeeMe() {
  const token = getPublicEmployeeToken();
  if (!token) return null;

  try {
    return await publicRequest('GET', '/public/employee-session/me');
  } catch {
    clearPublicEmployeeSession();
    return null;
  }
}

// ── Public Selection (Beneficiaries & Gifts) ──────────────

export async function getPublicBeneficiaries() {
  return publicRequest('GET', '/public/beneficiaries');
}

export async function getPublicCompatibleGifts(beneficiaryId) {
  return publicRequest('GET', `/public/beneficiaries/${beneficiaryId}/gifts`);
}

export function mapPublicGiftFromApi(gift) {
  return {
    ...gift,
    imageUrls: gift.images?.map((img) => img.imageUrl) || [],
    stock: Number(gift.stock),
    minAge: Number(gift.minAge),
    maxAge: Number(gift.maxAge),
  };
}

export async function confirmPublicSelection(items) {
  return publicRequest('POST', '/public/selections/confirm', { items });
}

export async function getMyConfirmedSelection() {
  return publicRequest('GET', '/public/selections/my-confirmed-selection');
}

// ── Public Support Requests ───────────────────────────────

export async function createPublicSupportRequest(data) {
  return publicRequest('POST', '/public/support-requests', data);
}
