'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

interface Receivable {
  id: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  };
  sale: {
    saleNumber: number;
    total: number;
    createdAt: string;
  };
  originalAmount: number;
  balance: number;
  status: 'OPEN' | 'PAID' | 'CANCELLED';
  createdAt: string;
  payments: Payment[];
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

export default function ReceivablesPage() {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'OPEN' | 'PAID' | 'CANCELLED'>('OPEN');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'YAPE' | 'PLIN' | 'CARD'>('CASH');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    loadReceivables();
  }, [activeTab]);

  const loadReceivables = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/receivables?status=${activeTab}`);
      if (!res.ok) throw new Error('Error al cargar');
      const data = await res.json();
      setReceivables(data.receivables);
    } catch (error) {
      console.error('Error loading receivables:', error);
      toast.error('Error al cargar cuentas por cobrar');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPaymentModal = (receivable: Receivable) => {
    setSelectedReceivable(receivable);
    setPaymentAmount(receivable.balance.toString());
    setPaymentMethod('CASH');
    setPaymentNotes('');
    setShowPaymentModal(true);
  };

  const handlePayment = async () => {
    if (!selectedReceivable) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (amount > selectedReceivable.balance) {
      toast.error('El monto excede el saldo pendiente');
      return;
    }

    try {
      setProcessing(true);
      const res = await fetch(`/api/receivables/${selectedReceivable.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: paymentMethod,
          notes: paymentNotes || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }

      const data = await res.json();
      
      const remainingBalance = data.receivable.balance;
      if (remainingBalance === 0) {
        toast.success('¡Cuenta pagada completamente!');
      } else {
        toast.success(`Pago registrado. Saldo restante: S/ ${remainingBalance.toFixed(2)}`);
      }

      setShowPaymentModal(false);
      loadReceivables();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      toast.error(error.message || 'Error al procesar pago');
    } finally {
      setProcessing(false);
    }
  };

  const filteredReceivables = receivables;

  const getTotalBalance = () => {
    return receivables.reduce((sum, r) => sum + r.balance, 0);
  };

  const handleExport = () => {
    const url = `/api/reports/export/receivables?status=${activeTab}`;
    window.open(url, '_blank');
  };

  if (loading && receivables.length === 0) {
    return (
      <AuthLayout storeName="Cuentas por Cobrar">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-500">Cargando...</div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout storeName="Cuentas por Cobrar">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cuentas por Cobrar</h1>
            <p className="text-gray-600 text-sm mt-1">Gestión de ventas FIADO y pagos</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {[
          { value: 'OPEN', label: 'Abiertas', color: 'orange' },
          { value: 'PAID', label: 'Pagadas', color: 'green' },
          { value: 'CANCELLED', label: 'Canceladas', color: 'gray' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value as any)}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.value
                ? `border-${tab.color}-600 text-${tab.color}-600`
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Resumen para OPEN */}
      {activeTab === 'OPEN' && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-orange-700">Total Pendiente de Cobro</div>
              <div className="text-2xl font-bold text-orange-900">
                S/ {getTotalBalance().toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-orange-700">Cuentas Abiertas</div>
              <div className="text-2xl font-bold text-orange-900">{receivables.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ticket
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Monto Original
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Saldo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredReceivables.map((receivable) => (
              <tr key={receivable.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{receivable.customer.name}</div>
                  {receivable.customer.phone && (
                    <div className="text-sm text-gray-500">{receivable.customer.phone}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  #{receivable.sale.saleNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(receivable.sale.createdAt).toLocaleDateString('es-PE')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  S/ {receivable.originalAmount.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {receivable.balance > 0 ? (
                    <span className="font-medium text-red-600">
                      S/ {receivable.balance.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-400">S/ 0.00</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      receivable.status === 'OPEN'
                        ? 'bg-orange-100 text-orange-800'
                        : receivable.status === 'PAID'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {receivable.status === 'OPEN'
                      ? 'Abierta'
                      : receivable.status === 'PAID'
                      ? 'Pagada'
                      : 'Cancelada'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {receivable.status === 'OPEN' && (
                    <button
                      onClick={() => handleOpenPaymentModal(receivable)}
                      className="text-blue-600 hover:text-blue-800 mr-3 font-medium"
                    >
                      Cobrar
                    </button>
                  )}
                  {receivable.payments.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedReceivable(receivable);
                        setShowHistoryModal(true);
                      }}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      Ver Pagos
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filteredReceivables.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No hay cuentas {activeTab === 'OPEN' ? 'abiertas' : activeTab === 'PAID' ? 'pagadas' : 'canceladas'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Registrar Pago */}
      {showPaymentModal && selectedReceivable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Registrar Pago</h3>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">Cliente</div>
              <div className="font-medium">{selectedReceivable.customer.name}</div>
              <div className="text-sm text-gray-600 mt-2">Ticket #{selectedReceivable.sale.saleNumber}</div>
              <div className="text-sm text-red-600 font-medium mt-1">
                Saldo pendiente: S/ {selectedReceivable.balance.toFixed(2)}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto a cobrar (S/)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setPaymentAmount((selectedReceivable.balance / 2).toFixed(2))}
                    className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => setPaymentAmount(selectedReceivable.balance.toString())}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Total
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Método de pago
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['CASH', 'YAPE', 'PLIN', 'CARD'].map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method as any)}
                      className={`py-2 px-3 rounded-lg border font-medium text-sm ${
                        paymentMethod === method
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                  placeholder="Ej: Abono parcial..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                onClick={handlePayment}
                className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                disabled={processing}
              >
                {processing ? 'Procesando...' : 'Registrar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial de Pagos */}
      {showHistoryModal && selectedReceivable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Historial de Pagos</h3>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="font-medium">{selectedReceivable.customer.name}</div>
              <div className="text-sm text-gray-600">Ticket #{selectedReceivable.sale.saleNumber}</div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {selectedReceivable.payments.map((payment) => (
                <div key={payment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-lg">S/ {payment.amount.toFixed(2)}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {new Date(payment.createdAt).toLocaleString('es-PE')}
                      </div>
                      <div className="text-sm text-gray-600">Por: {payment.createdBy}</div>
                      {payment.notes && (
                        <div className="text-sm text-gray-500 mt-1 italic">{payment.notes}</div>
                      )}
                    </div>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      {payment.method}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowHistoryModal(false)}
              className="w-full mt-4 py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      </div>
    </AuthLayout>
  );
}
