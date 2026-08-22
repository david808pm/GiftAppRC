import { useState, useEffect } from 'react';
import { useOutletContext, Navigate } from 'react-router-dom';
import {
  giftAppGetAdminUsers,
  giftAppCreateAdminUser,
  giftAppUpdateAdminUser,
  giftAppChangeAdminUserPassword,
  giftAppUpdateAdminUserStatus,
  giftAppDeleteAdminUser,
  giftAppGetCompanies,
  USE_BACKEND,
} from '../../api/giftAppService';
import Modal from '../../components/Modal';
import Toast, { useToast } from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { formatDate } from '../../utils/dates';

// Mirror of the backend password policy (min 12 chars, upper/lower/digit).
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;
const STRONG_PASSWORD_MESSAGE =
  'La contraseña debe tener al menos 12 caracteres e incluir mayúscula, minúscula y número.';

const EMPTY_USER = {
  name: '',
  email: '',
  password: '',
  role: 'COMPANY_VIEWER',
  companyId: '',
  isActive: true,
};

export default function AdminUsers() {
  const { isSuperAdmin, session } = useOutletContext() || {};
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [errors, setErrors] = useState({});
  const { toasts, addToast, removeToast } = useToast();
  const [statusTarget, setStatusTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [loading, setLoading] = useState(USE_BACKEND);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (USE_BACKEND) setLoading(true);
    try {
      const [usersData, companiesData] = await Promise.all([
        giftAppGetAdminUsers(),
        USE_BACKEND ? giftAppGetCompanies() : Promise.resolve([]),
      ]);
      setUsers(usersData);
      setCompanies(companiesData);
    } catch (err) {
      if (USE_BACKEND) addToast(err.message || 'Error al cargar datos.', 'error');
    } finally {
      if (USE_BACKEND) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_USER, companyId: companies[0]?.id || '' });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role?.name || 'COMPANY_VIEWER',
      companyId: user.companyId || '',
      isActive: user.isActive,
    });
    setErrors({});
    setShowModal(true);
  };

  const openChangePassword = (user) => {
    setEditing(user);
    setPasswordForm({ password: '', confirmPassword: '' });
    setPasswordErrors({});
    setShowPasswordModal(true);
  };

  const validate = () => {
    const errs = {};
    if (!form.name || form.name.trim().length < 2) {
      errs.name = 'El nombre debe tener al menos 2 caracteres.';
    }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Formato de correo inválido.';
    }
    if (!editing && (!form.password || !STRONG_PASSWORD.test(form.password))) {
      errs.password = STRONG_PASSWORD_MESSAGE;
    }
    if (!form.companyId) {
      errs.companyId = 'La compañía es obligatoria.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validatePassword = () => {
    const errs = {};
    if (!passwordForm.password || !STRONG_PASSWORD.test(passwordForm.password)) {
      errs.password = STRONG_PASSWORD_MESSAGE;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      errs.confirmPassword = 'Las contraseñas no coinciden.';
    }
    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        companyId: Number(form.companyId),
        isActive: form.isActive,
      };

      if (!editing) {
        payload.password = form.password;
        await giftAppCreateAdminUser(payload);
      } else {
        await giftAppUpdateAdminUser(editing.id, payload);
      }

      await loadData();
      setShowModal(false);
      addToast(editing ? 'Usuario actualizado.' : 'Usuario creado.');
    } catch (err) {
      addToast(err.message || 'Error al guardar el usuario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!validatePassword()) return;

    setSaving(true);
    try {
      await giftAppChangeAdminUserPassword(editing.id, passwordForm.password);
      setShowPasswordModal(false);
      addToast('Contraseña actualizada.');
    } catch (err) {
      addToast(err.message || 'Error al cambiar la contraseña.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;

    setSaving(true);
    try {
      await giftAppUpdateAdminUserStatus(statusTarget.id, !statusTarget.isActive);
      await loadData();
      setStatusTarget(null);
      addToast(statusTarget.isActive ? 'Usuario desactivado.' : 'Usuario activado.');
    } catch (err) {
      addToast(err.message || 'Error al cambiar el estado.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setSaving(true);
    try {
      await giftAppDeleteAdminUser(deleteTarget.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      addToast('Usuario eliminado correctamente.');
    } catch (err) {
      addToast(err.message || 'Error al eliminar el usuario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const getCompanyName = (companyId) => {
    return companies.find((c) => String(c.id) === String(companyId))?.name || '-';
  };

  // Admin user management is restricted to SUPER_ADMIN. Defense in depth: the
  // backend also enforces @Roles('SUPER_ADMIN') on these endpoints.
  if (!isSuperAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (USE_BACKEND && loading) {
    return (
      <div>
        <div className="admin-topbar"><h1>Usuarios</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando usuarios...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-topbar">
        <h1>Usuarios</h1>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          + Crear Visor
        </button>
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="Sin usuarios" message="Crea tu primer usuario visor." />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Compañía</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="badge badge-admin">
                        {u.role?.name || 'N/A'}
                      </span>
                    </td>
                    <td>{getCompanyName(u.companyId)}</td>
                    <td>
                      <span className={`badge badge-${u.isActive ? 'active' : 'inactive'}`}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEdit(u)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openChangePassword(u)}
                        >
                          Contraseña
                        </button>
                        <button
                          className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => setStatusTarget(u)}
                        >
                          {u.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                        {isSuperAdmin && u.role?.name === 'COMPANY_VIEWER' && u.id !== session?.id && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeleteTarget(u)}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
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
        title={editing ? 'Editar Visor' : 'Crear Visor'}
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
          <label>Nombre (ingresa el nombre completo)</label>
          <input
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        <div className="form-group">
          <label>Email (ingresa un correo válido)</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
          {errors.email && <p className="form-error">{errors.email}</p>}
        </div>
        {!editing && (
          <div className="form-group">
            <label>Contraseña (mínimo 8 caracteres)</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
            />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>
        )}
        <div className="form-group">
          <label>Rol (define el nivel de acceso)</label>
          <select
            value={form.role}
            onChange={(e) => updateField('role', e.target.value)}
            disabled
          >
            <option value="COMPANY_VIEWER">COMPANY_VIEWER</option>
          </select>
        </div>
        <div className="form-group">
          <label>Compañía (selecciona la compañía asociada)</label>
          <select
            value={form.companyId}
            onChange={(e) => updateField('companyId', e.target.value)}
          >
            <option value="">Seleccionar compañía</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.companyId && <p className="form-error">{errors.companyId}</p>}
        </div>
        {editing && (
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField('isActive', e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Usuario activo (marca para permitir el acceso)
            </label>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Cambiar Contraseña"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowPasswordModal(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleChangePassword} disabled={saving}>
              {saving ? 'Guardando...' : 'Cambiar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Nueva Contraseña (mínimo 8 caracteres)</label>
          <input
            type="password"
            value={passwordForm.password}
            onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
          />
          {passwordErrors.password && <p className="form-error">{passwordErrors.password}</p>}
        </div>
        <div className="form-group">
          <label>Confirmar Contraseña (repite la nueva contraseña)</label>
          <input
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
          />
          {passwordErrors.confirmPassword && <p className="form-error">{passwordErrors.confirmPassword}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!statusTarget}
        title={statusTarget?.isActive ? 'Desactivar Usuario' : 'Activar Usuario'}
        message={`¿Estás seguro de que deseas ${statusTarget?.isActive ? 'desactivar' : 'activar'} a "${statusTarget?.name}"?`}
        confirmText={statusTarget?.isActive ? 'Desactivar' : 'Activar'}
        danger={statusTarget?.isActive}
        loading={saving}
        onConfirm={handleStatusChange}
        onCancel={() => setStatusTarget(null)}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar Usuario Visor"
        message={`¿Eliminar este usuario visor?\n\nEl usuario perderá el acceso administrativo.\nEsta acción no eliminará la empresa, campañas, empleados,\nbeneficiarios, regalos ni selecciones relacionadas.`}
        confirmText="Eliminar usuario"
        cancelText="Cancelar"
        danger={true}
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
