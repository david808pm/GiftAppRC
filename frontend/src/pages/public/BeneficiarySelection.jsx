import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  findCampaignBySlug,
  getData,
  KEYS,
  getBeneficiariesByEmployee,
  getAvailableGiftsForBeneficiary,
} from '../../api/localStorageService';
import {
  giftAppGetPublicCampaignBySlug,
  giftAppGetPublicEmployeeSession,
  giftAppGetPublicBeneficiaries,
  giftAppGetPublicCompatibleGifts,
  giftAppCreatePublicSupportRequest,
  USE_BACKEND,
} from '../../api/giftAppService';
import ProgressStepper from '../../components/ProgressStepper';
import GiftDetailModal from '../../components/GiftDetailModal';
import EmptyState from '../../components/EmptyState';

export default function BeneficiarySelection() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [selections, setSelections] = useState({});
  const [detailGift, setDetailGift] = useState(null);
  const [showSupport, setShowSupport] = useState(false);
  const [supportData, setSupportData] = useState({ type: '', message: '' });
  const [supportSent, setSupportSent] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [giftsCache, setGiftsCache] = useState({});
  const [selectionError, setSelectionError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sessionRaw = sessionStorage.getItem(`giftapp_session_${slug}`);
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

      if (USE_BACKEND) {
        setLoading(true);
        try {
          const [sessionData, camp] = await Promise.all([
            giftAppGetPublicEmployeeSession(),
            giftAppGetPublicCampaignBySlug(slug),
          ]);

          if (!sessionData) {
            navigate(`/campaign/${slug}/login`);
            return;
          }

          const emp = sessionData.employee;
          if (emp.status === 'BLOCKED') {
            navigate(`/campaign/${slug}/login`);
            return;
          }
          if (emp.status === 'CONFIRMED') {
            navigate(`/campaign/${slug}/already-confirmed`);
            return;
          }

          if (!camp || camp.status !== 'ACTIVE') {
            navigate(`/campaign/${slug}/login`);
            return;
          }

          const bens = await giftAppGetPublicBeneficiaries();
          if (cancelled) return;

          if (bens.length === 0) {
            setCampaign(camp);
            setEmployee(emp);
            setBeneficiaries([]);
            setLoading(false);
            return;
          }

          const giftsPromises = bens.map((b) =>
            giftAppGetPublicCompatibleGifts(b.id).then((r) => ({
              beneficiaryId: b.id,
              gifts: r?.gifts || [],
            }))
          );
          const giftsResults = await Promise.all(giftsPromises);
          if (cancelled) return;

          const cache = {};
          giftsResults.forEach(({ beneficiaryId, gifts }) => {
            cache[beneficiaryId] = gifts;
          });

          setCampaign(camp);
          setEmployee(emp);
          setBeneficiaries(bens);
          setGiftsCache(cache);
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          if (err.status === 401) {
            navigate(`/campaign/${slug}/login`);
          } else {
            setLoadError('No fue posible cargar las opciones de regalos.');
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

        if (!emp || emp.status === 'BLOCKED') {
          navigate(`/campaign/${slug}/login`);
          return;
        }
        if (emp.status === 'CONFIRMED') {
          navigate(`/campaign/${slug}/already-confirmed`);
          return;
        }

        const bens = getBeneficiariesByEmployee(emp.id);
        setCampaign(camp);
        setEmployee(emp);
        setBeneficiaries(bens);
        setLoading(false);
      } catch {
        navigate(`/campaign/${slug}/login`);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  const getGiftsForBeneficiary = (beneficiary) => {
    if (!campaign) return [];
    if (USE_BACKEND) {
      return giftsCache[beneficiary.id] || [];
    }
    return getAvailableGiftsForBeneficiary(campaign.id, beneficiary);
  };

  const handleSelectGift = (beneficiaryId, gift) => {
    setSelections((prev) => ({
      ...prev,
      [beneficiaryId]: gift,
    }));
    setDetailGift(null);
  };

  const handleDeselectGift = (beneficiaryId) => {
    setSelections((prev) => {
      const copy = { ...prev };
      delete copy[beneficiaryId];
      return copy;
    });
  };

  const handleGoToSummary = () => {
    const incomplete = beneficiaries.some((b) => !selections[b.id]);
    if (incomplete) {
      setSelectionError('Por favor selecciona un regalo para cada beneficiario antes de continuar.');
      return;
    }

    const selectedItems = beneficiaries.map((b) => ({
      beneficiaryId: b.id,
      giftId: selections[b.id].id,
    }));
    sessionStorage.setItem(
      `giftapp_selections_${slug}`,
      JSON.stringify(selectedItems)
    );
    navigate(`/campaign/${slug}/summary`);
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
            <p style={{ color: 'var(--gray-500)' }}>Cargando beneficiarios y regalos...</p>
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

  if (beneficiaries.length === 0) {
    return (
      <div className="page-wrapper">
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
          <EmptyState
            title="Sin beneficiarios"
            message="No tienes beneficiarios asociados para esta campaña. Si esto es un error, reporta el caso a soporte."
          />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowSupport(true)}
            >
              Reportar Problema
            </button>
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
                        <option value="MISSING_BENEFICIARY">
                          Falta un beneficiario
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
      </div>
    );
  }

  const currentBeneficiary = beneficiaries[activeTab];
  const gifts = currentBeneficiary
    ? getGiftsForBeneficiary(currentBeneficiary)
    : [];

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
        <ProgressStepper currentStep={1} />

        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 4 }}>¡Hola, {employee.fullName}!</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            Tienes {beneficiaries.length}{' '}
            {beneficiaries.length === 1 ? 'beneficiario registrado' : 'beneficiarios registrados'}.
            Selecciona un regalo para cada uno.
          </p>
        </div>

        {campaign.welcomeText && (
          <div className="card" style={{ marginBottom: 16, background: 'var(--gray-50)', borderLeft: `4px solid ${campaign.primaryColor || '#2563eb'}` }}>
            <p style={{ fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>{campaign.welcomeText}</p>
          </div>
        )}

        {campaign.rulesText && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 8, fontSize: '0.9375rem', color: 'var(--gray-700)' }}>Instrucciones</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)', whiteSpace: 'pre-wrap' }}>{campaign.rulesText}</p>
          </div>
        )}

        <div className="tabs">
          {beneficiaries.map((b, i) => (
            <button
              key={b.id}
              className={`tab ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {b.fullName} {selections[b.id] ? '✓' : ''}
            </button>
          ))}
        </div>

        {currentBeneficiary && (
          <div>
            <div
              className="card"
              style={{
                marginBottom: 20,
                display: 'flex',
                gap: 24,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{currentBeneficiary.fullName}</strong>
                <span
                  style={{
                    marginLeft: 12,
                    fontSize: '0.875rem',
                    color: 'var(--gray-500)',
                  }}
                >
                  Edad: {currentBeneficiary.age} | Género:{' '}
                  {currentBeneficiary.gender === 'male' ? 'Masculino' : 'Femenino'}
                </span>
              </div>
              {selections[currentBeneficiary.id] && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--success)',
                      fontWeight: 500,
                    }}
                  >
                    Seleccionado: {selections[currentBeneficiary.id].name}
                  </span>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() =>
                        handleDeselectGift(currentBeneficiary.id)
                      }
                    >
                      Cambiar
                    </button>
                </div>
              )}
            </div>

            {gifts.length === 0 ? (
              <EmptyState
                title="Sin regalos compatibles"
                message="No hay regalos disponibles que coincidan con la edad y género de este beneficiario."
              />
            ) : (
              <div className="gift-grid">
                {gifts.map((gift) => {
                  const isSelected =
                    selections[currentBeneficiary.id]?.id === gift.id;
                  return (
                    <div
                      key={gift.id}
                      className={`gift-card ${isSelected ? 'selected' : ''}`}
                    >
                      <img
                        className="gift-card-image"
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
                      <div className="gift-card-body">
                        <h3>{gift.name}</h3>
                        <div className="ref">{gift.reference}</div>
                        <p>{gift.shortDescription}</p>
                        <div className="gift-card-actions">
                          {isSelected ? (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() =>
                                handleDeselectGift(currentBeneficiary.id)
                              }
                            >
                              Deseleccionar
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() =>
                                handleSelectGift(
                                  currentBeneficiary.id,
                                  gift
                                )
                              }
                            >
                              Seleccionar
                            </button>
                          )}
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setDetailGift(gift)}
                          >
                            Ver Detalle
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                onClick={() => { setSelectionError(''); setActiveTab(Math.max(0, activeTab - 1)); }}
                disabled={activeTab === 0}
              >
                Anterior
              </button>
              {activeTab < beneficiaries.length - 1 ? (
                <button
                  className="btn btn-primary"
                  onClick={() => { setSelectionError(''); setActiveTab(activeTab + 1); }}
                >
                  Siguiente Beneficiario
                </button>
              ) : (
                <button className="btn btn-success" onClick={handleGoToSummary}>
                  Revisar Selección
                </button>
              )}
          </div>
        </div>

        {selectionError && (
          <div
            style={{
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              padding: '12px 16px',
              borderRadius: 6,
              marginTop: 16,
              fontSize: '0.875rem',
              textAlign: 'center',
            }}
          >
            {selectionError}
          </div>
        )}

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

      <GiftDetailModal
        gift={detailGift}
        isOpen={!!detailGift}
        onClose={() => setDetailGift(null)}
        onSelect={(gift) =>
          handleSelectGift(currentBeneficiary.id, gift)
        }
      />
    </div>
  );
}
