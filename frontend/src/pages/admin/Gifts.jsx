import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  validateRequired,
  validateGiftStock,
  validateAgeRange,
} from '../../utils/validators';
import {
  giftAppGetGifts,
  giftAppCreateGift,
  giftAppUpdateGift,
  giftAppDeleteGift,
  giftAppGetCampaigns,
  giftAppUploadGiftImage,
  USE_BACKEND,
} from '../../api/giftAppService';
import Modal from '../../components/Modal';
import Toast, { useToast } from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { clearCache } from '../../utils/simpleCache';

const EMPTY_GIFT = {
  campaignId: '',
  name: '',
  reference: '',
  shortDescription: '',
  technicalDescription: '',
  dimensions: '',
  stock: '0',
  minAge: '0',
  maxAge: '13',
  allowedGender: 'all',
  imageUrls: '',
  status: 'ACTIVE',
};

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

export default function Gifts() {
  const { isReadOnly } = useOutletContext() || {};
  const [gifts, setGifts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_GIFT);
  const [errors, setErrors] = useState({});
  const { toasts, addToast, removeToast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(USE_BACKEND);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState('');

  const loadData = async () => {
    if (USE_BACKEND) {
      setLoading(true);
      setError(null);
    }
    try {
      const [giftsData, campaignsData] = await Promise.all([
        giftAppGetGifts(),
        giftAppGetCampaigns(),
      ]);
      setGifts(giftsData);
      setCampaigns(campaignsData);
    } catch {
      if (USE_BACKEND) {
        setError('No fue posible cargar los regalos.');
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

  const filtered = gifts.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.reference.toLowerCase().includes(search.toLowerCase());
    const matchesCampaign = !filterCampaign || String(g.campaignId) === filterCampaign;
    return matchesSearch && matchesCampaign;
  });

  const getCampaignName = (id) => {
    return campaigns.find((c) => String(c.id) === String(id))?.name || id;
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_GIFT, campaignId: campaigns[0]?.id || '' });
    setErrors({});
    setSelectedImage(null);
    setImagePreview(null);
    setImageError('');
    setShowModal(true);
  };

  const openEdit = (gift) => {
    setEditing(gift);
    setForm({
      ...gift,
      stock: String(gift.stock),
      minAge: String(gift.minAge),
      maxAge: String(gift.maxAge),
      imageUrls: (gift.imageUrls || []).join(', '),
    });
    setErrors({});
    setSelectedImage(null);
    setImagePreview(null);
    setImageError('');
    setShowModal(true);
  };

  const validate = () => {
    const errs = {};
    const nameErr = validateRequired(form.name, 'Nombre');
    if (nameErr) errs.name = nameErr;
    const refErr = validateRequired(form.reference, 'Referencia');
    if (refErr) errs.reference = refErr;
    if (!form.campaignId) errs.campaignId = 'La campaña es obligatoria.';
    const stockErr = validateGiftStock(form.stock);
    if (stockErr) errs.stock = stockErr;
    const ageErr = validateAgeRange(form.minAge, form.maxAge);
    if (ageErr) errs.maxAge = ageErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const giftData = {
      ...form,
      stock: Number(form.stock),
      minAge: Number(form.minAge),
      maxAge: Number(form.maxAge),
      imageUrls: form.imageUrls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
    };

    setSaving(true);
    try {
      let giftId;
      if (editing) {
        await giftAppUpdateGift(editing.id, giftData);
        giftId = editing.id;
      } else {
        const created = await giftAppCreateGift(giftData);
        giftId = created.id;
      }

      // Upload image if a file was selected
      if (selectedImage && USE_BACKEND) {
        setUploading(true);
        try {
          await giftAppUploadGiftImage(giftId, selectedImage);
        } catch (uploadErr) {
          addToast(
            'Regalo guardado, pero no se pudo subir la imagen: ' +
              (uploadErr.message || 'Error desconocido'),
            'warning',
          );
        } finally {
          setUploading(false);
        }
      }

      clearCache('gifts_all');
      await loadData();
      setShowModal(false);
      addToast(editing ? 'Regalo actualizado.' : 'Regalo creado.');
    } catch (err) {
      addToast(err.message || 'Error al guardar el regalo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await giftAppDeleteGift(deleteTarget.id);
      await loadData();
      setDeleteTarget(null);
      if (result && result.softDeleted) {
        addToast('Este regalo tiene selecciones confirmadas. Se marcó como inactivo.', 'warning');
      } else {
        addToast('Regalo eliminado.');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    setImageError('');

    if (!file) {
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Tipo de archivo no permitido. Use: JPEG, PNG o WebP.');
      setSelectedImage(null);
      setImagePreview(null);
      e.target.value = '';
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('El archivo excede el tamaño máximo de 2MB.');
      setSelectedImage(null);
      setImagePreview(null);
      e.target.value = '';
      return;
    }

    setSelectedImage(file);

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  if (USE_BACKEND && loading) {
    return (
      <div>
        <div className="admin-topbar"><h1>Regalos</h1></div>
        <div className="admin-body">
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9375rem' }}>
            Cargando regalos...
          </p>
        </div>
      </div>
    );
  }

  if (USE_BACKEND && error) {
    return (
      <div>
        <div className="admin-topbar"><h1>Regalos</h1></div>
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
        <h1>Regalos</h1>
        {!isReadOnly && (
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            + Nuevo Regalo
          </button>
        )}
      </div>
      <div className="admin-body">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Buscar por nombre o referencia..."
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
          <EmptyState title="Sin regalos" message="Agrega tu primer regalo." />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Imagen</th>
                  <th>Nombre</th>
                  <th>Referencia</th>
                  <th>Campaña</th>
                  <th>Stock</th>
                  <th>Edad</th>
                  <th>Género</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <img
                        src={
                          g.imageUrls?.[0] ||
                          'https://placehold.co/48x48/CCCCCC/666?text='
                        }
                        alt={g.name}
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: 'cover',
                          borderRadius: 4,
                        }}
                        onError={(e) => {
                          e.target.src =
                            'https://placehold.co/48x48/CCCCCC/666?text=';
                        }}
                      />
                    </td>
                    <td style={{ fontWeight: 500 }}>{g.name}</td>
                    <td><code>{g.reference}</code></td>
                    <td>{getCampaignName(g.campaignId)}</td>
                    <td>{g.stock}</td>
                    <td>{g.minAge}-{g.maxAge}</td>
                    <td style={{ textTransform: 'capitalize' }}>{g.allowedGender === 'all' ? 'Todos' : g.allowedGender === 'male' ? 'Masculino' : 'Femenino'}</td>
                    <td>
                      <span className={`badge badge-${g.status.toLowerCase()}`}>
                        {g.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      {!isReadOnly && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEdit(g)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeleteTarget(g)}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Editar Regalo' : 'Nuevo Regalo'}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading}>
              {uploading ? 'Subiendo imagen...' : saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Campaña</label>
          <select
            value={form.campaignId}
            onChange={(e) => updateField('campaignId', e.target.value)}
          >
            <option value="">Seleccionar campaña</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.campaignId && <p className="form-error">{errors.campaignId}</p>}
        </div>
        <div className="form-group">
          <label>Nombre</label>
          <input
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        <div className="form-group">
          <label>Referencia</label>
          <input
            value={form.reference}
            onChange={(e) => updateField('reference', e.target.value)}
            placeholder="ej. GFT-001"
          />
          {errors.reference && <p className="form-error">{errors.reference}</p>}
        </div>
        <div className="form-group">
          <label>Descripción Corta</label>
          <textarea
            value={form.shortDescription}
            onChange={(e) => updateField('shortDescription', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Descripción Técnica</label>
          <textarea
            value={form.technicalDescription}
            onChange={(e) => updateField('technicalDescription', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Dimensiones</label>
          <input
            value={form.dimensions}
            onChange={(e) => updateField('dimensions', e.target.value)}
            placeholder="ej. 30cm x 15cm x 10cm"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Stock</label>
            <input
              type="number"
              min="0"
              value={form.stock}
              onChange={(e) => updateField('stock', e.target.value)}
            />
            {errors.stock && <p className="form-error">{errors.stock}</p>}
          </div>
          <div className="form-group">
            <label>Edad Mín</label>
            <input
              type="number"
              min="0"
              max="13"
              value={form.minAge}
              onChange={(e) => updateField('minAge', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Edad Máx</label>
            <input
              type="number"
              min="0"
              max="13"
              value={form.maxAge}
              onChange={(e) => updateField('maxAge', e.target.value)}
            />
            {errors.maxAge && <p className="form-error">{errors.maxAge}</p>}
          </div>
        </div>
        <div className="form-group">
          <label>Género Permitido</label>
          <select
            value={form.allowedGender}
            onChange={(e) => updateField('allowedGender', e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="male">Masculino</option>
            <option value="female">Femenino</option>
          </select>
        </div>
        <div className="form-group">
          <label>Estado</label>
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          >
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </div>
        <div className="form-group">
          <label>Subir Imagen desde Computador</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageSelect}
            disabled={saving || uploading}
          />
          {selectedImage && (
            <div style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--gray-600)' }}>
              <span>{selectedImage.name}</span>
              {' — '}
              <span>{(selectedImage.size / 1024).toFixed(1)} KB</span>
            </div>
          )}
          {imageError && <p className="form-error">{imageError}</p>}
          {imagePreview && (
            <div style={{ marginTop: 8 }}>
              <img
                src={imagePreview}
                alt="Previsualización"
                style={{
                  maxWidth: 200,
                  maxHeight: 200,
                  objectFit: 'contain',
                  borderRadius: 6,
                  border: '1px solid var(--gray-200)',
                }}
              />
            </div>
          )}
        </div>
        <div className="form-group">
          <label>O URLs de Imágenes Externas (separadas por coma)</label>
          <textarea
            value={form.imageUrls}
            onChange={(e) => updateField('imageUrls', e.target.value)}
            placeholder="https://ejemplo.com/imagen1.jpg, https://ejemplo.com/imagen2.jpg"
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar Regalo"
        message={`¿Estás seguro de que deseas eliminar "${deleteTarget?.name}"?`}
        confirmText="Eliminar"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
