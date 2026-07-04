import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { validateRequired, validateNumeric } from '../../utils/validators';
import { formatDate } from '../../utils/dates';
import {
  giftAppGetEmployees,
  giftAppCreateEmployee,
  giftAppUpdateEmployee,
  giftAppDeleteEmployee,
  giftAppGetCampaigns,
  giftAppImportEmployeesBeneficiaries,
  USE_BACKEND,
} from '../../api/giftAppService';
import Modal from '../../components/Modal';
import Toast, { useToast } from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

const EMPTY_EMPLOYEE = {
  campaignId: '',
  fullName: '',
  documentId: '',
  email: '',
  phone: '',
  shippingCity: '',
  shippingAddress: '',
  status: 'PENDING',
};

const PAGE_SIZES = [25, 50, 100];

export default function Employees() {
  const { isReadOnly } = useOutletContext() || {};
  const [employees, setEmployees] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [filterCampaign, setFilterCampaign] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_EMPLOYEE);
  const [errors, setErrors] = useState({});
  const { toasts, addToast, removeToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(USE_BACKEND);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  const loadData = useCallback(async (opts = {}) => {
    if (USE_BACKEND) setLoading(true);
    try {
      const p = opts.page ?? page;
      const ps = opts.pageSize ?? pageSize;
      const s = opts.search !== undefined ? opts.search : search;
      const fc = opts.campaignId !== undefined ? opts.campaignId : filterCampaign;
      const fs = opts.status !== undefined ? opts.status : filterStatus;

      const query = { page: p, pageSize: ps };
      if (s) query.search = s;
      if (fc) query.campaignId = fc;
      if (fs) query.status = fs;

      const [response, campaignsData] = await Promise.all([
        giftAppGetEmployees(query),
        giftAppGetCampaigns(),
      ]);

      setEmployees(response.data);
      setPage(response.meta.page);
      setPageSize(response.meta.pageSize);
      setTotal(response.meta.total);
      setTotalPages(response.meta.totalPages);
      setCampaigns(campaignsData);
    } catch (err) {
      if (USE_BACKEND) addToast(err.message || 'Error al cargar datos.', 'error');
    } finally {
      if (USE_BACKEND) setLoading(false);
    }
  }, [page, pageSize, search, filterCampaign, filterStatus, addToast]);

  const handleSearchChange = (value) => {
    setSearchInput(value);
    setPage(1);
  };

  const handleFilterCampaignChange = (value) => {
    setFilterCampaign(value);
    setPage(1);
  };

  const handleFilterStatusChange = (value) => {
    setFilterStatus(value);
    setPage(1);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setLoadRevision(v => v + 1);
    }, 900);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!USE_BACKEND) return;
    loadData({ page, pageSize, search, campaignId: filterCampaign, status: filterStatus });
  }, [page, pageSize, search, filterCampaign, filterStatus, loadRevision]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_EMPLOYEE, campaignId: campaigns[0]?.id || '' });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ ...emp });
    setErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errs = {};
    const nameErr = validateRequired(form.fullName, 'Nombre');
    if (nameErr) errs.fullName = nameErr;
    const idErr = validateRequired(form.documentId, 'ID');
    if (idErr) errs.documentId = idErr;
    else {
      const numErr = validateNumeric(form.documentId, 'ID');
      if (numErr) errs.documentId = numErr;
    }
    if (!form.campaignId) errs.campaignId = 'La campaña es obligatoria.';

    if (!editing) {
      const existing = employees.find(
        (e) => e.documentId === form.documentId && String(e.campaignId) === String(form.campaignId)
      );
      if (existing) errs.documentId = 'El ID del empleado debe ser único dentro de la campaña.';
    } else {
      const existing = employees.find(
        (e) =>
          e.documentId === form.documentId &&
          String(e.campaignId) === String(form.campaignId) &&
          e.id !== editing.id
      );
      if (existing) errs.documentId = 'El ID del empleado debe ser único dentro de la campaña.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      if (editing) {
        await giftAppUpdateEmployee(editing.id, form);
      } else {
        await giftAppCreateEmployee(form);
      }
      await loadData({ page: editing ? page : 1, pageSize });
      setShowModal(false);
      addToast(editing ? 'Empleado actualizado.' : 'Empleado creado.');
    } catch (err) {
      addToast(err.message || 'Error al guardar el empleado.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await giftAppDeleteEmployee(deleteTarget.id);
      await loadData({ page, pageSize });
      setDeleteTarget(null);
      addToast('Empleado eliminado.');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const getCampaignName = (id) => {
    return campaigns.find((c) => String(c.id) === String(id))?.name || id;
  };

  const openImportModal = () => {
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
  };

  const handleImportFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && !file.name.endsWith('.xlsx')) {
      addToast('Solo se permiten archivos .xlsx.', 'error');
      e.target.value = '';
      return;
    }
    setImportFile(file || null);
    setImportResult(null);
    setImportError(null);
  };

  const handleImport = async () => {
    if (!importFile || importing) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await giftAppImportEmployeesBeneficiaries(importFile);
      setImportResult(result);
      try {
        await loadData({ page: 1, pageSize });
      } catch {
        setImportError('La importación finalizó, pero no se pudo actualizar la lista de empleados. Recarga la página.');
      }
    } catch (err) {
      setImportError(err.message || 'Error en la importación.');
    } finally {
      setImporting(false);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  if (USE_BACKEND && loading) {
    return (
      <div>
        <div className="admin-topbar"><h1>Empleados</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando empleados...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>Empleados</h1>
        {!isReadOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            {USE_BACKEND ? (
              <button className="btn btn-outline btn-sm" onClick={openImportModal}>
                Importar Excel
              </button>
            ) : (
              <button
                className="btn btn-outline btn-sm"
                disabled
                title="La importación desde Excel solo está disponible en modo backend."
                style={{ cursor: 'not-allowed', opacity: 0.6 }}
              >
                Importar Excel
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              + Nuevo Empleado
            </button>
          </div>
        )}
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por nombre, ID, correo, teléfono, ciudad o dirección..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select
            value={filterCampaign}
            onChange={(e) => handleFilterCampaignChange(e.target.value)}
          >
            <option value="">Todas las Campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => handleFilterStatusChange(e.target.value)}
          >
            <option value="">Todos los Estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="IN_PROGRESS">En Progreso</option>
            <option value="CONFIRMED">Confirmado</option>
            <option value="BLOCKED">Bloqueado</option>
          </select>
        </div>

        {employees.length === 0 && !loading ? (
          <EmptyState title="Sin empleados" message="Agrega tu primer empleado." />
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>ID</th>
                    <th>Correo</th>
                    <th>Teléfono</th>
                    <th>Ciudad</th>
                    <th>Campaña</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>{e.fullName}</td>
                      <td>{e.documentId}</td>
                      <td>{e.email}</td>
                      <td>{e.phone || ''}</td>
                      <td>{e.shippingCity || ''}</td>
                      <td>{getCampaignName(e.campaignId)}</td>
                      <td>
                        <span className={`badge badge-${e.status.toLowerCase().replace('_', '-')}`}>
                          {e.status === 'PENDING' ? 'Pendiente' : e.status === 'IN_PROGRESS' ? 'En Progreso' : e.status === 'CONFIRMED' ? 'Confirmado' : 'Bloqueado'}
                        </span>
                      </td>
                      <td>{formatDate(e.createdAt)}</td>
                      <td>
                        {!isReadOnly && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openEdit(e)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeleteTarget(e)}
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
            <div className="pagination-bar">
              <div className="pagination-info">
                {total > 0 && (
                  <span>{(page - 1) * pageSize + 1}&ndash;{Math.min(page * pageSize, total)} de {total}</span>
                )}
              </div>
              <div className="pagination-controls">
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="pagination-page-size"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>{s} por página</option>
                  ))}
                </select>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span className="pagination-current">
                  Página {page} de {totalPages}
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Empleado' : 'Nuevo Empleado'}
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
          <label>Campaña</label>
          <select
            value={form.campaignId}
            onChange={(e) => updateField('campaignId', e.target.value)}
          >
            <option value="">Seleccionar campaña</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.campaignId && <p className="form-error">{errors.campaignId}</p>}
        </div>
        <div className="form-group">
          <label>Nombre Completo</label>
          <input
            value={form.fullName}
            onChange={(e) => updateField('fullName', e.target.value)}
          />
          {errors.fullName && <p className="form-error">{errors.fullName}</p>}
        </div>
        <div className="form-group">
          <label>Número de Identificación</label>
          <input
            value={form.documentId}
            onChange={(e) => updateField('documentId', e.target.value)}
            placeholder="ej. 1001"
          />
          {errors.documentId && <p className="form-error">{errors.documentId}</p>}
        </div>
        <div className="form-group">
          <label>Correo</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Teléfono</label>
          <input
            type="text"
            value={form.phone || ''}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="Ej. 3001234567"
          />
        </div>
        <div className="form-group">
          <label>Ciudad</label>
          <input
            type="text"
            value={form.shippingCity || ''}
            onChange={(e) => updateField('shippingCity', e.target.value)}
            placeholder="Ej. Bogotá"
          />
        </div>
        <div className="form-group">
          <label>Dirección de Envío</label>
          <input
            type="text"
            value={form.shippingAddress || ''}
            onChange={(e) => updateField('shippingAddress', e.target.value)}
            placeholder="Ej. Calle 10 # 20-30"
          />
        </div>
        <div className="form-group">
          <label>Estado</label>
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="PENDING">Pendiente</option>
            <option value="IN_PROGRESS">En Progreso</option>
            <option value="CONFIRMED" disabled={form.status !== 'CONFIRMED'}>
              Confirmado
            </option>
            <option value="BLOCKED">Bloqueado</option>
          </select>
        </div>
      </Modal>

      <Modal
        isOpen={showImportModal}
        onClose={closeImportModal}
        title="Importar Empleados y Beneficiarios"
        footer={
          importResult || importError ? (
            <button className="btn btn-primary" onClick={closeImportModal}>
              Cerrar
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={closeImportModal} disabled={importing}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={!importFile || importing}
              >
                {importing ? 'Importando...' : 'Cargar Archivo'}
              </button>
            </>
          )
        }
      >
        {importing ? (
          <div>
            <p style={{ textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
              Importando empleados y beneficiarios. Esto puede tardar unos segundos...
            </p>
          </div>
        ) : importError ? (
          <div>
            <p style={{ marginBottom: 12, fontWeight: 500, color: 'var(--danger, #dc2626)' }}>
              Error en la importación
            </p>
            <p style={{ color: 'var(--danger, #dc2626)', fontSize: '0.875rem', marginBottom: 12 }}>
              {importError}
            </p>
            {importFile && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--gray-500)' }}>
                Archivo: {importFile.name}
              </p>
            )}
          </div>
        ) : importResult ? (
          <div>
            {importResult.errors && importResult.errors.length > 0 ? (
              <p style={{ marginBottom: 12, fontWeight: 500, color: '#d97706' }}>
                Importación completada con observaciones
              </p>
            ) : (
              <p style={{ marginBottom: 12, fontWeight: 500, color: 'var(--success, #16a34a)' }}>
                Importación completada exitosamente
              </p>
            )}
            {importError && (
              <p style={{ color: 'var(--danger, #dc2626)', fontSize: '0.875rem', marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 4 }}>
                {importError}
              </p>
            )}
            <table style={{ width: '100%', fontSize: '0.875rem' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 8px', color: 'var(--gray-500)' }}>Total de filas procesadas</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{importResult.totalRows}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', color: 'var(--gray-500)' }}>Empleados creados</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--success, #16a34a)' }}>{importResult.employeesCreated}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', color: 'var(--gray-500)' }}>Empleados actualizados</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: '#2563eb' }}>{importResult.employeesUpdated}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', color: 'var(--gray-500)' }}>Beneficiarios creados</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--success, #16a34a)' }}>{importResult.beneficiariesCreated}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 8px', color: 'var(--gray-500)' }}>Filas omitidas</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{importResult.skippedRows}</td>
                </tr>
                {importResult.errors && importResult.errors.length > 0 && (
                  <tr>
                    <td style={{ padding: '4px 8px', color: 'var(--danger, #dc2626)', verticalAlign: 'top' }}>Errores</td>
                    <td style={{ padding: '4px 8px' }}>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ color: 'var(--danger, #dc2626)', fontSize: '0.8125rem', marginBottom: 2 }}>
                          Fila {e.row}: {e.message}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
                {importResult.warnings && importResult.warnings.length > 0 && (
                  <tr>
                    <td style={{ padding: '4px 8px', color: '#d97706', verticalAlign: 'top' }}>Advertencias</td>
                    <td style={{ padding: '4px 8px' }}>
                      {importResult.warnings.map((w, i) => (
                        <div key={i} style={{ color: '#d97706', fontSize: '0.8125rem', marginBottom: 2 }}>
                          Fila {w.row}: {w.message}
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: 12, color: 'var(--gray-600)', fontSize: '0.9375rem' }}>
              Selecciona un archivo Excel (.xlsx) con la información de empleados y beneficiarios para importar.
            </p>
            <div className="form-group">
              <label>Archivo Excel</label>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleImportFileChange}
                disabled={importing}
              />
            </div>
            {importFile && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 4, fontSize: '0.875rem' }}>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  Archivo seleccionado: {importFile.name}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--gray-500)', fontSize: '0.8125rem' }}>
                  Tamaño: {(importFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <button
                  type="button"
                  onClick={() => { setImportFile(null); }}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--danger, #dc2626)', cursor: 'pointer', fontSize: '0.8125rem', padding: 0 }}
                >
                  Quitar archivo
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar Empleado"
        message={`¿Estás seguro de que deseas eliminar a "${deleteTarget?.fullName}"?`}
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