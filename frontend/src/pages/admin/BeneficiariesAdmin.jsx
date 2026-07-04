import { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { validateRequired, validateAge, validateGender } from '../../utils/validators';
import { formatDate } from '../../utils/dates';
import {
  giftAppGetBeneficiaries,
  giftAppCreateBeneficiary,
  giftAppUpdateBeneficiary,
  giftAppDeleteBeneficiary,
  giftAppGetEmployees,
  giftAppGetCampaigns,
  USE_BACKEND,
} from '../../api/giftAppService';
import Modal from '../../components/Modal';
import Toast, { useToast } from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

const EMPTY_BENEFICIARY = {
  employeeId: '',
  fullName: '',
  age: '',
  gender: 'male',
};

const PAGE_SIZES = [25, 50, 100];

export default function BeneficiariesAdmin() {
  const { isReadOnly } = useOutletContext() || {};
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_BENEFICIARY);
  const [errors, setErrors] = useState({});
  const { toasts, addToast, removeToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(USE_BACKEND);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async (opts = {}) => {
    if (USE_BACKEND) {
      setLoading(true);
      setError(null);
    }
    try {
      const p = opts.page ?? page;
      const ps = opts.pageSize ?? pageSize;
      const s = opts.search !== undefined ? opts.search : search;
      const fe = opts.employeeId !== undefined ? opts.employeeId : filterEmployee;

      const query = { page: p, pageSize: ps };
      if (s) query.search = s;
      if (fe) query.employeeId = fe;

      const [response, employeesData, campaignsData] = await Promise.all([
        giftAppGetBeneficiaries(query),
        giftAppGetEmployees(),
        giftAppGetCampaigns(),
      ]);

      setBeneficiaries(response.data);
      setPage(response.meta.page);
      setPageSize(response.meta.pageSize);
      setTotal(response.meta.total);
      setTotalPages(response.meta.totalPages);
      setEmployees(employeesData);
      setCampaigns(campaignsData);
    } catch {
      if (USE_BACKEND) {
        setError('No fue posible cargar los beneficiarios.');
      }
    } finally {
      if (USE_BACKEND) {
        setLoading(false);
      }
    }
  }, [page, pageSize, search, filterEmployee, addToast]);

  const handleSearchChange = (value) => {
    setSearchInput(value);
    setPage(1);
  };

  const handleFilterEmployeeChange = (value) => {
    setFilterEmployee(value);
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
    loadData({ page, pageSize, search, employeeId: filterEmployee });
  }, [page, pageSize, search, filterEmployee, loadRevision]);

  const getEmployeeName = (id) => {
    return employees.find((e) => String(e.id) === String(id))?.fullName || id;
  };

  const getCampaignForEmployee = (empId) => {
    const emp = employees.find((e) => String(e.id) === String(empId));
    if (!emp) return '';
    return campaigns.find((c) => String(c.id) === String(emp.campaignId))?.name || '';
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_BENEFICIARY, employeeId: employees[0]?.id || '' });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (ben) => {
    setEditing(ben);
    setForm({ ...ben, age: String(ben.age) });
    setErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const errs = {};
    const nameErr = validateRequired(form.fullName, 'Nombre');
    if (nameErr) errs.fullName = nameErr;
    if (!form.employeeId) errs.employeeId = 'El empleado es obligatorio.';
    const ageErr = validateAge(form.age);
    if (ageErr) errs.age = ageErr;
    const genderErr = validateGender(form.gender);
    if (genderErr) errs.gender = genderErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      if (editing) {
        await giftAppUpdateBeneficiary(editing.id, form);
      } else {
        await giftAppCreateBeneficiary(form);
      }
      await loadData({ page: editing ? page : 1, pageSize });
      setShowModal(false);
      addToast(editing ? 'Beneficiario actualizado.' : 'Beneficiario creado.');
    } catch (err) {
      addToast(err.message || 'Error al guardar el beneficiario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await giftAppDeleteBeneficiary(deleteTarget.id);
      await loadData({ page, pageSize });
      setDeleteTarget(null);
      addToast('Beneficiario eliminado.');
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
        <div className="admin-topbar"><h1>Beneficiarios</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando beneficiarios...
          </p>
        </div>
      </div>
    );
  }

  if (USE_BACKEND && error) {
    return (
      <div>
        <div className="admin-topbar"><h1>Beneficiarios</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--danger)', fontSize: '0.9375rem' }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>Beneficiarios</h1>
        {!isReadOnly && (
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            + Nuevo Beneficiario
          </button>
        )}
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select
            value={filterEmployee}
            onChange={(e) => handleFilterEmployeeChange(e.target.value)}
          >
            <option value="">Todos los Empleados</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName} ({e.documentId})
              </option>
            ))}
          </select>
        </div>

        {beneficiaries.length === 0 && !loading ? (
          <EmptyState title="Sin beneficiarios" message="Agrega tu primer beneficiario." />
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Edad</th>
                    <th>Género</th>
                    <th>Empleado</th>
                    <th>Campaña</th>
                    <th>Creado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {beneficiaries.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 500 }}>{b.fullName}</td>
                      <td>{b.age}</td>
                      <td style={{ textTransform: 'capitalize' }}>{b.gender === 'male' ? 'Masculino' : 'Femenino'}</td>
                      <td>{getEmployeeName(b.employeeId)}</td>
                      <td>{getCampaignForEmployee(b.employeeId)}</td>
                      <td>{formatDate(b.createdAt)}</td>
                      <td>
                        {!isReadOnly && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openEdit(b)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeleteTarget(b)}
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
        title={editing ? 'Editar Beneficiario' : 'Nuevo Beneficiario'}
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
          <label>Empleado</label>
          <select
            value={form.employeeId}
            onChange={(e) => updateField('employeeId', e.target.value)}
          >
            <option value="">Seleccionar empleado</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName} ({e.documentId})
              </option>
            ))}
          </select>
          {errors.employeeId && <p className="form-error">{errors.employeeId}</p>}
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
          <label>Edad (0-13)</label>
          <input
            type="number"
            min="0"
            max="13"
            value={form.age}
            onChange={(e) => updateField('age', e.target.value)}
          />
          {errors.age && <p className="form-error">{errors.age}</p>}
        </div>
        <div className="form-group">
          <label>Género</label>
          <select
            value={form.gender}
            onChange={(e) => updateField('gender', e.target.value)}
          >
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
          </select>
          {errors.gender && <p className="form-error">{errors.gender}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar Beneficiario"
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