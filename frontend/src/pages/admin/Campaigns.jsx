import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { validateRequired } from '../../utils/validators';
import { formatDate } from '../../utils/dates';
import {
  giftAppGetCampaigns,
  giftAppCreateCampaign,
  giftAppUpdateCampaign,
  giftAppDeleteCampaign,
  giftAppUploadCampaignLogo,
  giftAppGetCompanies,
  giftAppCreateCompany,
  USE_BACKEND,
} from '../../api/giftAppService';
import Modal from '../../components/Modal';
import Toast, { useToast } from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

// TODO: Move referential integrity checks to server-side before production.

const EMPTY_CAMPAIGN = {
  companyId: '',
  name: '',
  welcomeText: '',
  rulesText: '',
  status: 'ACTIVE',
  logoText: '',
  primaryColor: '#2563eb',
  logoImageUrl: '',
};

const EMPTY_COMPANY = {
  name: '',
};

export default function Campaigns() {
  const { isReadOnly } = useOutletContext() || {};
  const [campaigns, setCampaigns] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CAMPAIGN);
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY);
  const [errors, setErrors] = useState({});
  const [companyErrors, setCompanyErrors] = useState({});
  const { toasts, addToast, removeToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(USE_BACKEND);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [logoFile, setLogoFile] = useState(null);

  const loadCampaigns = async () => {
    if (USE_BACKEND) setLoading(true);
    try {
      const [campaignsData, companiesData] = await Promise.all([
        giftAppGetCampaigns(),
        USE_BACKEND ? giftAppGetCompanies() : Promise.resolve([]),
      ]);
      setCampaigns(campaignsData);
      setCompanies(companiesData);
    } catch (err) {
      if (USE_BACKEND) addToast(err.message || 'Error al cargar las campañas.', 'error');
    } finally {
      if (USE_BACKEND) setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const filtered = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase());
    const matchesCompany =
      !filterCompany || String(c.companyId) === filterCompany;
    return matchesSearch && matchesCompany;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_CAMPAIGN, companyId: companies[0]?.id || '' });
    setErrors({});
    setLogoFile(null);
    setShowModal(true);
  };

  const openEdit = (campaign) => {
    setEditing(campaign);
    setForm({
      companyId: campaign.companyId || '',
      name: campaign.name,
      welcomeText: campaign.welcomeText || '',
      rulesText: campaign.rulesText || '',
      status: campaign.status,
      logoText: campaign.logoText || '',
      primaryColor: campaign.primaryColor || '#2563eb',
      logoImageUrl: campaign.logoImageUrl || '',
    });
    setErrors({});
    setLogoFile(null);
    setShowModal(true);
  };

  const openCreateCompany = () => {
    setCompanyForm(EMPTY_COMPANY);
    setCompanyErrors({});
    setShowCompanyModal(true);
  };

  const handleCreateCompany = async () => {
    const errs = {};
    if (!companyForm.name || companyForm.name.trim().length < 2) {
      errs.name = 'El nombre debe tener al menos 2 caracteres.';
    }
    setCompanyErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const company = await giftAppCreateCompany({ name: companyForm.name });
      await loadCampaigns();
      setForm((prev) => ({ ...prev, companyId: company.id }));
      setShowCompanyModal(false);
      addToast('Empresa creada.');
    } catch (err) {
      addToast(err.message || 'Error al crear la empresa.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const validate = () => {
    const errs = {};
    const nameErr = validateRequired(form.name, 'Nombre de la campaña');
    if (nameErr) errs.name = nameErr;
    if (!form.companyId) errs.companyId = 'La empresa es obligatoria.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      let result;
      if (editing) {
        result = await giftAppUpdateCampaign(editing.id, form);
      } else {
        result = await giftAppCreateCampaign(form);
        // Switch to edit mode immediately so a logo-upload failure doesn't
        // allow re-submitting and creating a duplicate campaign.
        setEditing(result);
      }

      const campaignId = result?.id || editing?.id;
      if (USE_BACKEND && logoFile && campaignId) {
        await giftAppUploadCampaignLogo(campaignId, logoFile);
      }

      await loadCampaigns();
      setShowModal(false);
      setLogoFile(null);
      addToast(editing ? 'Campaña actualizada.' : 'Campaña creada.');
    } catch (err) {
      addToast(err.message || 'Error al guardar la campaña.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await giftAppDeleteCampaign(deleteTarget.id);
      await loadCampaigns();
      setDeleteTarget(null);
      addToast('Campaña eliminada.');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  if (USE_BACKEND && loading) {
    return (
      <div>
        <div className="admin-topbar"><h1>Campañas</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando campañas...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>Campañas</h1>
        {!isReadOnly && (
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            + Nueva Campaña
          </button>
        )}
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar campañas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
          >
            <option value="">Todas las empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Sin campañas" message="Crea tu primera campaña." />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Empresa</th>
                  <th>Slug</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td>{c.company?.name || <span style={{ color: 'var(--gray-400)' }}>Sin empresa</span>}</td>
                    <td>
                      <a
                        href={`${window.location.origin}/campaign/${c.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8125rem' }}
                        title={`${window.location.origin}/campaign/${c.slug}`}
                      >
                        {window.location.origin}/campaign/{c.slug}
                      </a>
                    </td>
                    <td>
                      <span className={`badge badge-${c.status.toLowerCase()}`}>
                        {c.status === 'ACTIVE' ? 'Activo' : 'Cerrado'}
                      </span>
                    </td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>
                      {!isReadOnly && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEdit(c)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeleteTarget(c)}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Campaña' : 'Nueva Campaña'}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Empresa</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={form.companyId}
              onChange={(e) => updateField('companyId', e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">Seleccionar empresa</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!isReadOnly && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={openCreateCompany}
                style={{ whiteSpace: 'nowrap' }}
              >
                + Empresa
              </button>
            )}
          </div>
          {errors.companyId && <p className="form-error">{errors.companyId}</p>}
        </div>
        <div className="form-group">
          <label>Nombre de la Campaña</label>
          <input
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        {!editing && form.companyId && form.name && companies.find((c) => String(c.id) === String(form.companyId)) && (
          (() => {
            const company = companies.find((c) => String(c.id) === String(form.companyId));
            const campaignSlugPart = form.name
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
            const previewSlug = company && campaignSlugPart.startsWith(`${company.slug}-`)
              ? campaignSlugPart
              : (company ? `${company.slug}-${campaignSlugPart}` : campaignSlugPart);
            return (
              <div className="form-group">
                <label style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                  URL pública generada
                </label>
                <p style={{ fontSize: '0.875rem', color: 'var(--gray-700)', margin: '4px 0 0 0' }}>
                  <code>/campaign/{previewSlug}</code>
                </p>
              </div>
            );
          })()
        )}
        {editing && (
          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
              URL pública
            </label>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-700)', margin: '4px 0 0 0' }}>
              <code>/campaign/{editing.slug}</code>
            </p>
          </div>
        )}
        <div className="form-group">
          <label>Texto de Bienvenida</label>
          <textarea
            value={form.welcomeText}
            onChange={(e) => updateField('welcomeText', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Texto de Reglas</label>
          <textarea
            value={form.rulesText}
            onChange={(e) => updateField('rulesText', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Estado</label>
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="ACTIVE">Activo</option>
            <option value="CLOSED">Cerrado</option>
          </select>
        </div>
        <div className="form-group">
          <label>Texto del Logo</label>
          <input
            value={form.logoText}
            onChange={(e) => updateField('logoText', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Color Principal</label>
          <input
            type="color"
            value={form.primaryColor}
            onChange={(e) => updateField('primaryColor', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Logo de la Empresa</label>
          {form.logoImageUrl && !logoFile && (
            <div style={{ marginBottom: 8 }}>
              <img
                src={form.logoImageUrl}
                alt="Logo actual"
                style={{ maxWidth: 160, maxHeight: 80, borderRadius: 6, border: '1px solid var(--gray-200)' }}
              />
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
                  addToast('Solo se permiten imágenes PNG, JPEG, JPG o WebP.', 'error');
                  e.target.value = '';
                  return;
                }
                if (file.size > 2 * 1024 * 1024) {
                  addToast('El logo no puede superar los 2MB.', 'error');
                  e.target.value = '';
                  return;
                }
                setLogoFile(file);
              }
            }}
          />
          {logoFile && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: 4 }}>
              {logoFile.name} ({(logoFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showCompanyModal}
        onClose={() => setShowCompanyModal(false)}
        title="Crear Empresa"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowCompanyModal(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleCreateCompany} disabled={saving}>
              {saving ? 'Creando...' : 'Crear'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Nombre de la Empresa</label>
          <input
            value={companyForm.name}
            onChange={(e) => setCompanyForm({ name: e.target.value })}
            placeholder="ej. Coca-Cola"
          />
          {companyErrors.name && <p className="form-error">{companyErrors.name}</p>}
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: 8 }}>
          El slug se generará automáticamente del nombre.
        </p>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar Campaña"
        message={`¿Estás seguro de que deseas eliminar "${deleteTarget?.name}"?`}
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
