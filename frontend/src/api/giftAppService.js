// ── GiftAppService ────────────────────────────────────────
// Proxy que decide entre backend real (NestJS) y localStorage demo.
// Controlado por VITE_USE_BACKEND en .env.

import { getCache, setCache, clearCache } from '../utils/simpleCache';

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

// ═══════════════════════════════════════════════════════════
// Admin Auth
// ═══════════════════════════════════════════════════════════

let _backendAuth = null;
let _localAuth = null;

function getBackendAuth() {
  if (!_backendAuth) {
    _backendAuth = import('./backendApiService');
  }
  return _backendAuth;
}

function getLocalAuth() {
  if (!_localAuth) {
    _localAuth = import('./localStorageService');
  }
  return _localAuth;
}

export async function giftAppAdminLogin(email, password) {
  if (USE_BACKEND) {
    const { adminLogin } = await getBackendAuth();
    const result = await adminLogin(email, password);
    return { ok: true, data: result };
  }

  // localStorage fallback
  const { getData, KEYS, setAdminSession } = await getLocalAuth();
  const admins = getData(KEYS.ADMIN_USERS);
  const admin = admins.find(
    (a) => a.email === email.trim() && a.password === password,
  );

  if (!admin) {
    return { ok: false, error: 'Correo o contraseña inválidos.' };
  }

  setAdminSession({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });

  return {
    ok: true,
    data: {
      user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
    },
  };
}

export async function giftAppGetAdminSession() {
  if (USE_BACKEND) {
    const { getAdminMe } = await getBackendAuth();
    const user = await getAdminMe();
    return user
      ? { name: user.name || user.email, role: user.role, id: user.id, email: user.email }
      : null;
  }

  const { getAdminSession } = await getLocalAuth();
  return getAdminSession();
}

export async function giftAppClearAdminSession() {
  if (USE_BACKEND) {
    const { clearAdminToken } = await getBackendAuth();
    clearAdminToken();
    return;
  }

  const { clearAdminSession } = await getLocalAuth();
  clearAdminSession();
}

// ═══════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════

export async function giftAppGetDashboardStats() {
  if (USE_BACKEND) {
    const { fetchDashboardStats } = await getBackendAuth();
    return await fetchDashboardStats();
  }

  const { getData, KEYS } = await getLocalAuth();
  const campaigns = getData(KEYS.CAMPAIGNS);
  const employees = getData(KEYS.EMPLOYEES);
  const beneficiaries = getData(KEYS.BENEFICIARIES);
  const gifts = getData(KEYS.GIFTS);
  const selections = getData(KEYS.SELECTIONS);
  const supportRequests = getData(KEYS.SUPPORT_REQUESTS);

  const totalStock = gifts.reduce((sum, g) => sum + (g.stock || 0), 0);

  return {
    campaigns: campaigns.length,
    companies: 0,
    employees: employees.length,
    beneficiaries: beneficiaries.length,
    gifts: gifts.length,
    selections: selections.length,
    stock: totalStock,
    supportRequests: supportRequests.length,
  };
}

// ═══════════════════════════════════════════════════════════
// Campaigns
// ═══════════════════════════════════════════════════════════

export async function giftAppGetCampaigns() {
  if (USE_BACKEND) {
    const { fetchCampaigns } = await getBackendAuth();
    return await fetchCampaigns();
  }

  const { getData, KEYS } = await getLocalAuth();
  return getData(KEYS.CAMPAIGNS);
}

export async function giftAppCreateCampaign(data) {
  if (USE_BACKEND) {
    const { createCampaign } = await getBackendAuth();
    const payload = {
      companyId: Number(data.companyId),
      name: data.name,
      welcomeText: data.welcomeText,
      rulesText: data.rulesText,
      status: data.status,
      logoText: data.logoText,
      primaryColor: data.primaryColor,
    };
    if (data.bannerImageUrl !== undefined) {
      payload.bannerImageUrl = data.bannerImageUrl;
    }
    if (data.bannerDecoration !== undefined) {
      payload.bannerDecoration = data.bannerDecoration;
    }
    return await createCampaign(payload);
  }

  const { getData, KEYS, setData, generateId } = await getLocalAuth();
  const campaigns = getData(KEYS.CAMPAIGNS);
  const newCampaign = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  campaigns.push(newCampaign);
  setData(KEYS.CAMPAIGNS, campaigns);
  return newCampaign;
}

export async function giftAppUpdateCampaign(id, data) {
  if (USE_BACKEND) {
    const { updateCampaign } = await getBackendAuth();
    const payload = {
      name: data.name,
      welcomeText: data.welcomeText,
      rulesText: data.rulesText,
      status: data.status,
      logoText: data.logoText,
      primaryColor: data.primaryColor,
    };
    if (data.bannerImageUrl !== undefined) {
      payload.bannerImageUrl = data.bannerImageUrl;
    }
    if (data.bannerDecoration !== undefined) {
      payload.bannerDecoration = data.bannerDecoration;
    }
    const result = await updateCampaign(id, payload);
    if (result?.slug) {
      clearCache(`campaign_${result.slug}`);
    }
    return result;
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const campaigns = getData(KEYS.CAMPAIGNS);
  const updated = campaigns.map((c) => (c.id === id ? { ...c, ...data } : c));
  setData(KEYS.CAMPAIGNS, updated);
  return updated.find((c) => c.id === id);
}

export async function giftAppDeleteCampaign(id) {
  if (USE_BACKEND) {
    const { deleteCampaign } = await getBackendAuth();
    const result = await deleteCampaign(id);
    if (result?.slug) {
      clearCache(`campaign_${result.slug}`);
    }
    return result;
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const employees = getData(KEYS.EMPLOYEES);
  const gifts = getData(KEYS.GIFTS);
  const selections = getData(KEYS.SELECTIONS);

  const hasEmployees = employees.some((e) => e.campaignId === id);
  const hasGifts = gifts.some((g) => g.campaignId === id);
  const hasSelections = selections.some((s) => s.campaignId === id);

  if (hasEmployees || hasGifts || hasSelections) {
    throw new Error('No se puede eliminar una campaña con datos asociados.');
  }

  const campaigns = getData(KEYS.CAMPAIGNS);
  const updated = campaigns.filter((c) => c.id !== id);
  setData(KEYS.CAMPAIGNS, updated);
}

export async function giftAppUploadCampaignLogo(campaignId, file) {
  if (USE_BACKEND) {
    const { uploadCampaignLogo } = await getBackendAuth();
    return await uploadCampaignLogo(campaignId, file);
  }
  throw new Error('La carga de logo solo está disponible en modo backend.');
}

export async function giftAppUploadCampaignBanner(campaignId, file) {
  if (USE_BACKEND) {
    const { uploadCampaignBanner } = await getBackendAuth();
    return await uploadCampaignBanner(campaignId, file);
  }
  throw new Error('La carga de banner solo está disponible en modo backend.');
}

// ═══════════════════════════════════════════════════════════
// Employees
// ═══════════════════════════════════════════════════════════

export async function giftAppGetEmployees(params = {}) {
  if (USE_BACKEND) {
    const { fetchEmployees } = await getBackendAuth();
    return await fetchEmployees(params);
  }

  const { getData, KEYS } = await getLocalAuth();
  return getData(KEYS.EMPLOYEES);
}

export async function giftAppCreateEmployee(data) {
  if (USE_BACKEND) {
    const { createEmployee } = await getBackendAuth();
    const payload = {
      campaignId: Number(data.campaignId),
      fullName: data.fullName,
      documentId: data.documentId,
      status: data.status,
    };
    if (data.email && data.email.trim()) {
      payload.email = data.email.trim();
    }
    if (data.phone !== undefined) {
      payload.phone = data.phone && data.phone.trim() ? data.phone.trim() : null;
    }
    if (data.shippingCity !== undefined) {
      payload.shippingCity = data.shippingCity && data.shippingCity.trim() ? data.shippingCity.trim() : null;
    }
    if (data.shippingAddress !== undefined) {
      payload.shippingAddress = data.shippingAddress && data.shippingAddress.trim() ? data.shippingAddress.trim() : null;
    }
    return await createEmployee(payload);
  }

  const { getData, KEYS, setData, generateId } = await getLocalAuth();
  const employees = getData(KEYS.EMPLOYEES);
  const newEmployee = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  employees.push(newEmployee);
  setData(KEYS.EMPLOYEES, employees);
  return newEmployee;
}

export async function giftAppUpdateEmployee(id, data) {
  if (USE_BACKEND) {
    const { updateEmployee } = await getBackendAuth();
    const payload = {};
    if (data.campaignId !== undefined) payload.campaignId = Number(data.campaignId);
    if (data.fullName !== undefined) payload.fullName = data.fullName;
    if (data.documentId !== undefined) payload.documentId = data.documentId;
    if (data.status !== undefined) payload.status = data.status;
    if (data.email !== undefined) {
      payload.email = data.email && data.email.trim() ? data.email.trim() : null;
    }
    if (data.phone !== undefined) {
      payload.phone = data.phone && data.phone.trim() ? data.phone.trim() : null;
    }
    if (data.shippingCity !== undefined) {
      payload.shippingCity = data.shippingCity && data.shippingCity.trim() ? data.shippingCity.trim() : null;
    }
    if (data.shippingAddress !== undefined) {
      payload.shippingAddress = data.shippingAddress && data.shippingAddress.trim() ? data.shippingAddress.trim() : null;
    }
    return await updateEmployee(id, payload);
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const employees = getData(KEYS.EMPLOYEES);
  const updated = employees.map((e) => (e.id === id ? { ...e, ...data } : e));
  setData(KEYS.EMPLOYEES, updated);
  return updated.find((e) => e.id === id);
}

export async function giftAppDeleteEmployee(id) {
  if (USE_BACKEND) {
    const { deleteEmployee } = await getBackendAuth();
    return await deleteEmployee(id);
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const beneficiaries = getData(KEYS.BENEFICIARIES);
  const selections = getData(KEYS.SELECTIONS);

  const hasBeneficiaries = beneficiaries.some((b) => b.employeeId === id);
  const hasSelections = selections.some((s) => s.employeeId === id);

  if (hasBeneficiaries || hasSelections) {
    throw new Error('No se puede eliminar un empleado con beneficiarios o selecciones asociadas.');
  }

  const employees = getData(KEYS.EMPLOYEES);
  const updated = employees.filter((e) => e.id !== id);
  setData(KEYS.EMPLOYEES, updated);
}

// ═══════════════════════════════════════════════════════════
// Import Employees & Beneficiaries
// ═══════════════════════════════════════════════════════════

export async function giftAppImportEmployeesBeneficiaries(file) {
  if (USE_BACKEND) {
    const { importEmployeesBeneficiaries } = await getBackendAuth();
    return await importEmployeesBeneficiaries(file);
  }
  throw new Error('La importación desde Excel solo está disponible en modo backend.');
}

// ═══════════════════════════════════════════════════════════
// Beneficiaries
// ═══════════════════════════════════════════════════════════

export async function giftAppGetBeneficiaries(params = {}) {
  if (USE_BACKEND) {
    const { fetchBeneficiaries } = await getBackendAuth();
    return await fetchBeneficiaries(params);
  }

  const { getData, KEYS } = await getLocalAuth();
  return getData(KEYS.BENEFICIARIES);
}

export async function giftAppCreateBeneficiary(data) {
  if (USE_BACKEND) {
    const { createBeneficiary } = await getBackendAuth();
    const payload = {
      employeeId: Number(data.employeeId),
      fullName: data.fullName,
      age: Number(data.age),
      gender: data.gender,
    };
    return await createBeneficiary(payload);
  }

  const { getData, KEYS, setData, generateId } = await getLocalAuth();
  const beneficiaries = getData(KEYS.BENEFICIARIES);
  const newBeneficiary = {
    ...data,
    id: generateId(),
    age: Number(data.age),
    createdAt: new Date().toISOString(),
  };
  beneficiaries.push(newBeneficiary);
  setData(KEYS.BENEFICIARIES, beneficiaries);
  return newBeneficiary;
}

export async function giftAppUpdateBeneficiary(id, data) {
  if (USE_BACKEND) {
    const { updateBeneficiary } = await getBackendAuth();
    const payload = {};
    if (data.employeeId !== undefined) payload.employeeId = Number(data.employeeId);
    if (data.fullName !== undefined) payload.fullName = data.fullName;
    if (data.age !== undefined) payload.age = Number(data.age);
    if (data.gender !== undefined) payload.gender = data.gender;
    return await updateBeneficiary(id, payload);
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const beneficiaries = getData(KEYS.BENEFICIARIES);
  const updated = beneficiaries.map((b) =>
    b.id === id ? { ...b, ...data, age: Number(data.age) } : b
  );
  setData(KEYS.BENEFICIARIES, updated);
  return updated.find((b) => b.id === id);
}

export async function giftAppDeleteBeneficiary(id) {
  if (USE_BACKEND) {
    const { deleteBeneficiary } = await getBackendAuth();
    return await deleteBeneficiary(id);
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const selections = getData(KEYS.SELECTIONS);
  const hasSelections = selections.some((s) => s.beneficiaryId === id);

  if (hasSelections) {
    throw new Error('No se puede eliminar un beneficiario con selección confirmada.');
  }

  const beneficiaries = getData(KEYS.BENEFICIARIES);
  const updated = beneficiaries.filter((b) => b.id !== id);
  setData(KEYS.BENEFICIARIES, updated);
}

// ═══════════════════════════════════════════════════════════
// Gifts
// ═══════════════════════════════════════════════════════════

export async function giftAppGetGifts(campaignId = null) {
  const cacheKey = campaignId ? `gifts_campaign_${campaignId}` : 'gifts_all';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let gifts;
  if (USE_BACKEND) {
    const { fetchGifts, mapGiftFromApi } = await getBackendAuth();
    const query = campaignId ? { campaignId } : {};
    const fetched = await fetchGifts(query);
    gifts = fetched.map(mapGiftFromApi);
  } else {
    const { getData, KEYS } = await getLocalAuth();
    const allGifts = getData(KEYS.GIFTS);
    gifts = campaignId ? allGifts.filter(g => g.campaignId === campaignId) : allGifts;
  }

  setCache(cacheKey, gifts, 30000); // 30s TTL
  return gifts;
}

export async function giftAppCreateGift(data) {
  if (USE_BACKEND) {
    const { createGift, mapGiftToApi, mapGiftFromApi } = await getBackendAuth();
    const payload = mapGiftToApi(data);
    const result = await createGift(payload);
    return mapGiftFromApi(result);
  }

  const { getData, KEYS, setData, generateId } = await getLocalAuth();
  const gifts = getData(KEYS.GIFTS);
  const newGift = { ...data, id: generateId(), createdAt: new Date().toISOString() };
  gifts.push(newGift);
  setData(KEYS.GIFTS, gifts);
  return newGift;
}

export async function giftAppUpdateGift(id, data) {
  if (USE_BACKEND) {
    const { updateGift, mapGiftToApi, mapGiftFromApi } = await getBackendAuth();
    const payload = mapGiftToApi(data);
    const result = await updateGift(id, payload);
    return mapGiftFromApi(result);
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const gifts = getData(KEYS.GIFTS);
  const updated = gifts.map((g) => (g.id === id ? { ...g, ...data } : g));
  setData(KEYS.GIFTS, updated);
  return updated.find((g) => g.id === id);
}

export async function giftAppUploadGiftImage(giftId, file) {
  if (USE_BACKEND) {
    const { uploadGiftImage } = await getBackendAuth();
    return await uploadGiftImage(giftId, file);
  }
  throw new Error('La carga de imágenes solo está disponible en modo backend.');
}

export async function giftAppDeleteGiftImage(giftId, imageId) {
  if (USE_BACKEND) {
    const { deleteGiftImage } = await getBackendAuth();
    const result = await deleteGiftImage(giftId, imageId);
    clearCache('gifts_all');
    return result;
  }
  throw new Error('La gestión de imágenes solo está disponible en modo backend.');
}

export async function giftAppDeleteAllGiftImages(giftId) {
  if (USE_BACKEND) {
    const { deleteAllGiftImages } = await getBackendAuth();
    const result = await deleteAllGiftImages(giftId);
    clearCache('gifts_all');
    return result;
  }
  throw new Error('La gestión de imágenes solo está disponible en modo backend.');
}

export async function giftAppSetPrimaryGiftImage(giftId, imageId) {
  if (USE_BACKEND) {
    const { setPrimaryGiftImage } = await getBackendAuth();
    const result = await setPrimaryGiftImage(giftId, imageId);
    clearCache('gifts_all');
    return result;
  }
  throw new Error('La gestión de imágenes solo está disponible en modo backend.');
}

export async function giftAppReplaceGiftImage(giftId, imageId, file) {
  if (USE_BACKEND) {
    const { replaceGiftImage } = await getBackendAuth();
    const result = await replaceGiftImage(giftId, imageId, file);
    clearCache('gifts_all');
    return result;
  }
  throw new Error('La gestión de imágenes solo está disponible en modo backend.');
}

export async function giftAppDeleteGift(id) {
  if (USE_BACKEND) {
    const { deleteGift } = await getBackendAuth();
    const result = await deleteGift(id);
    clearCache('gifts_all');
    return result;
  }

  const { getData, KEYS, setData } = await getLocalAuth();
  const selections = getData(KEYS.SELECTIONS);
  const hasSelections = selections.some((s) => s.giftId === id);

  if (hasSelections) {
    const gifts = getData(KEYS.GIFTS);
    const updated = gifts.map((g) => (g.id === id ? { ...g, status: 'INACTIVE' } : g));
    setData(KEYS.GIFTS, updated);
    return { softDeleted: true };
  }

  const gifts = getData(KEYS.GIFTS);
  const updated = gifts.filter((g) => g.id !== id);
  setData(KEYS.GIFTS, updated);
  return { softDeleted: false };
}

// ═══════════════════════════════════════════════════════════
// Support Requests
// ═══════════════════════════════════════════════════════════

export async function giftAppGetSupportRequests() {
  if (USE_BACKEND) {
    const { fetchSupportRequests } = await getBackendAuth();
    return await fetchSupportRequests();
  }

  const { getData, KEYS } = await getLocalAuth();
  return getData(KEYS.SUPPORT_REQUESTS);
}

export async function giftAppUpdateSupportRequest(id, data) {
  if (USE_BACKEND) {
    const { updateSupportRequest } = await getBackendAuth();
    return await updateSupportRequest(id, data);
  }

  const { updateSupportRequestStatus, getData, KEYS } = await getLocalAuth();
  updateSupportRequestStatus(id, data.status, data.internalNote);
  return getData(KEYS.SUPPORT_REQUESTS).find((r) => r.id === id);
}

// ═══════════════════════════════════════════════════════════
// Selections
// ═══════════════════════════════════════════════════════════

export async function giftAppGetSelections(params = {}) {
  if (USE_BACKEND) {
    const { fetchSelections } = await getBackendAuth();
    const result = await fetchSelections(params);
    // Paginated response
    if (result && result.data) {
      return result;
    }
    // Backward-compatible flat array
    return (result || []).flatMap((s) =>
      (s.items || []).map((item) => ({
        id: `${s.id}-${item.beneficiaryId}`,
        selectionId: s.id,
        campaignId: s.campaignId,
        employeeId: s.employeeId,
        campaignName: s.campaignNameSnapshot || s.campaign?.name || '',
        employeeName: s.employeeNameSnapshot || s.employee?.fullName || '',
        employeeDocumentId: s.employeeDocumentIdSnapshot || s.employee?.documentId || '',
        beneficiaryId: item.beneficiaryId,
        beneficiaryName: item.beneficiaryNameSnapshot || item.beneficiary?.fullName || '',
        beneficiaryAge: item.beneficiaryAgeSnapshot,
        beneficiaryGender: item.beneficiaryGenderSnapshot,
        giftId: item.giftId,
        giftName: item.giftNameSnapshot || item.gift?.name || '',
        giftReference: item.giftReferenceSnapshot || item.gift?.reference || '',
        giftImageUrl: item.giftImageUrlSnapshot || '',
        confirmedAt: item.confirmedAt || s.confirmedAt,
        status: s.status,
      }))
    );
  }

  const { getData, KEYS } = await getLocalAuth();
  return getData(KEYS.SELECTIONS);
}

export async function giftAppGetSelectionById(id) {
  if (USE_BACKEND) {
    const { getSelectionById } = await getBackendAuth();
    return await getSelectionById(id);
  }

  const { getData, KEYS } = await getLocalAuth();
  return getData(KEYS.SELECTIONS).find((s) => s.id === id) || null;
}

export async function giftAppGetSelectionExportData(params = {}) {
  if (USE_BACKEND) {
    const { fetchExportData } = await getBackendAuth();
    return await fetchExportData(params);
  }

  return null;
}

export async function giftAppDownloadSelectionsExcel(params = {}) {
  if (USE_BACKEND) {
    const { downloadSelectionsExcel } = await getBackendAuth();
    return await downloadSelectionsExcel(params);
  }

  throw new Error('La exportación Excel solo está disponible en modo backend.');
}

export async function giftAppDownloadEmployeesExcel(params = {}) {
  if (USE_BACKEND) {
    const { downloadEmployeesExcel } = await getBackendAuth();
    return await downloadEmployeesExcel(params);
  }

  throw new Error('La exportación Excel solo está disponible en modo backend.');
}

// ═══════════════════════════════════════════════════════════
// Public
// ═══════════════════════════════════════════════════════════

export async function giftAppGetPublicCampaignBySlug(slug) {
  const cacheKey = `campaign_${slug}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let campaign;
  if (USE_BACKEND) {
    const { getPublicCampaignBySlug } = await getBackendAuth();
    campaign = await getPublicCampaignBySlug(slug);
  } else {
    const { findCampaignBySlug } = await getLocalAuth();
    campaign = findCampaignBySlug(slug);
  }

  setCache(cacheKey, campaign, 60000); // 60s TTL
  return campaign;
}

// ═══════════════════════════════════════════════════════════
// Public Employee Auth
// ═══════════════════════════════════════════════════════════

export async function giftAppPublicEmployeeLogin(slug, documentId) {
  if (USE_BACKEND) {
    const { publicEmployeeLogin, storePublicEmployeeToken } = await getBackendAuth();
    const result = await publicEmployeeLogin(slug, documentId);
    if (result.accessToken) {
      storePublicEmployeeToken(result.accessToken);
    }
    return result;
  }

  const { findCampaignBySlug, findEmployeeByDocumentAndCampaign, getBeneficiariesByEmployee } = await getLocalAuth();
  const campaign = findCampaignBySlug(slug);
  if (!campaign) throw new Error('Campaña no encontrada.');
  if (campaign.status !== 'ACTIVE') throw new Error('Esta campaña no está disponible actualmente.');

  const employee = findEmployeeByDocumentAndCampaign(documentId.trim(), campaign.id);
  if (!employee) throw new Error('Empleado no encontrado en esta campaña.');
  if (employee.status === 'BLOCKED') throw new Error('Tu cuenta ha sido bloqueada. Contacta a soporte.');

  if (employee.status === 'CONFIRMED') {
    return {
      alreadyConfirmed: true,
      employee: { id: employee.id, fullName: employee.fullName, documentId: employee.documentId, status: employee.status },
      campaign: { id: campaign.id, name: campaign.name, slug: campaign.slug, logoText: campaign.logoText, primaryColor: campaign.primaryColor },
    };
  }

  const beneficiaries = getBeneficiariesByEmployee(employee.id);
  if (beneficiaries.length === 0) throw new Error('No se encontraron beneficiarios para tu cuenta.');

  return {
    employee: { id: employee.id, fullName: employee.fullName, documentId: employee.documentId, status: employee.status },
    campaign: { id: campaign.id, name: campaign.name, slug: campaign.slug, logoText: campaign.logoText, primaryColor: campaign.primaryColor },
  };
}

// ── Email OTP flow (backend only) ─────────────────────────
// These functions are only used when the campaign response includes
// otpEnabled === true. They call the new /public/auth/* endpoints.

export async function giftAppPublicRequestOtpCode(slug, documentId) {
  const { publicRequestOtpCode } = await getBackendAuth();
  return await publicRequestOtpCode(slug, documentId);
}

export async function giftAppPublicVerifyOtpCode(slug, documentId, code) {
  const { publicVerifyOtpCode, storePublicEmployeeToken } = await getBackendAuth();
  const result = await publicVerifyOtpCode(slug, documentId, code);
  if (result.accessToken) {
    storePublicEmployeeToken(result.accessToken);
  }
  return result;
}

export async function giftAppGetPublicEmployeeSession() {
  if (USE_BACKEND) {
    const { getPublicEmployeeMe } = await getBackendAuth();
    return await getPublicEmployeeMe();
  }

  return null;
}

export async function giftAppClearPublicEmployeeSession() {
  if (USE_BACKEND) {
    const { clearPublicEmployeeSession } = await getBackendAuth();
    clearPublicEmployeeSession();
    return;
  }
}

// ═══════════════════════════════════════════════════════════
// Public Selection (Beneficiaries & Gifts)
// ═══════════════════════════════════════════════════════════

export async function giftAppGetPublicBeneficiaries() {
  if (USE_BACKEND) {
    const { getPublicBeneficiaries } = await getBackendAuth();
    const result = await getPublicBeneficiaries();
    return result.beneficiaries || [];
  }

  return null;
}

export async function giftAppGetPublicCompatibleGifts(beneficiaryId) {
  if (USE_BACKEND) {
    const { getPublicCompatibleGifts, mapPublicGiftFromApi } = await getBackendAuth();
    const result = await getPublicCompatibleGifts(beneficiaryId);
    return {
      beneficiary: result.beneficiary,
      gifts: (result.gifts || []).map(mapPublicGiftFromApi),
    };
  }

  return null;
}

export async function giftAppConfirmPublicSelection(slug, items, campaignId, employeeId) {
  if (USE_BACKEND) {
    const { confirmPublicSelection } = await getBackendAuth();
    return await confirmPublicSelection(items);
  }

  const { confirmSelection } = await getLocalAuth();
  const result = confirmSelection(campaignId, employeeId, items);
  if (!result.ok) {
    throw new Error(result.error || 'Error al confirmar la selección.');
  }
  return result;
}

export async function giftAppGetMyConfirmedSelection() {
  if (USE_BACKEND) {
    const { getMyConfirmedSelection } = await getBackendAuth();
    return await getMyConfirmedSelection();
  }

  return null;
}

export async function giftAppCreatePublicSupportRequest(data) {
  if (USE_BACKEND) {
    const { createPublicSupportRequest } = await getBackendAuth();
    return await createPublicSupportRequest(data);
  }

  const { createSupportRequest } = await getLocalAuth();
  return createSupportRequest(data);
}

// ═══════════════════════════════════════════════════════════
// Admin Users
// ═══════════════════════════════════════════════════════════

export async function giftAppGetAdminUsers() {
  if (USE_BACKEND) {
    const { fetchAdminUsers } = await getBackendAuth();
    return await fetchAdminUsers();
  }
  return [];
}

export async function giftAppCreateAdminUser(data) {
  if (USE_BACKEND) {
    const { createAdminUser } = await getBackendAuth();
    return await createAdminUser(data);
  }
  throw new Error('La gestión de usuarios solo está disponible en modo backend.');
}

export async function giftAppUpdateAdminUser(id, data) {
  if (USE_BACKEND) {
    const { updateAdminUser } = await getBackendAuth();
    return await updateAdminUser(id, data);
  }
  throw new Error('La gestión de usuarios solo está disponible en modo backend.');
}

export async function giftAppChangeAdminUserPassword(id, password) {
  if (USE_BACKEND) {
    const { changeAdminUserPassword } = await getBackendAuth();
    return await changeAdminUserPassword(id, password);
  }
  throw new Error('La gestión de usuarios solo está disponible en modo backend.');
}

export async function giftAppUpdateAdminUserStatus(id, isActive) {
  if (USE_BACKEND) {
    const { updateAdminUserStatus } = await getBackendAuth();
    return await updateAdminUserStatus(id, isActive);
  }
  throw new Error('La gestión de usuarios solo está disponible en modo backend.');
}

export async function giftAppDeleteAdminUser(id) {
  if (USE_BACKEND) {
    const { deleteAdminUser } = await getBackendAuth();
    return await deleteAdminUser(id);
  }
  throw new Error('La gestión de usuarios solo está disponible en modo backend.');
}

// ═══════════════════════════════════════════════════════════
// Companies
// ═══════════════════════════════════════════════════════════

export async function giftAppGetCompanies() {
  const cacheKey = 'companies';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let companies;
  if (USE_BACKEND) {
    const { fetchCompanies } = await getBackendAuth();
    companies = await fetchCompanies();
  } else {
    companies = [];
  }

  setCache(cacheKey, companies, 60000); // 60s TTL
  return companies;
}

export async function giftAppCreateCompany(data) {
  if (USE_BACKEND) {
    const { createCompany } = await getBackendAuth();
    const result = await createCompany(data);
    clearCache('companies');
    return result;
  }
  throw new Error('La gestión de empresas solo está disponible en modo backend.');
}

// ═══════════════════════════════════════════════════════════
// Future modules — placeholders que delegan a localStorage
// ═══════════════════════════════════════════════════════════

// TODO: Migrar cada función a backend cuando VITE_USE_BACKEND=true.
// Por ahora, giftAppService re-exporta localStorageService para
// mantener compatibilidad con módulos aún no migrados.

export { USE_BACKEND };
