'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Package, Plus, AlertTriangle, CheckCircle, Clock, Loader2, Pencil } from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Batch {
  id: string;
  batchNumber: string;
  expiryDate: string;
  purchaseDate: string | null;
  quantityInitial: number;
  quantityAvailable: number;
  unitCost: number | null;
  active: boolean;
  notes: string | null;
  status: 'OK' | 'WARNING' | 'EXPIRED';
  daysToExpiry: number;
}

interface BatchSummary {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
}

interface BatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  storeProduct: {
    id: string;
    product?: { name: string; unitType?: 'UNIT' | 'KG' };
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function StatusChip({ status, days }: { status: Batch['status']; days: number }) {
  if (status === 'EXPIRED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle className="h-3 w-3" />
        Vencido
      </span>
    );
  }
  if (status === 'WARNING') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Clock className="h-3 w-3" />
        {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      <CheckCircle className="h-3 w-3" />
      OK
    </span>
  );
}

// ── Formulario nuevo lote ──────────────────────────────────────────────────────

const EMPTY_FORM = {
  batchNumber: '',
  expiryDate: '',
  purchaseDate: '',
  quantity: '',
  unitCost: '',
  notes: '',
};

// ── Componente principal ───────────────────────────────────────────────────────

export function BatchesModal({ isOpen, onClose, onSuccess, storeProduct }: BatchesModalProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deactivating, setDeactivating] = useState<string | null>(null);

  // ── Modal de confirmación para dar de baja ─────────────────────
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; batchNumber: string; qty: number } | null>(null);
  const [deactivateError, setDeactivateError] = useState('');

  // ── Editar lote (inline) ───────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ batchNumber: '', expiryDate: '', unitCost: '', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── Carga de lotes ────────────────────────────────────────────────────────

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/batches?storeProductId=${storeProduct.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al cargar lotes');
        return;
      }
      setBatches(data.batches ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [storeProduct.id]);

  useEffect(() => {
    if (isOpen) {
      loadBatches();
      setShowForm(false);
      setFormData(EMPTY_FORM);
      setFormError('');
    }
  }, [isOpen, loadBatches]);

  // ── Crear lote ────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      const payload = {
        storeProductId: storeProduct.id,
        batchNumber: formData.batchNumber.trim(),
        expiryDate: new Date(formData.expiryDate).toISOString(),
        purchaseDate: formData.purchaseDate
          ? new Date(formData.purchaseDate).toISOString()
          : null,
        quantity: parseFloat(formData.quantity),
        unitCost: formData.unitCost ? parseFloat(formData.unitCost) : null,
        notes: formData.notes.trim() || null,
      };

      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Error al registrar lote');
        return;
      }

      setFormData(EMPTY_FORM);
      setShowForm(false);
      await loadBatches();
      onSuccess?.();
    } catch {
      setFormError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  // ── Desactivar lote ───────────────────────────────────────────────────────

  const handleDeactivate = async (batchId: string, batchNumber: string) => {
    // Buscar el lote para mostrar cantidad en el modal
    const batch = batches.find(b => b.id === batchId);
    setDeactivateError('');
    setConfirmDeactivate({ id: batchId, batchNumber, qty: batch?.quantityAvailable ?? 0 });
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setDeactivating(confirmDeactivate.id);
    setDeactivateError('');
    try {
      const res = await fetch(`/api/batches/${confirmDeactivate.id}?action=deactivate`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) {
        setDeactivateError(data.error || 'Error al desactivar lote');
        return;
      }
      setConfirmDeactivate(null);
      await loadBatches();
      onSuccess?.();
    } catch {
      setDeactivateError('Error de conexión');
    } finally {
      setDeactivating(null);
    }
  };

  // ── Editar lote ───────────────────────────────────────────────────

  const startEdit = (b: Batch) => {
    setEditingId(b.id);
    setEditForm({
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate.split('T')[0],
      unitCost: b.unitCost != null ? String(b.unitCost) : '',
      notes: b.notes ?? '',
    });
    setEditError('');
  };

  const handleEditSave = async (batchId: string) => {
    if (!editForm.expiryDate) { setEditError('La fecha de vencimiento es obligatoria'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/batches/${batchId}?action=edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchNumber: editForm.batchNumber.trim(),
          expiryDate: new Date(editForm.expiryDate + 'T00:00:00').toISOString(),
          unitCost: editForm.unitCost ? parseFloat(editForm.unitCost) : null,
          notes: editForm.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'Error al guardar'); return; }
      setEditingId(null);
      await loadBatches();
      onSuccess?.();
    } catch { setEditError('Error de conexión'); }
    finally { setEditSaving(false); }
  };

  if (!isOpen) return null;

  const activeBatches = batches.filter((b) => b.active);
  const inactiveBatches = batches.filter((b) => !b.active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="font-semibold text-gray-900">Gestión de Lotes</h2>
              <p className="text-sm text-gray-500">{storeProduct.product?.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen */}
        {summary && (
          <div className="grid grid-cols-4 divide-x border-b text-center text-sm">
            <div className="py-3">
              <span className="font-semibold text-gray-900">{summary.total}</span>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="py-3">
              <span className="font-semibold text-blue-600">{summary.active}</span>
              <p className="text-xs text-gray-500">Activos</p>
            </div>
            <div className="py-3">
              <span className="font-semibold text-amber-600">{summary.expiringSoon}</span>
              <p className="text-xs text-gray-500">Por vencer</p>
            </div>
            <div className="py-3">
              <span className="font-semibold text-red-600">{summary.expired}</span>
              <p className="text-xs text-gray-500">Vencidos</p>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Cargando lotes...
            </div>
          ) : (
            <>
              {/* Tabla de lotes activos */}
              {activeBatches.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-3">Lote</th>
                      <th className="pb-2 pr-3">Vencimiento</th>
                      <th className="pb-2 pr-3 text-right">Inicial</th>
                      <th className="pb-2 pr-3 text-right">Disponible</th>
                      <th className="pb-2 pr-3 text-right">Costo unit.</th>
                      <th className="pb-2 pr-3">Estado</th>
                      <th className="pb-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {activeBatches.map((b) => (
                      editingId === b.id ? (
                        // ── Fila de edición inline ──
                        <tr key={b.id} className="bg-amber-50">
                          <td colSpan={7} className="py-3 px-2">
                            {editError && <p className="mb-2 text-xs text-red-600">{editError}</p>}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Nº lote</label>
                                <input type="text" value={editForm.batchNumber} onChange={e => setEditForm(f => ({...f, batchNumber: e.target.value}))} className="w-full rounded border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Fecha venc. *</label>
                                <input type="date" value={editForm.expiryDate} onChange={e => setEditForm(f => ({...f, expiryDate: e.target.value}))} className="w-full rounded border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Costo unit. (S/)</label>
                                <input type="number" step="0.01" min="0" value={editForm.unitCost} onChange={e => setEditForm(f => ({...f, unitCost: e.target.value}))} placeholder="—" className="w-full rounded border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-0.5">Notas</label>
                                <input type="text" value={editForm.notes} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} placeholder="Opcional" className="w-full rounded border px-2 py-1 text-sm" />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button type="button" onClick={() => setEditingId(null)} className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">Cancelar</button>
                              <button type="button" onClick={() => handleEditSave(b.id)} disabled={editSaving} className="flex items-center gap-1 rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">
                                {editSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                                Guardar cambios
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        // ── Fila normal ──
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="py-2 pr-3 font-mono text-xs font-medium text-gray-900">
                            {b.batchNumber}
                          </td>
                          <td className="py-2 pr-3 text-gray-700">{formatDate(b.expiryDate)}</td>
                          <td className="py-2 pr-3 text-right text-gray-700">
                            {b.quantityInitial}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium text-gray-900">
                            {b.quantityAvailable}
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-700">
                            {b.unitCost != null ? `S/ ${b.unitCost.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 pr-3">
                            <StatusChip status={b.status} days={b.daysToExpiry} />
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEdit(b)}
                                className="rounded p-1 text-amber-600 hover:bg-amber-50"
                                title="Editar lote"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeactivate(b.id, b.batchNumber)}
                                disabled={deactivating === b.id}
                                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {deactivating === b.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Baja'
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              ) : (
                !showForm && (
                  <p className="py-8 text-center text-sm text-gray-400">
                    No hay lotes activos para este producto.
                  </p>
                )
              )}

              {/* Lotes inactivos (colapsado) */}
              {inactiveBatches.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                    Ver lotes dados de baja ({inactiveBatches.length})
                  </summary>
                  <table className="mt-2 w-full text-sm opacity-60">
                    <tbody className="divide-y divide-gray-100">
                      {inactiveBatches.map((b) => (
                        <tr key={b.id}>
                          <td className="py-1.5 pr-3 font-mono text-xs text-gray-500">
                            {b.batchNumber}
                          </td>
                          <td className="py-1.5 pr-3 text-gray-500">
                            {formatDate(b.expiryDate)}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-gray-500">0</td>
                          <td className="py-1.5">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                              Inactivo
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              {/* Formulario agregar lote */}
              {showForm && (
                <form
                  onSubmit={handleCreate}
                  className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4"
                >
                  <h3 className="mb-3 text-sm font-semibold text-blue-800">Agregar nuevo lote</h3>

                  {formError && (
                    <div className="mb-3 rounded bg-red-100 p-2 text-xs text-red-700">
                      {formError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="col-span-2 sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Nº de lote *
                      </label>
                      <input
                        required
                        value={formData.batchNumber}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, batchNumber: e.target.value }))
                        }
                        placeholder="Ej: LOT-2025-001"
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Cantidad *
                      </label>
                      <input
                        required
                        type="number"
                        min="0.001"
                        step="any"
                        value={formData.quantity}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, quantity: e.target.value }))
                        }
                        placeholder="0"
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Fecha de vencimiento *
                      </label>
                      <input
                        required
                        type="date"
                        value={formData.expiryDate}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, expiryDate: e.target.value }))
                        }
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Fecha de compra
                      </label>
                      <input
                        type="date"
                        value={formData.purchaseDate}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, purchaseDate: e.target.value }))
                        }
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Costo unitario (S/)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.unitCost}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, unitCost: e.target.value }))
                        }
                        placeholder="0.00"
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-3">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Notas
                      </label>
                      <input
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData((f) => ({ ...f, notes: e.target.value }))
                        }
                        placeholder="Observaciones opcionales"
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setFormData(EMPTY_FORM);
                        setFormError('');
                      }}
                      className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                      Registrar lote
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t px-5 py-3">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Agregar lote
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Modal de confirmación de baja */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Dar de baja lote</h3>
                <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-sm text-gray-700">
                ¿Estás seguro de dar de baja el lote <span className="font-semibold">&quot;{confirmDeactivate.batchNumber}&quot;</span>?
              </p>
              {confirmDeactivate.qty > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700">
                    Se descontarán <span className="font-bold">{confirmDeactivate.qty} unidades</span> del stock disponible del producto.
                  </p>
                </div>
              )}
              {deactivateError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs text-red-600">{deactivateError}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t px-5 py-3">
              <button
                onClick={() => { setConfirmDeactivate(null); setDeactivateError(''); }}
                disabled={!!deactivating}
                className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeactivateAction}
                disabled={!!deactivating}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {deactivating ? 'Procesando...' : 'Sí, dar de baja'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
