import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatDate } from '../../utils/dates';
import { SUPPORT_TYPE_LABELS } from '../../constants/appConstants';
import {
  giftAppGetSupportRequests,
  giftAppUpdateSupportRequest,
  giftAppGetEmployees,
  giftAppGetCampaigns,
  USE_BACKEND,
} from '../../api/giftAppService';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Toast, { useToast } from '../../components/Toast';

export default function SupportRequests() {
  const { isReadOnly } = useOutletContext() || {};
  const [requests, setRequests] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [noteForm, setNoteForm] = useState('');
  const [statusForm, setStatusForm] = useState('');
  const { toasts, addToast, removeToast } = useToast();
  const [loading, setLoading] = useState(USE_BACKEND);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (USE_BACKEND) {
      setLoading(true);
      setError(null);
    }
    try {
      const [requestsData, employeesData, campaignsData] = await Promise.all([
        giftAppGetSupportRequests(),
        giftAppGetEmployees(),
        giftAppGetCampaigns(),
      ]);
      setRequests(requestsData);
      setEmployees(employeesData);
      setCampaigns(campaignsData);
    } catch {
      if (USE_BACKEND) {
        setError('No fue posible cargar las solicitudes de soporte.');
      }
    } finally {
      if (USE_BACKEND) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = requests.filter((r) => {
    const matchesStatus = !filterStatus || r.status === filterStatus;
    const matchesSearch =
      !search ||
      r.message?.toLowerCase().includes(search.toLowerCase()) ||
      r.type?.toLowerCase().includes(search.toLowerCase()) ||
      r.documentId?.includes(search);
    return matchesStatus && matchesSearch;
  });

  const getCampaignName = (id) => campaigns.find((c) => String(c.id) === String(id))?.name || id;
  const getEmployee = (id) => employees.find((e) => String(e.id) === String(id));

  const openDetail = (req) => {
    setSelected(req);
    setNoteForm(req.internalNote || '');
    setStatusForm(req.status);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await giftAppUpdateSupportRequest(selected.id, {
        status: statusForm,
        internalNote: noteForm,
      });
      await loadData();
      setSelected(null);
      addToast('Solicitud de soporte actualizada.');
    } catch (err) {
      addToast(err.message || 'Error al actualizar la solicitud.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (USE_BACKEND && loading) {
    return (
      <div>
        <div className="admin-topbar"><h1>Solicitudes de Soporte</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando solicitudes de soporte...
          </p>
        </div>
      </div>
    );
  }

  if (USE_BACKEND && error) {
    return (
      <div>
        <div className="admin-topbar"><h1>Solicitudes de Soporte</h1></div>
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
        <h1>Solicitudes de Soporte</h1>
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por mensaje, tipo o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos los Estados</option>
            <option value="OPEN">Abierto</option>
            <option value="IN_REVIEW">En Revisión</option>
            <option value="RESOLVED">Resuelto</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="Sin solicitudes"
            message="Las solicitudes de soporte aparecerán aquí."
          />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>ID Documento</th>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Mensaje</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const emp = r.employee || getEmployee(r.employeeId);
                  const campaignName = r.campaign?.name || getCampaignName(r.campaignId);
                  const displayDocId = r.employee?.documentId || r.documentId || '-';
                  return (
                    <tr key={r.id}>
                      <td>{campaignName}</td>
                      <td>{displayDocId}</td>
                      <td>{emp?.fullName || '-'}</td>
                      <td>{SUPPORT_TYPE_LABELS[r.type] || r.type}</td>
                      <td
                        style={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.message}
                      </td>
                      <td>
                        <span
                          className={`badge badge-${r.status
                            .toLowerCase()
                            .replace('_', '-')}`}
                        >
                          {r.status === 'OPEN' ? 'Abierto' : r.status === 'IN_REVIEW' ? 'En Revisión' : 'Resuelto'}
                        </span>
                      </td>
                      <td>{formatDate(r.createdAt)}</td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openDetail(r)}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Detalle de Solicitud de Soporte"
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setSelected(null)} disabled={saving}>
              Cancelar
            </button>
            {!isReadOnly && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            )}
          </>
        }
      >
        {selected && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>
                Tipo
              </label>
              <p style={{ fontWeight: 500 }}>{selected.type}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>
                Mensaje
              </label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{selected.message}</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--gray-500)', textTransform: 'uppercase' }}>
                ID Documento
              </label>
              <p>{selected.documentId}</p>
            </div>
            <div className="form-group">
              <label>Estado (selecciona el estado de la solicitud)</label>
              {isReadOnly ? (
                <p>{statusForm === 'OPEN' ? 'Abierto' : statusForm === 'IN_REVIEW' ? 'En Revisión' : 'Resuelto'}</p>
              ) : (
                <select
                  value={statusForm}
                  onChange={(e) => setStatusForm(e.target.value)}
                >
                  <option value="OPEN">Abierto</option>
                  <option value="IN_REVIEW">En Revisión</option>
                  <option value="RESOLVED">Resuelto</option>
                </select>
              )}
            </div>
            <div className="form-group">
              <label>Nota Interna (agrega observaciones para el equipo)</label>
              {isReadOnly ? (
                <p style={{ whiteSpace: 'pre-wrap' }}>{noteForm || 'Sin notas'}</p>
              ) : (
                <textarea
                  value={noteForm}
                  onChange={(e) => setNoteForm(e.target.value)}
                  placeholder="Agregar una nota interna..."
                />
              )}
            </div>
          </>
        )}
      </Modal>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
