import { useState } from 'react';
import Modal from './Modal';

export default function GiftDetailModal({ gift, isOpen, onClose, onSelect }) {
  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  if (!gift) return null;

  const images =
    gift.imageUrls && gift.imageUrls.length > 0
      ? gift.imageUrls
      : ['https://placehold.co/400x400/CCCCCC/666?text=No+Image'];

  const activeImageUrl = images[activeImage] || images[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={gift.name}
      className="gift-detail-modal"
    >
      <div className="gift-detail-gallery">
        {images.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`${gift.name} ${i + 1}`}
            onClick={() => {
              setActiveImage(i);
              setZoomed(false);
            }}
            className={i === activeImage ? 'is-active' : ''}
            style={{
              border:
                i === activeImage
                  ? '2px solid var(--primary)'
                  : '1px solid var(--gray-200)',
              cursor: 'pointer',
            }}
            onError={(e) => {
              e.target.src =
                'https://placehold.co/400x400/CCCCCC/666?text=No+Image';
            }}
          />
        ))}
      </div>

      <div className="gift-detail-preview-wrap">
        <img
          src={activeImageUrl}
          alt={`${gift.name} principal`}
          className="gift-detail-preview"
          onClick={() => setZoomed(true)}
          title="Click para ampliar"
          onError={(e) => {
            e.target.src =
              'https://placehold.co/400x400/CCCCCC/666?text=No+Image';
          }}
        />
      </div>

      <div
        className={`gift-image-lightbox ${zoomed ? 'is-open' : ''}`}
        onClick={() => setZoomed(false)}
        aria-hidden={!zoomed}
      >
        <img
          src={activeImageUrl}
          alt={`${gift.name} ampliado`}
          onError={(e) => {
            e.target.src =
              'https://placehold.co/400x400/CCCCCC/666?text=No+Image';
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <span className="ref" style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>
          Ref: {gift.reference}
        </span>
      </div>

      <p style={{ color: 'var(--gray-600)', marginBottom: 12 }}>
        {gift.shortDescription}
      </p>

      {gift.technicalDescription && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 4 }}>
            Descripción Técnica
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>
            {gift.technicalDescription}
          </p>
        </div>
      )}

      <div className="gift-detail-specs">
        {gift.dimensions && (
          <div className="gift-detail-spec">
            <label>Dimensiones</label>
            <span>{gift.dimensions}</span>
          </div>
        )}
        <div className="gift-detail-spec">
          <label>Rango de Edad</label>
          <span>
            {gift.minAge} - {gift.maxAge} años
          </span>
        </div>
        <div className="gift-detail-spec">
          <label>Género</label>
          <span style={{ textTransform: 'capitalize' }}>
            {gift.allowedGender === 'all' ? 'Todos' : gift.allowedGender === 'male' ? 'Masculino' : 'Femenino'}
          </span>
        </div>
      </div>

      <div className="gift-detail-actions" style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-outline" onClick={onClose}>
          Cerrar
        </button>
        <button className="btn btn-primary" onClick={() => onSelect(gift)}>
          Seleccionar este regalo
        </button>
      </div>
    </Modal>
  );
}
