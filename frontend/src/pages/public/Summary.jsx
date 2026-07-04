import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  findCampaignBySlug,
  getData,
  KEYS,
  getBeneficiariesByEmployee,
} from '../../api/localStorageService';
import {
  giftAppGetPublicCampaignBySlug,
  giftAppGetPublicEmployeeSession,
  giftAppGetPublicBeneficiaries,
  giftAppGetPublicCompatibleGifts,
  giftAppConfirmPublicSelection,
  giftAppCreatePublicSupportRequest,
  USE_BACKEND,
} from '../../api/giftAppService';
import ProgressStepper from '../../components/ProgressStepper';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function Summary() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selections, setSelections] = useState([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [showSupport, setShowSupport] = useState(false);
  const [supportData, setSupportData] = useState({ type: '', message: '' });
  const [supportSent, setSupportSent] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sessionRaw = sessionStorage.getItem(`giftapp_session_${slug}`);
      const selectionsRaw = sessionStorage.getItem(`giftapp_selections_${slug}`);

      if (!sessionRaw) {
        navigate(`/campaign/${slug}/login`);
        return;
      }

      let session;
      try {
        session = JSON.parse(sessionRaw);
      } catch {
        navigate(`/campaign/${slug}/login`);
        return;
      }

      // selectionsRaw may be absent if the employee already confirmed
      // (selections are cleared after confirmation). In that case we still
      // check the employee status before deciding where to redirect.
      let selItems = null;
      if (selectionsRaw) {
        try {
          selItems = JSON.parse(selectionsRaw);
        } catch {
          navigate(`/campaign/${slug}/login`);
          return;
        }
      }

      if (USE_BACKEND) {
        setLoading(true);
        try {
          const sessionData = await giftAppGetPublicEmployeeSession();
          if (!sessionData) {
            navigate(`/campaign/${slug}/login`);
            return;
          }
          if (sessionData.employee.status === 'CONFIRMED') {
            navigate(`/campaign/${slug}/already-confirmed`);
            return;
          }

          // Not confirmed but no selections stored — send back to login.
          if (!selItems) {
            navigate(`/campaign/${slug}/login`);
            return;
          }

          const camp = await giftAppGetPublicCampaignBySlug(slug);
          if (!camp || camp.status !== 'ACTIVE') {
            navigate(`/campaign/${slug}/login`);
            return;
          }

          const bens = await giftAppGetPublicBeneficiaries();
          if (cancelled) return;

          const beneficiaryIds = [...new Set(selItems.map((s) => s.beneficiaryId))];
          const giftsPromises = beneficiaryIds.map((id) =>
            giftAppGetPublicCompatibleGifts(id).then((r) => r?.gifts || [])
          );
          const allGiftsArrays = await Promise.all(giftsPromises);
          if (cancelled) return;

          const giftsMap = {};
          for (const gifts of allGiftsArrays) {
            for (const gift of gifts) {
              giftsMap[gift.id] = gift;
            }
          }

          const selWithGifts = selItems.map((item) => ({
            ...item,
            gift: giftsMap[item.giftId] || null,
          }));

          setCampaign(camp);
          setEmployee(sessionData.employee);
          setBeneficiaries(bens);
          setSelections(selWithGifts);
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          if (err.status === 401) {
            navigate(`/campaign/${slug}/login`);
          } else {
            setLoadError('No fue posible cargar el resumen de la selección.');
            setLoading(false);
          }
        }
        return;
      }

      try {
        const camp = findCampaignBySlug(slug);
        if (!camp) {
          navigate(`/campaign/${slug}/login`);
          return;
        }

        const employees = getData(KEYS.EMPLOYEES);
        const emp = employees.find(
          (e) => e.id === session.employeeId && e.campaignId === camp.id
        );

        if (!emp) {
          navigate(`/campaign/${slug}/login`);
          return;
        }

        // Demo mode: if no selections stored, send back to login.
        if (!selItems) {
          navigate(`/campaign/${slug}/login`);
          return;
        }

        const bens = getBeneficiariesByEmployee(emp.id);
        const allGifts = getData(KEYS.GIFTS);
        const giftsMap = {};
        for (const gift of allGifts) {
          giftsMap[gift.id] = gift;
        }
        const selWithGifts = selItems.map((item) => ({
          ...item,
          gift: giftsMap[item.giftId] || null,
        }));

        setCampaign(camp);
        setEmployee(emp);
        setBeneficiaries(bens);
        setSelections(selWithGifts);
        setLoading(false);
      } catch {
        navigate(`/campaign/${slug}/login`);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  const handleConfirm = async () => {
    if (confirming) return;
    setConfirming(true);
    setError('');

    const items = selections.map((s) => ({
      beneficiaryId: s.beneficiaryId,
      giftId: s.giftId,
    }));

    const missing = items.some((i) => !i.giftId);
    if (missing) {
      setError('Cada beneficiario debe tener un regalo seleccionado.');
      setConfirming(false);
      setShowConfirm(false);
      return;
    }

    try {
      await giftAppConfirmPublicSelection(
        slug,
        items,
        campaign.id,
        employee.id
      );

      sessionStorage.setItem(`giftapp_confirmed_${slug}`, 'true');
      sessionStorage.removeItem(`giftapp_selections_${slug}`);
      navigate(`/campaign/${slug}/thank-you`);
    } catch (err) {
      setError(err.message || 'Error al confirmar la selección.');
      setConfirming(false);
      setShowConfirm(false);
    }
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    if (!supportData.type || !supportData.message.trim()) return;
    setSupportSubmitting(true);
    setSupportError('');
    try {
      await giftAppCreatePublicSupportRequest({
        campaignId: campaign.id,
        documentId: employee?.documentId || undefined,
        type: supportData.type,
        message: supportData.message,
      });
      setSupportSent(true);
      setSupportData({ type: '', message: '' });
    } catch (err) {
      setSupportError(err.message || 'No fue posible enviar el reporte. Intenta nuevamente.');
    } finally {
      setSupportSubmitting(false);
    }
  };

  if (USE_BACKEND && loading) {
    return (
      <div className="page-wrapper">
        <div className="page-content container">
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--gray-500)' }}>Cargando resumen...</p>
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
            <h2>Error</h2>
            <p style={{ color: 'var(--danger)', marginTop: 8 }}>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!USE_BACKEND && loading) return null;

  // Build a lookup by beneficiaryId for rendering
  const selectionsMap = {};
  for (const s of selections) {
    selectionsMap[s.beneficiaryId] = s.gift;
  }

  return (
    <div className="page-wrapper" style={{ '--primary': campaign.primaryColor || '#2563eb' }}>
      <header className="page-header">
        <div className="container">
          {campaign.logoImageUrl && (
            <img
              src={campaign.logoImageUrl}
              alt={campaign.logoText || campaign.name}
              style={{ maxHeight: 44, maxWidth: 160, marginRight: 12, objectFit: 'contain' }}
            />
          )}
          <span className="logo">{campaign.logoText || 'REGALOS'}</span>
          <span style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            {campaign.name}
          </span>
        </div>
      </header>
      <div className="page-content container">
        <ProgressStepper currentStep={2} />

        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 4 }}>Revisa Tu Selección</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            Por favor revisa tus selecciones antes de confirmar. Puedes volver
            para hacer cambios.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--gray-500)',
                  textTransform: 'uppercase',
                }}
              >
                Empleado
              </label>
              <p style={{ fontWeight: 600 }}>{employee.fullName}</p>
            </div>
            <div>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--gray-500)',
                  textTransform: 'uppercase',
                }}
              >
                N° Identificación
              </label>
              <p style={{ fontWeight: 600 }}>{employee.documentId}</p>
            </div>
            <div>
              <label
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--gray-500)',
                  textTransform: 'uppercase',
                }}
              >
                Campaña
              </label>
              <p style={{ fontWeight: 600 }}>{campaign.name}</p>
            </div>
          </div>
        </div>

        <div className="summary-list">
          {beneficiaries.map((b) => {
            const gift = selectionsMap[b.id];
            if (!gift) return null;
            return (
              <div key={b.id} className="summary-item">
                <img
                  src={
                    gift.imageUrls?.[0] ||
                    'https://placehold.co/400x400/CCCCCC/666?text=No+Image'
                  }
                  alt={gift.name}
                  onError={(e) => {
                    e.target.src =
                      'https://placehold.co/400x400/CCCCCC/666?text=No+Image';
                  }}
                />
                <div className="summary-item-info">
                  <div className="beneficiary-name">
                    {b.fullName} (Edad: {b.age},{' '}
                    {b.gender === 'male' ? 'Masculino' : 'Femenino'})
                  </div>
                  <h4>{gift.name}</h4>
                  <div className="gift-ref">Ref: {gift.reference}</div>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div
            style={{
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              padding: '12px 16px',
              borderRadius: 6,
              marginTop: 16,
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 32,
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowSupport(!showSupport)}
            >
              Reportar Problema
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-outline"
                onClick={() => navigate(`/campaign/${slug}/select`)}
              >
                Volver y Cambiar
              </button>
              <button
                className="btn btn-success"
                onClick={() => setShowConfirm(true)}
                disabled={confirming}
              >
                {confirming ? 'Confirmando...' : 'Confirmar Selección Final'}
              </button>
          </div>
        </div>

        {showSupport && (
          <div className="card" style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 12 }}>Reportar un Problema</h3>
            {supportSent ? (
              <p style={{ color: 'var(--success)' }}>
                Tu reporte ha sido enviado.
              </p>
            ) : (
              <>
                {supportError && (
                  <p className="form-error" style={{ marginBottom: 12 }}>{supportError}</p>
                )}
                <form onSubmit={handleSupportSubmit}>
                  <div className="form-group">
                    <label>Tipo de Problema</label>
                    <select
                      value={supportData.type}
                      onChange={(e) =>
                        setSupportData({ ...supportData, type: e.target.value })
                      }
                      disabled={supportSubmitting}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="BENEFICIARY_DATA_INCORRECT">
                        Los datos de mi beneficiario son incorrectos
                      </option>
                      <option value="MISSING_BENEFICIARY">
                        Falta un beneficiario
                      </option>
                      <option value="AGE_GENDER_INCORRECT">
                        La edad o el género son incorrectos
                      </option>
                      <option value="GIFT_SELECTION_PROBLEM">
                        Tengo un problema con la selección de regalos
                      </option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Mensaje</label>
                    <textarea
                      value={supportData.message}
                      onChange={(e) =>
                        setSupportData({
                          ...supportData,
                          message: e.target.value,
                        })
                      }
                      placeholder="Describe tu problema..."
                      disabled={supportSubmitting}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={supportSubmitting}>
                    {supportSubmitting ? 'Enviando...' : 'Enviar Reporte'}
                  </button>
                </form>
                </>
              )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirmar Selección"
        message="Una vez confirmada, no podrás modificar tu selección. ¿Estás seguro?"
        confirmText="Sí, Confirmar"
        cancelText="Cancelar"
        loading={confirming}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
