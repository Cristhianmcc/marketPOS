'use client';

import { useEffect, useState } from 'react';
import AuthLayout from '@/components/AuthLayout';
import { Plus, Edit, Trash2, X, Check } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { formatMoney } from '@/lib/money';

interface Coupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  minTotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  createdAt: string;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Form states
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [value, setValue] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [maxUses, setMaxUses] = useState('');

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      const res = await fetch('/api/coupons');
      if (res.ok) {
        const data = await res.json();
        setCoupons(data);
      }
    } catch (error) {
      console.error('Error fetching coupons:', error);
      toast.error('Error al cargar cupones');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!code.trim()) {
      toast.error('Ingresa un código de cupón');
      return;
    }

    if (!value || parseFloat(value) <= 0) {
      toast.error('Ingresa un valor válido');
      return;
    }

    if (type === 'PERCENT' && parseFloat(value) > 100) {
      toast.error('El porcentaje no puede ser mayor a 100');
      return;
    }

    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast.error('La fecha de fin debe ser posterior a la de inicio');
      return;
    }

    setProcessing(true);

    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          type,
          value: parseFloat(value),
          minTotal: minTotal ? parseFloat(minTotal) : null,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          maxUses: maxUses ? parseInt(maxUses) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || 'Error al crear cupón');
        return;
      }

      toast.success('Cupón creado exitosamente');
      setShowCreateModal(false);
      resetForm();
      fetchCoupons();
    } catch (error) {
      console.error('Error creating coupon:', error);
      toast.error('Error al crear cupón');
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/coupons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });

      if (!res.ok) {
        toast.error('Error al actualizar cupón');
        return;
      }

      toast.success(currentActive ? 'Cupón desactivado' : 'Cupón activado');
      fetchCoupons();
    } catch (error) {
      console.error('Error updating coupon:', error);
      toast.error('Error al actualizar cupón');
    }
  };

  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`¿Eliminar cupón ${code}?`)) return;

    try {
      const res = await fetch(`/api/coupons/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        toast.error('Error al eliminar cupón');
        return;
      }

      toast.success('Cupón eliminado');
      fetchCoupons();
    } catch (error) {
      console.error('Error deleting coupon:', error);
      toast.error('Error al eliminar cupón');
    }
  };

  const resetForm = () => {
    setCode('');
    setType('PERCENT');
    setValue('');
    setMinTotal('');
    setStartsAt('');
    setEndsAt('');
    setMaxUses('');
  };

  const isExpired = (endsAt: string | null) => {
    if (!endsAt) return false;
    return new Date(endsAt) < new Date();
  };

  const isNotStarted = (startsAt: string | null) => {
    if (!startsAt) return false;
    return new Date(startsAt) > new Date();
  };

  if (loading) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Cargando cupones...</div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" />
      
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Cupones de Descuento
          </h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <Plus className="w-5 h-5" />
            Nuevo Cupón
          </button>
        </div>

        {coupons.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-600">No hay cupones creados</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-green-600 hover:text-green-700 font-medium"
            >
              Crear primer cupón
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coupons.map((coupon) => (
              <div
                key={coupon.id}
                className={`border rounded-lg p-4 ${
                  coupon.active
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {coupon.code}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          coupon.active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {coupon.active ? 'Activo' : 'Inactivo'}
                      </span>
                      {isExpired(coupon.endsAt) && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
                          Expirado
                        </span>
                      )}
                      {isNotStarted(coupon.startsAt) && (
                        <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleActive(coupon.id, coupon.active)}
                    className={`p-1.5 rounded ${
                      coupon.active
                        ? 'text-gray-600 hover:bg-gray-200'
                        : 'text-green-600 hover:bg-green-100'
                    }`}
                    title={coupon.active ? 'Desactivar' : 'Activar'}
                  >
                    {coupon.active ? (
                      <X className="w-4 h-4" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Descuento:</span>
                    <span className="font-semibold text-gray-900">
                      {coupon.type === 'PERCENT'
                        ? `${coupon.value}%`
                        : formatMoney(coupon.value)}
                    </span>
                  </div>

                  {coupon.minTotal && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mínimo:</span>
                      <span className="font-medium text-gray-900">
                        {formatMoney(coupon.minTotal)}
                      </span>
                    </div>
                  )}

                  {coupon.maxUses && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Usos:</span>
                      <span className="font-medium text-gray-900">
                        {coupon.usesCount} / {coupon.maxUses}
                      </span>
                    </div>
                  )}

                  {!coupon.maxUses && coupon.usesCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Usos:</span>
                      <span className="font-medium text-gray-900">
                        {coupon.usesCount} (ilimitado)
                      </span>
                    </div>
                  )}

                  {coupon.startsAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Inicia:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(coupon.startsAt).toLocaleDateString('es-PE')}
                      </span>
                    </div>
                  )}

                  {coupon.endsAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Expira:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(coupon.endsAt).toLocaleDateString('es-PE')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
                  <button
                    onClick={() => handleDelete(coupon.id, coupon.code)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Crear Cupón */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                Crear Cupón
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código *
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="NAVIDAD10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Descuento *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'PERCENT' | 'AMOUNT')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="PERCENT">Porcentaje (%)</option>
                  <option value="AMOUNT">Monto Fijo (S/)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor *
                </label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={type === 'PERCENT' ? '10' : '5.00'}
                  step={type === 'PERCENT' ? '1' : '0.01'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {type === 'PERCENT'
                    ? 'Porcentaje de descuento (0-100)'
                    : 'Monto en soles'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Compra Mínima (opcional)
                </label>
                <input
                  type="number"
                  value={minTotal}
                  onChange={(e) => setMinTotal(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Máximo de Usos (opcional)
                </label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Ilimitado"
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Dejar vacío para usos ilimitados
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {processing ? 'Creando...' : 'Crear Cupón'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
