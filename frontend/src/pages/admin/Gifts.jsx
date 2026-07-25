import { useState, useEffect, useRef } from 'react';
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
  giftAppDeleteGiftImage,
  giftAppDeleteAllGiftImages,
  giftAppSetPrimaryGiftImage,
  giftAppReplaceGiftImage,
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
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [imageDeleteTarget, setImageDeleteTarget] = useState(null);
  const [imageDeleteAllConfirm, setImageDeleteAllConfirm] = useState(false);
  const [replacingImageId, setReplacingImageId] = useState(null);
  const [imageActionLoading, setImageActionLoading] = useState(false);
  const replaceFileInputRef = useRef(null);

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
    setSelectedImages([]);
    setImagePreviews([]);
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
    setSelectedImages([]);
    setImagePreviews([]);
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
    };

    if (!editing) {
      giftData.imageUrls = form.imageUrls
        ? form.imageUrls.split(',').map((u) => u.trim()).filter(Boolean)
        : [];
    } else {
      delete giftData.imageUrls;
    }

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

      // Upload images if files were selected
      if (selectedImages.length > 0 && USE_BACKEND) {
        setUploading(true);
        try {
          await giftAppUploadGiftImage(giftId, selectedImages);
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
    const files = Array.from(e.target.files || []);
    setImageError('');

    if (files.length === 0) {
      return;
    }

    const existingCount = editing ? (editing.imageUrls?.length || 0) : 0;
    const maxAllowed = 3 - existingCount;

    if (existingCount >= 3) {
      setImageError('Un regalo puede tener máximo 3 imágenes.');
      e.target.value = '';
      return;
    }

    if (files.length > maxAllowed) {
      setImageError(
        `Solo puedes agregar ${maxAllowed} imagen(es) más. Ya tienes ${existingCount}.`,
      );
      e.target.value = '';
      return;
    }

    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setImageError('Tipo de archivo no permitido. Use: JPEG, PNG o WebP.');
        e.target.value = '';
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError('El archivo excede el tamaño máximo de 2MB.');
        e.target.value = '';
        return;
      }
    }

    setSelectedImages(files);

    const newPreviews = [];
    let loaded = 0;
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews[i] = ev.target.result;
        loaded++;
        if (loaded === files.length) {
          setImagePreviews([...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const reloadGift = async (giftId) => {
    clearCache('gifts_all');
    const allGifts = await giftAppGetGifts();
    setGifts(allGifts);
    const updated = allGifts.find((g) => g.id === giftId);
    if (updated) {
      setEditing({
        ...updated,
        stock: String(updated.stock),
        minAge: String(updated.minAge),
        maxAge: String(updated.maxAge),
      });
    }
  };

  const handleDeleteSingleImage = async () => {
    if (!imageDeleteTarget || !editing) return;
    setImageActionLoading(true);
    try {
      await giftAppDeleteGiftImage(editing.id, imageDeleteTarget.id);
      setImageDeleteTarget(null);
      await reloadGift(editing.id);
      addToast('Imagen eliminada.');
    } catch (err) {
      addToast(err.message || 'Error al eliminar la imagen.', 'error');
    } finally {
      setImageActionLoading(false);
    }
  };

  const handleDeleteAllImages = async () => {
    if (!editing) return;
    setImageActionLoading(true);
    try {
      await giftAppDeleteAllGiftImages(editing.id);
      setImageDeleteAllConfirm(false);
      await reloadGift(editing.id);
      addToast('Todas las imágenes fueron eliminadas.');
    } catch (err) {
      addToast(err.message || 'Error al eliminar las imágenes.', 'error');
    } finally {
      setImageActionLoading(false);
    }
  };

  const handleSetPrimaryImage = async (imageId) => {
    if (!editing) return;
    setImageActionLoading(true);
    try {
      await giftAppSetPrimaryGiftImage(editing.id, imageId);
      await reloadGift(editing.id);
      addToast('Imagen principal actualizada.');
    } catch (err) {
      addToast(err.message || 'Error al cambiar la imagen principal.', 'error');
    } finally {
      setImageActionLoading(false);
    }
  };

  const handleReplaceImageClick = (imageId) => {
    setReplacingImageId(imageId);
    replaceFileInputRef.current?.click();
  };

  const handleReplaceImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !replacingImageId || !editing) {
      setReplacingImageId(null);
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      addToast('Tipo de archivo no permitido. Use: JPEG, PNG o WebP.', 'error');
      setReplacingImageId(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      addToast('El archivo excede el tamaño máximo de 2MB.', 'error');
      setReplacingImageId(null);
      e.target.value = '';
      return;
    }

    setImageActionLoading(true);
    try {
      await giftAppReplaceGiftImage(editing.id, replacingImageId, file);
      setReplacingImageId(null);
      e.target.value = '';
      await reloadGift(editing.id);
      addToast('Imagen reemplazada.');
    } catch (err) {
      addToast(err.message || 'Error al reemplazar la imagen.', 'error');
    } finally {
      setImageActionLoading(false);
    }
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
        {/* ── Image Manager (edit mode only) ── */}
        {editing ? (
          <div className="form-group">
            <label>
              Imágenes del regalo ({editing.imageUrls?.length || 0} de 3)
            </label>

            {/* Current images grid */}
            {editing.imageUrls?.length > 0 ? (
              <div className="image-manager-grid">
                {editing.imageUrls.map((url, idx) => {
                  const imgId = editing.images?.[idx]?.id || idx;
                  const isPrimary = editing.images?.[idx]?.isPrimary || idx === 0;
                  return (
                    <div key={idx} className={`image-manager-card${isPrimary ? ' image-manager-card--primary' : ''}`}>
                      <div className="image-manager-thumb">
                        <img
                          src={url}
                          alt={`Imagen ${idx + 1}`}
                          onError={(e) => {
                            e.target.src = 'https://placehold.co/120x120/CCCCCC/666?text=Error';
                          }}
                        />
                        {isPrimary && (
                          <span className="image-manager-primary-badge">Principal</span>
                        )}
                      </div>
                      <div className="image-manager-actions">
                        {!isPrimary && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleSetPrimaryImage(imgId)}
                            disabled={imageActionLoading}
                            title="Marcar como principal"
                          >
                            Principal
                          </button>
                        )}
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleReplaceImageClick(imgId)}
                          disabled={imageActionLoading}
                          title="Reemplazar imagen"
                        >
                          Reemplazar
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setImageDeleteTarget({ id: imgId, imageUrl: url })}
                          disabled={imageActionLoading}
                          title="Eliminar imagen"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginTop: 4 }}>
                Este regalo no tiene imágenes.
              </p>
            )}

            {/* Delete all button */}
            {editing.imageUrls?.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setImageDeleteAllConfirm(true)}
                disabled={imageActionLoading}
                style={{ marginTop: 12 }}
              >
                Eliminar todas las imágenes
              </button>
            )}

            {/* Add images button (when < 3) */}
            {editing.imageUrls?.length < 3 && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: 4, display: 'block' }}>
                  Agregar {3 - editing.imageUrls.length} imagen(es) más
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageSelect}
                  disabled={saving || uploading || imageActionLoading}
                />
                {selectedImages.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {selectedImages.map((file, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          fontSize: '0.8125rem',
                          color: 'var(--gray-600)',
                          marginBottom: 8,
                        }}
                      >
                        {imagePreviews[i] ? (
                          <img
                            src={imagePreviews[i]}
                            alt={file.name}
                            style={{
                              width: 60,
                              height: 60,
                              objectFit: 'cover',
                              borderRadius: 6,
                              border: '1px solid var(--gray-200)',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 60,
                              height: 60,
                              borderRadius: 6,
                              border: '1px solid var(--gray-200)',
                              background: 'var(--gray-100)',
                            }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>
                            {file.name}
                          </div>
                          <div>{(file.size / 1024).toFixed(1)} KB</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {imageError && <p className="form-error">{imageError}</p>}
          </div>
        ) : (
          <>
            {/* ── Create mode: simple file upload ── */}
            <div className="form-group">
              <label>Subir Imagen desde Computador (máx 3)</label>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageSelect}
                disabled={saving || uploading}
              />
              {selectedImages.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {selectedImages.map((file, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontSize: '0.8125rem',
                        color: 'var(--gray-600)',
                        marginBottom: 8,
                      }}
                    >
                      {imagePreviews[i] ? (
                        <img
                          src={imagePreviews[i]}
                          alt={file.name}
                          style={{
                            width: 60,
                            height: 60,
                            objectFit: 'cover',
                            borderRadius: 6,
                            border: '1px solid var(--gray-200)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 60,
                            height: 60,
                            borderRadius: 6,
                            border: '1px solid var(--gray-200)',
                            background: 'var(--gray-100)',
                          }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 500, wordBreak: 'break-all' }}>
                          {file.name}
                        </div>
                        <div>{(file.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {imageError && <p className="form-error">{imageError}</p>}
            </div>
          </>
        )}

        {/* External URLs textarea — informational in edit, editable in create */}
        {!editing && (
          <div className="form-group">
            <label>O URLs de Imágenes Externas (separadas por coma)</label>
            <textarea
              value={form.imageUrls}
              onChange={(e) => updateField('imageUrls', e.target.value)}
              placeholder="https://ejemplo.com/imagen1.jpg, https://ejemplo.com/imagen2.jpg"
            />
          </div>
        )}

        {/* Hidden file input for replace operations */}
        <input
          ref={replaceFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleReplaceImageFile}
        />
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

      <ConfirmDialog
        isOpen={!!imageDeleteTarget}
        title="Eliminar Imagen"
        message="¿Estás seguro de que deseas eliminar esta imagen?"
        confirmText="Eliminar"
        danger
        loading={imageActionLoading}
        onConfirm={handleDeleteSingleImage}
        onCancel={() => setImageDeleteTarget(null)}
      />

      <ConfirmDialog
        isOpen={imageDeleteAllConfirm}
        title="Eliminar Todas las Imágenes"
        message="¿Estás seguro de que deseas eliminar TODAS las imágenes de este regalo? Esta acción no se puede deshacer."
        confirmText="Eliminar todas"
        danger
        loading={imageActionLoading}
        onConfirm={handleDeleteAllImages}
        onCancel={() => setImageDeleteAllConfirm(false)}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
