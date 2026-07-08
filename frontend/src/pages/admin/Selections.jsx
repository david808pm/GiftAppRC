import { useState, useEffect, useCallback } from 'react';
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

const PAGE_SIZES = [25, 50, 100];

export default function Selections() {
  const [selections, setSelections] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [filterCampaign, setFilterCampaign] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(USE_BACKEND);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const loadData = useCallback(async (opts = {}) => {
    if (USE_BACKEND) {
      setLoading(true);
      setError(null);
    }
    try {
      const p = opts.page ?? page;
      const ps = opts.pageSize ?? pageSize;
      const s = opts.search !== undefined ? opts.search : search;
      const fc = opts.campaignId !== undefined ? opts.campaignId : filterCampaign;

      const query = { page: p, pageSize: ps };
      if (s) query.search = s;
      if (fc) query.campaignId = fc;

      const [response, campaignsData] = await Promise.all([
        giftAppGetSelections(query),
        giftAppGetCampaigns(),
      ]);

      setSelections(response.data);
      setPage(response.meta.page);
      setPageSize(response.meta.pageSize);
      setTotal(response.meta.total);
      setTotalPages(response.meta.totalPages);
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
  }, [page, pageSize, search, filterCampaign]);

  const handleSearchChange = (value) => {
    setSearchInput(value);
    setPage(1);
  };

  const handleFilterCampaignChange = (value) => {
    setFilterCampaign(value);
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
    loadData({ page, pageSize, search, campaignId: filterCampaign });
  }, [page, pageSize, search, filterCampaign, loadRevision]);

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

    if (total === 0) return;
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
          disabled={total === 0 || exporting}
        >
          {exporting ? 'Exportando...' : USE_BACKEND ? 'Exportar Excel' : 'Exportar CSV Demo'}
        </button>
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por empleado, beneficiario o regalo..."
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
        </div>

        {selections.length === 0 && !loading ? (
          <EmptyState
            title="Sin selecciones"
            message="Las selecciones confirmadas aparecerán aquí."
          />
        ) : (
          <>
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
                  {selections.map((s) => (
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
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
