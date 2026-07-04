import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  findCampaignBySlug,
  getData,
  KEYS,
  getSelectionsByCampaign,
} from '../../api/localStorageService';
import {
  giftAppGetPublicCampaignBySlug,
  giftAppGetMyConfirmedSelection,
  USE_BACKEND,
} from '../../api/giftAppService';
import { formatDate } from '../../utils/dates';

export default function AlreadyConfirmed() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [selections, setSelections] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [giftsMap, setGiftsMap] = useState({});
  const [beneficiariesMap, setBeneficiariesMap] = useState({});
  const [loading, setLoading] = useState(USE_BACKEND);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (USE_BACKEND) {
        setLoading(true);
        try {
          const camp = await giftAppGetPublicCampaignBySlug(slug);
          if (!camp) {
            navigate(`/campaign/${slug}/login`);
            return;
          }

          const result = await giftAppGetMyConfirmedSelection();
          if (cancelled) return;

          const sel = result?.selection;
          if (!sel) {
            navigate(`/campaign/${slug}/login`);
            return;
          }

          setCampaign(camp);
          setEmployee({
            fullName: sel.employeeName,
            documentId: sel.employeeDocumentId,
          });
          setSelections(sel.items || []);
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          if (err.status === 401) {
            navigate(`/campaign/${slug}/login`);
          } else {
            setLoadError('No se encontró una selección confirmada.');
            setLoading(false);
          }
        }
        return;
      }

      const camp = findCampaignBySlug(slug);
      if (!camp) {
        navigate(`/campaign/${slug}/login`);
        return;
      }

      let employeeId = location.state?.employeeId;
      let documentId = location.state?.documentId;

      if (!employeeId) {
        const sessionRaw = sessionStorage.getItem(`giftapp_session_${slug}`);
        if (sessionRaw) {
          try {
            const session = JSON.parse(sessionRaw);
            employeeId = session.employeeId;
            documentId = session.documentId;
          } catch {
            navigate(`/campaign/${slug}/login`);
            return;
          }
        }
      }

      if (!employeeId) {
        navigate(`/campaign/${slug}/login`);
        return;
      }

      const employees = getData(KEYS.EMPLOYEES);
      const emp = employees.find(
        (e) => e.id === employeeId && e.campaignId === camp.id
      );

      if (!emp) {
        navigate(`/campaign/${slug}/login`);
        return;
      }

      const allGifts = getData(KEYS.GIFTS);
      const gm = {};
      for (const g of allGifts) gm[g.id] = g;

      const allBeneficiaries = getData(KEYS.BENEFICIARIES);
      const bm = {};
      for (const b of allBeneficiaries) bm[b.id] = b;

      const allSelections = getSelectionsByCampaign(camp.id);
      const empSelections = allSelections.filter(
        (s) => s.employeeId === employeeId
      );

      setCampaign(camp);
      setEmployee({ ...emp, documentId: documentId || emp.documentId });
      setGiftsMap(gm);
      setBeneficiariesMap(bm);
      setSelections(empSelections);
    }

    load();
    return () => { cancelled = true; };
  }, [slug, location.state, navigate]);

  if (USE_BACKEND && loading) {
    return (
      <div className="page-wrapper">
        <div className="page-content container">
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--gray-500)' }}>Cargando selección confirmada...</p>
          </div>
        </div>
      </div>
    );
  }

  if (USE_BACKEND && loadError) {
    return (
      <div className="page-wrapper">
        <div className="page-content container">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Sin Selección</h2>
            <p style={{ color: 'var(--gray-500)', marginTop: 8 }}>{loadError}</p>
            <button
              className="btn btn-outline"
              style={{ marginTop: 16 }}
              onClick={() => navigate(`/campaign/${slug}/login`)}
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign || (!USE_BACKEND && !employee)) return null;

  return (
    <div className="page-wrapper" style={campaign ? { '--primary': campaign.primaryColor || '#2563eb' } : {}}>
      <header className="page-header">
        <div className="container">
          {campaign?.logoImageUrl && (
            <img
              src={campaign.logoImageUrl}
              alt={campaign?.logoText || campaign?.name || ''}
              style={{ maxHeight: 44, maxWidth: 160, marginRight: 12, objectFit: 'contain' }}
            />
          )}
          <span className="logo">{campaign?.logoText || 'REGALOS'}</span>
          <span style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            {campaign?.name || ''}
          </span>
        </div>
      </header>
      <div className="page-content container">
        <div className="card" style={{ marginBottom: 24 }}>
          <div
            style={{
              background: 'var(--warning-light)',
              color: '#92400e',
              padding: '12px 16px',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: '0.875rem',
            }}
          >
            Ya has completado tu selección de regalos. No se permiten cambios.
          </div>

          <h2 style={{ marginBottom: 4 }}>{employee.fullName}</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            ID: {employee.documentId} | Campaña: {campaign.name}
          </p>
        </div>

        <h3 style={{ marginBottom: 16 }}>Tus Selecciones Confirmadas</h3>

        <div className="summary-list">
          {selections.map((sel) => {
            if (USE_BACKEND) {
              return (
                <div key={`${sel.beneficiaryId}-${sel.giftId}`} className="summary-item">
                  <img
                    src={
                      sel.giftImageUrl ||
                      'https://placehold.co/400x400/CCCCCC/666?text=No+Image'
                    }
                    alt={sel.giftName}
                    onError={(e) => {
                      e.target.src =
                        'https://placehold.co/400x400/CCCCCC/666?text=No+Image';
                    }}
                  />
                  <div className="summary-item-info">
                    <div className="beneficiary-name">
                      {sel.beneficiaryName}
                      {sel.beneficiaryAge !== undefined
                        ? ` (Edad: ${sel.beneficiaryAge}, ${sel.beneficiaryGender === 'male' ? 'Masculino' : 'Femenino'})`
                        : ''}
                    </div>
                    <h4>{sel.giftName}</h4>
                    <div className="gift-ref">Ref: {sel.giftReference}</div>
                  </div>
                </div>
              );
            }
            const gift = giftsMap[sel.giftId];
            const benef = beneficiariesMap[sel.beneficiaryId];
            const giftImageUrl = sel.giftImageUrl || gift?.imageUrls?.[0];
            const beneficiaryAge = sel.beneficiaryAge !== undefined ? sel.beneficiaryAge : benef?.age;
            const beneficiaryGender = sel.beneficiaryGender || (benef ? (benef.gender === 'male' ? 'Masculino' : 'Femenino') : '');
            return (
              <div key={sel.id} className="summary-item">
                <img
                  src={
                    giftImageUrl ||
                    'https://placehold.co/400x400/CCCCCC/666?text=No+Image'
                  }
                  alt={sel.giftName}
                  onError={(e) => {
                    e.target.src =
                      'https://placehold.co/400x400/CCCCCC/666?text=No+Image';
                  }}
                />
                <div className="summary-item-info">
                  <div className="beneficiary-name">
                    {sel.beneficiaryName}
                    {beneficiaryAge !== undefined
                      ? ` (Edad: ${beneficiaryAge}, ${beneficiaryGender})`
                      : ''}
                  </div>
                  <h4>{sel.giftName}</h4>
                  <div className="gift-ref">Ref: {sel.giftReference}</div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--gray-400)',
                      marginTop: 4,
                    }}
                  >
                    Confirmado: {formatDate(sel.confirmedAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <button
            className="btn btn-outline"
            onClick={() => navigate(`/campaign/${slug}`)}
          >
            Volver a la Campaña
          </button>
        </div>
      </div>
    </div>
  );
}
