import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { giftAppGetPublicCampaignBySlug, USE_BACKEND } from '../../api/giftAppService';

export default function CampaignWelcome() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(USE_BACKEND);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (USE_BACKEND) setLoading(true);

    giftAppGetPublicCampaignBySlug(slug)
      .then((data) => {
        if (cancelled) return;
        setCampaign(data);
        if (USE_BACKEND) setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (USE_BACKEND) {
          setError('Campaña no encontrada.');
          setLoading(false);
        } else {
          setCampaign(null);
        }
      });

    return () => { cancelled = true; };
  }, [slug]);

  if (USE_BACKEND && loading) {
    return (
      <div className="welcome-page">
        <div className="welcome-card">
          <p style={{ color: 'var(--gray-500)' }}>Cargando campaña...</p>
        </div>
      </div>
    );
  }

  if (USE_BACKEND && error) {
    return (
      <div className="welcome-page">
        <div className="welcome-card">
          <h1>Campaña No Encontrada</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="welcome-page">
        <div className="welcome-card">
          <h1>Campaña No Encontrada</h1>
          <p>La campaña que buscas no existe.</p>
        </div>
      </div>
    );
  }

  if (campaign.status !== 'ACTIVE') {
    return (
      <div className="welcome-page">
        <div className="welcome-card">
          {campaign.logoImageUrl && (
            <img src={campaign.logoImageUrl} alt={campaign.logoText || campaign.name} style={{ maxHeight: 80, maxWidth: 200, marginBottom: 16, objectFit: 'contain' }} />
          )}
          <div className="logo-text">{campaign.logoText || 'REGALOS'}</div>
          <h1>{campaign.name}</h1>
          <p>Esta campaña no está disponible actualmente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome-page" style={{ '--primary': campaign.primaryColor || '#2563eb' }}>
      <div className="welcome-card">
        {campaign.bannerImageUrl ? (
          <div style={{ position: 'relative', width: '100%', marginBottom: 16 }}>
            <img src={campaign.bannerImageUrl} alt="banner" style={{ width: '100%', height: 'auto', display: 'block' }} />
            {/* Render simple decoration layers if provided */}
            {(campaign.bannerDecoration?.layers || []).map((layer, idx) => {
              if (layer.type === 'overlay' && layer.imageUrl) {
                const style = { position: 'absolute', pointerEvents: 'none' };
                if (layer.position === 'center') {
                  style.left = '50%';
                  style.top = '50%';
                  style.transform = 'translate(-50%,-50%)';
                } else if (layer.position === 'top-left') {
                  style.left = layer.x ?? 0;
                  style.top = layer.y ?? 0;
                } else if (layer.position === 'bottom-right') {
                  style.right = layer.x ?? 0;
                  style.bottom = layer.y ?? 0;
                } else if (layer.position === 'top-right') {
                  style.right = layer.x ?? 0;
                  style.top = layer.y ?? 0;
                }
                if (layer.width) style.width = layer.width;
                if (layer.opacity !== undefined) style.opacity = layer.opacity;
                return (
                  <img key={idx} src={layer.imageUrl} alt="overlay" style={style} />
                );
              }
              if (layer.type === 'text') {
                const style = { position: 'absolute', color: layer.color || '#fff', fontSize: layer.fontSize || 24, fontWeight: layer.fontWeight || 700 };
                if (layer.position === 'center') {
                  style.left = '50%';
                  style.top = layer.y ?? '50%';
                  style.transform = 'translate(-50%,-50%)';
                  style.textAlign = 'center';
                  style.width = '100%';
                } else {
                  style.left = layer.x ?? 0;
                  style.top = layer.y ?? 0;
                }
                return (
                  <div key={idx} style={style}>{layer.text}</div>
                );
              }
              return null;
            })}
          </div>
        ) : (
          campaign.logoImageUrl && (
            <img src={campaign.logoImageUrl} alt={campaign.logoText || campaign.name} style={{ maxHeight: 80, maxWidth: 200, marginBottom: 16, objectFit: 'contain' }} />
          )
        )}
        <div className="logo-text">{campaign.logoText || 'REGALOS'}</div>
        <h1>{campaign.name}</h1>
        <p>{campaign.welcomeText || '¡Bienvenido a la selección de regalos!'}</p>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate(`/campaign/${slug}/login`)}
        >
          Iniciar Selección
        </button>
      </div>
    </div>
  );
}
