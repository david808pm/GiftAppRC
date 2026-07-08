import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  giftAppGetPublicCampaignBySlug,
  giftAppPublicEmployeeLogin,
  giftAppCreatePublicSupportRequest,
  USE_BACKEND,
} from '../../api/giftAppService';
import ProgressStepper from '../../components/ProgressStepper';
import PrivacyConsent from '../../components/PrivacyConsent';

export default function EmployeeLogin() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [campaignLoading, setCampaignLoading] = useState(USE_BACKEND);
  const [documentId, setDocumentId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [supportData, setSupportData] = useState({ type: '', message: '' });
  const [supportSent, setSupportSent] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (USE_BACKEND) setCampaignLoading(true);

    giftAppGetPublicCampaignBySlug(slug)
      .then((data) => {
        if (cancelled) return;
        setCampaign(data);
        if (USE_BACKEND) setCampaignLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCampaign(null);
        if (USE_BACKEND) setCampaignLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug]);

  if (campaignLoading) {
    return (
      <div className="page-wrapper">
        <div className="page-content container">
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--gray-500)' }}>Cargando campaña...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="page-wrapper">
        <div className="page-content container">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Campaña No Encontrada</h2>
            <p style={{ color: 'var(--gray-500)', marginTop: 8 }}>
              Esta campaña no existe.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (campaign.status !== 'ACTIVE') {
    return (
      <div className="page-wrapper">
        <div className="page-content container">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>Campaña Cerrada</h2>
            <p style={{ color: 'var(--gray-500)', marginTop: 8 }}>
              Esta campaña no está disponible actualmente.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!documentId.trim()) {
      setError('El número de identificación es obligatorio.');
      return;
    }
    if (!/^\d+$/.test(documentId.trim())) {
      setError('El ID debe ser numérico.');
      return;
    }
    if (!consentAccepted) {
      setConsentError('Debes aceptar la política de privacidad y términos para continuar.');
      setError('');
      return;
    }

    setConsentError('');
    setSubmitting(true);
    try {
      const result = await giftAppPublicEmployeeLogin(slug, documentId.trim());

      if (result.alreadyConfirmed) {
        if (result.accessToken) {
          sessionStorage.setItem(
            `giftapp_session_${slug}`,
            JSON.stringify({
              employeeId: result.employee.id,
              documentId: result.employee.documentId,
              campaignId: result.campaign.id,
            })
          );
        }
        navigate(`/campaign/${slug}/already-confirmed`, {
          state: { employeeId: result.employee.id, documentId: result.employee.documentId },
        });
        return;
      }

      sessionStorage.setItem(
        `giftapp_session_${slug}`,
        JSON.stringify({
          employeeId: result.employee.id,
          documentId: result.employee.documentId,
          campaignId: result.campaign.id,
        })
      );

      navigate(`/campaign/${slug}/select`);
    } catch (err) {
      setError(err.message || 'Error al validar la información.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    if (!supportData.type || !supportData.message.trim()) {
      return;
    }
    setSupportSubmitting(true);
    setSupportError('');
    try {
      await giftAppCreatePublicSupportRequest({
        campaignId: campaign.id,
        documentId: documentId.trim() || undefined,
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
        <ProgressStepper currentStep={0} />

        <div className="login-box">
          <div className="card">
            <h2>Identifícate</h2>
            <p
              style={{
                textAlign: 'center',
                color: 'var(--gray-500)',
                marginBottom: 24,
                fontSize: '0.875rem',
              }}
            >
              Ingresa tu número de identificación para acceder a la selección de regalos.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Número de Identificación</label>
                <input
                  type="text"
                  value={documentId}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setError('');
                  }}
                  placeholder="ej. 1001"
                  autoFocus
                  disabled={submitting}
                />
                {error && <p className="form-error">{error}</p>}
              </div>
              <PrivacyConsent
                checked={consentAccepted}
                onChange={(value) => {
                  setConsentAccepted(value);
                  if (value) setConsentError('');
                }}
                error={consentError}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={submitting}
              >
                {submitting ? 'Validando...' : 'Continuar'}
              </button>
            </form>

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setShowSupport(!showSupport)}
              >
                Reportar un Problema
              </button>
            </div>

            {showSupport && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: '1px solid var(--gray-200)',
                }}
              >
                {supportSent ? (
                  <p style={{ color: 'var(--success)', textAlign: 'center' }}>
                    Tu reporte ha sido enviado. Lo revisaremos pronto.
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
                          <option value="NOT_FOUND">
                            No aparezco en el sistema
                          </option>
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
        </div>
      </div>
    </div>
  );
}
