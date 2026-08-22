import React, { useState } from 'react';

export default function BannerEditor({ decoration: initialDecoration, bannerImageUrl, onChange }) {
    const decoration = initialDecoration || { layers: [] };
    const [selected, setSelected] = useState(null);

    function commit(nextDecoration) {
        if (onChange) onChange(nextDecoration);
    }

    function addTextLayer() {
        const layer = {
            type: 'text',
            text: 'Nuevo texto',
            fontSize: 32,
            color: '#ffffff',
            position: 'center',
            x: 0,
            y: 0,
        };
        commit({ ...decoration, layers: [...decoration.layers, layer] });
        setSelected(decoration.layers.length);
    }

    function addOverlayLayer() {
        const layer = {
            type: 'overlay',
            imageUrl: '',
            position: 'center',
            x: 0,
            y: 0,
            width: '50%',
            opacity: 1,
        };
        commit({ ...decoration, layers: [...decoration.layers, layer] });
        setSelected(decoration.layers.length);
    }

    function updateLayer(idx, patch) {
        const layers = decoration.layers.map((l, i) => (i === idx ? { ...l, ...patch } : l));
        commit({ ...decoration, layers });
    }

    function removeLayer(idx) {
        commit({
            ...decoration,
            layers: decoration.layers.filter((_, i) => i !== idx),
        });
        setSelected(null);
    }

    const selectedLayer = selected !== null ? decoration.layers[selected] : null;

    return (
        <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={addTextLayer} type="button">+ Texto</button>
                    <button className="btn btn-outline btn-sm" onClick={addOverlayLayer} type="button" style={{ marginLeft: 8 }}>+ Imagen</button>
                </div>

                <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ position: 'relative', background: '#111', minHeight: 160, height: 240 }}>
                        {bannerImageUrl ? (
                            <img src={bannerImageUrl} alt="banner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                            <div style={{ color: '#888', padding: 24 }}>Sin imagen de banner. Se mostrará el logo si no existe.</div>
                        )}

                        {(decoration.layers || []).map((layer, idx) => {
                            const common = { position: 'absolute', pointerEvents: 'none' };
                            if (layer.position === 'center') {
                                Object.assign(common, { left: '50%', top: layer.y || '50%', transform: 'translate(-50%,-50%)' });
                            } else {
                                Object.assign(common, { left: layer.x || 0, top: layer.y || 0 });
                            }

                            if (layer.type === 'overlay') {
                                if (!layer.imageUrl) return null;
                                const style = { ...common, width: layer.width || 'auto', opacity: layer.opacity ?? 1 };
                                return <img key={idx} src={layer.imageUrl} alt="overlay" style={style} />;
                            }

                            if (layer.type === 'text') {
                                const style = { ...common, color: layer.color || '#fff', fontSize: layer.fontSize || 24, fontWeight: layer.fontWeight || 700 };
                                return <div key={idx} style={style}>{layer.text}</div>;
                            }

                            return null;
                        })}
                    </div>
                </div>

                <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: '8px 0' }}>Capas</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(decoration.layers || []).map((l, idx) => (
                            <div key={idx} style={{ border: selected === idx ? '1px solid var(--primary)' : '1px solid #eee', padding: 8, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ cursor: 'pointer' }} onClick={() => setSelected(idx)}>
                                    <strong>{l.type}</strong> {l.type === 'text' ? `- "${String(l.text).slice(0, 20)}"` : l.imageUrl ? '- imagen' : '- sin imagen'}
                                </div>
                                <div>
                                    <button className="btn btn-outline btn-sm" onClick={() => setSelected(idx)} type="button">Editar</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => removeLayer(idx)} type="button" style={{ marginLeft: 6 }}>Eliminar</button>
                                </div>
                            </div>
                        ))}
                        {(decoration.layers || []).length === 0 && (
                            <div style={{ color: '#777' }}>No hay capas añadidas.</div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ width: 320 }}>
                <h4 style={{ marginTop: 0 }}>Editor de capa</h4>
                {!selectedLayer && <div style={{ color: '#777' }}>Selecciona una capa para editarla.</div>}
                {selectedLayer && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div>
                            <label style={{ fontSize: 12, color: '#666' }}>Tipo (selecciona el elemento)</label>
                            <div>{selectedLayer.type}</div>
                        </div>

                        {selectedLayer.type === 'text' && (
                            <>
                                <label>Texto (ingresa el texto a mostrar)</label>
                                <input value={selectedLayer.text} onChange={(e) => updateLayer(selected, { text: e.target.value })} />
                                <label>Color (elige un color)</label>
                                <input value={selectedLayer.color} onChange={(e) => updateLayer(selected, { color: e.target.value })} />
                                <label>Tamaño (indica el tamaño del texto)</label>
                                <input type="number" value={selectedLayer.fontSize} onChange={(e) => updateLayer(selected, { fontSize: Number(e.target.value) })} />
                                <label>Posición (selecciona la alineación)</label>
                                <select value={selectedLayer.position || 'center'} onChange={(e) => updateLayer(selected, { position: e.target.value })}>
                                    <option value="center">Centro</option>
                                    <option value="top-left">Arriba izquierda</option>
                                    <option value="top-right">Arriba derecha</option>
                                    <option value="bottom-right">Abajo derecha</option>
                                </select>
                                <label>X (posición horizontal)</label>
                                <input type="number" value={selectedLayer.x || 0} onChange={(e) => updateLayer(selected, { x: Number(e.target.value) })} />
                                <label>Y (posición vertical)</label>
                                <input type="number" value={selectedLayer.y || 0} onChange={(e) => updateLayer(selected, { y: Number(e.target.value) })} />
                            </>
                        )}

                        {selectedLayer.type === 'overlay' && (
                            <>
                                <label>URL imagen (pega una URL válida)</label>
                                <input value={selectedLayer.imageUrl || ''} onChange={(e) => updateLayer(selected, { imageUrl: e.target.value })} placeholder="https://..." />
                                <label>Ancho (px o %) (indica el ancho)</label>
                                <input value={selectedLayer.width || ''} onChange={(e) => updateLayer(selected, { width: e.target.value })} placeholder="50%" />
                                <label>Opacidad (0-1) (usa un valor entre 0 y 1)</label>
                                <input type="number" step="0.1" min="0" max="1" value={selectedLayer.opacity ?? 1} onChange={(e) => updateLayer(selected, { opacity: Number(e.target.value) })} />
                                <label>Posición (selecciona la alineación)</label>
                                <select value={selectedLayer.position || 'center'} onChange={(e) => updateLayer(selected, { position: e.target.value })}>
                                    <option value="center">Centro</option>
                                    <option value="top-left">Arriba izquierda</option>
                                    <option value="top-right">Arriba derecha</option>
                                    <option value="bottom-right">Abajo derecha</option>
                                </select>
                                <label>X (posición horizontal)</label>
                                <input type="number" value={selectedLayer.x || 0} onChange={(e) => updateLayer(selected, { x: Number(e.target.value) })} />
                                <label>Y (posición vertical)</label>
                                <input type="number" value={selectedLayer.y || 0} onChange={(e) => updateLayer(selected, { y: Number(e.target.value) })} />
                            </>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setSelected(null)} type="button">Hecho</button>
                            <button className="btn btn-outline btn-sm" onClick={() => removeLayer(selected)} type="button">Eliminar</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
