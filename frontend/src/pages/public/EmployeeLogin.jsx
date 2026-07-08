import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  giftAppGetPublicCampaignBySlug,
  giftAppPublicEmployeeLogin,
  giftAppPublicRequestOtpCode,
  giftAppPublicVerifyOtpCode,
  giftAppCreatePublicSupportRequest,
  USE_BACKEND,
} from '../../api/giftAppService';
import ProgressStepper from '../../components/ProgressStepper';
import PrivacyConsent from '../../components/PrivacyConsent';

const RESEND_COOLDOWN = 60;

export default function EmployeeLogin() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [campaignLoading, setCampaignLoading] = useState(USE_BACKEND);
  const [documentId, setDocumentId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [cooldown, setCooldown] = useState(0);
  const [showSupport, setShowSupport] = useState(false);
  const [supportData, setSupportData] = useState({ type: '', message: '' });
  const [supportSent, setSupportSent] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentError, setConsentError] = useState('');

  const otpEnabled = campaign?.otpEnabled === true;

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

  // Client-side resend cooldown timer.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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

  // Shared: store the public employee token + sessionStorage, then navigate
  // exactly as the classic login does (alreadyConfirmed → already-confirmed,
  // otherwise → select).
  const handleLoginResult = (result) => {
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
  };

  // ── Classic documentId-only login (otpEnabled === false) ─────

  const handleClassicSubmit = async (e) => {
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
      handleLoginResult(result);
    } catch (err) {
      setError(err.message || 'Error al validar la información.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── OTP flow — Step 1: request code ──────────────────────────

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!documentId.trim()) {
      setError('El número de identificación es obligatorio.');
      return;
    }
    if (!/^\d+$/.test(documentId.trim())) {
      setError('El ID debe ser numérico.');
      return;
    }

    setSubmitting(true);
    try {
      await giftAppPublicRequestOtpCode(slug, documentId.trim());
      setInfo(
        'Revisa tu correo electrónico. Te enviamos un código de 6 dígitos para continuar.'
      );
      setStep(2);
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.message || 'No fue posible enviar el código.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── OTP flow — Step 2: verify code ───────────────────────────

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!/^\d{6}$/.test(code.trim())) {
      setError('El código debe ser exactamente 6 dígitos.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await giftAppPublicVerifyOtpCode(
        slug,
        documentId.trim(),
        code.trim()
      );
      handleLoginResult(result);
    } catch (err) {
      setError(err.message || 'Error al verificar el código.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── OTP flow — Resend code ───────────────────────────────────

  const handleResendCode = async () => {
    if (cooldown > 0 || submitting) return;
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      await giftAppPublicRequestOtpCode(slug, documentId.trim());
      setInfo('Reenviamos el código a tu correo electrónico.');
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.message || 'No fue posible reenviar el código.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Back to step 1 ───────────────────────────────────────────

  const handleBackToDocument = () => {
    setStep(1);
    setCode('');
    setError('');
    setInfo('');
    setCooldown(0);
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

  // ── Render helpers ──────────────────────────────────────────

  const renderSupportForm = () => (
    <div style={{ marginTop: 20, textAlign: 'center' }}>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setShowSupport(!showSupport)}
      >
        Reportar un Problema
      </button>
    </div>
  );

  const renderSupportPanel = () => {
    if (!showSupport) return null;
    return (
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
    );
  };

  // ── OTP flow — Step 2 (code input) ──────────────────────────
  const renderOtpStep2 = () => (
    <form onSubmit={handleVerifyCode}>
      <div className="form-group">
        <label>Código de 6 dígitos</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
          placeholder="ej. 834921"
          autoFocus
          disabled={submitting}
          style={{ letterSpacing: 4, textAlign: 'center', fontSize: '1.25rem' }}
        />
        {error && <p className="form-error">{error}</p>}
      </div>
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: '100%' }}
        disabled={submitting}
      >
        {submitting ? 'Verificando...' : 'Continuar'}
      </button>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleBackToDocument}
          disabled={submitting}
        >
          Volver
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleResendCode}
          disabled={cooldown > 0 || submitting}
        >
          {cooldown > 0
            ? `Reenviar en ${cooldown}s`
            : 'Reenviar código'}
        </button>
      </div>
    </form>
  );

  // ── Document input (used by both classic and OTP step 1) ────
  const renderDocumentForm = () => {
    const isOtp = otpEnabled;
    return (
      <form onSubmit={isOtp ? handleRequestCode : handleClassicSubmit}>
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
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={submitting}
        >
          {submitting
            ? isOtp
              ? 'Enviando...'
              : 'Validando...'
            : isOtp
            ? 'Enviar código'
            : 'Continuar'}
        </button>
      </form>
    );
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
              {otpEnabled && step === 2
                ? 'Ingresa el código de 6 dígitos que enviamos a tu correo.'
                : otpEnabled
                ? 'Ingresa tu número de identificación y te enviaremos un código a tu correo registrado.'
                : 'Ingresa tu número de identificación para acceder a la selección de regalos.'}
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
                  textAlign: 'center',
                  color: 'var(--success)',
                  marginBottom: 16,
                  fontSize: '0.875rem',
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

            {otpEnabled && step === 2
              ? renderOtpStep2()
              : renderDocumentForm()}

            {renderSupportForm()}
            {renderSupportPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
