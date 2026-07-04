import { useState, useEffect } from 'react';
import { exportSelectionsToCSV } from '../../api/localStorageService';
import { formatDate } from '../../utils/dates';
import {
  giftAppGetSelections,
  giftAppDownloadSelectionsExcel,
  giftAppGetCampaigns,
  USE_BACKEND,
} from '../../api/giftAppService';
import EmptyState from '../../components/EmptyState';
import Toast, { useToast } from '../../components/Toast';

export default function Selections() {
  const [selections, setSelections] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [filterCampaign, setFilterCampaign] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(USE_BACKEND);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const loadData = async () => {
    if (USE_BACKEND) {
      setLoading(true);
      setError(null);
    }
    try {
      const [selectionsData, campaignsData] = await Promise.all([
        giftAppGetSelections(),
        giftAppGetCampaigns(),
      ]);
      setSelections(selectionsData);
      setCampaigns(campaignsData);
    } catch {
      if (USE_BACKEND) {
        setError('No fue posible cargar las selecciones.');
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

  const filtered = selections.filter((s) => {
    const matchesCampaign = !filterCampaign || String(s.campaignId) === filterCampaign;
    const matchesSearch =
      !search ||
      s.beneficiaryName?.toLowerCase().includes(search.toLowerCase()) ||
      s.giftName?.toLowerCase().includes(search.toLowerCase()) ||
      s.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
      s.employeeDocumentId?.includes(search);
    return matchesCampaign && matchesSearch;
  });

  const getCampaignName = (id) => campaigns.find((c) => String(c.id) === String(id))?.name || id;

  const handleExport = async () => {
    if (USE_BACKEND) {
      const params = {};
      if (filterCampaign) params.campaignId = filterCampaign;
      setExporting(true);
      try {
        const blob = await giftAppDownloadSelectionsExcel(params);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `envios_selecciones_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        addToast(err.message || 'No fue posible exportar las selecciones.', 'error');
      } finally {
        setExporting(false);
      }
      return;
    }

    if (filtered.length === 0) return;
    exportSelectionsToCSV(filterCampaign || undefined);
  };

  if (USE_BACKEND && loading) {
    return (
      <div>
        <div className="admin-topbar"><h1>Selecciones Confirmadas</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando selecciones...
          </p>
        </div>
      </div>
    );
  }

  if (USE_BACKEND && error) {
    return (
      <div>
        <div className="admin-topbar"><h1>Selecciones Confirmadas</h1></div>
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
        <h1>Selecciones Confirmadas</h1>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleExport}
          disabled={filtered.length === 0 || exporting}
        >
          {exporting ? 'Exportando...' : USE_BACKEND ? 'Exportar Excel' : 'Exportar CSV Demo'}
        </button>
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por empleado, beneficiario o regalo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
          >
            <option value="">Todas las Campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="Sin selecciones"
            message="Las selecciones confirmadas aparecerán aquí."
          />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Empleado</th>
                  <th>ID Empleado</th>
                  <th>Beneficiario</th>
                  <th>Regalo</th>
                  <th>Referencia</th>
                  <th>Confirmado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                    <tr key={s.id}>
                      <td>{s.campaignName || getCampaignName(s.campaignId)}</td>
                      <td style={{ fontWeight: 500 }}>
                        {s.employeeName || s.employeeId}
                      </td>
                      <td>{s.employeeDocumentId || ''}</td>
                      <td>
                        {s.beneficiaryName}
                        {s.beneficiaryAge !== undefined && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--gray-400)',
                              marginLeft: 4,
                            }}
                          >
                            ({s.beneficiaryAge},{' '}
                            {s.beneficiaryGender === 'male' ? 'Masculino' : 'Femenino'})
                          </span>
                        )}
                      </td>
                      <td>{s.giftName}</td>
                      <td><code>{s.giftReference}</code></td>
                      <td>{formatDate(s.confirmedAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
