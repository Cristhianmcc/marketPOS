/**
 * MÓDULO 18.5 — SunatActions
 * 
 * Botones de acción para comprobantes electrónicos SUNAT:
 * - Emitir (si no tiene comprobante)
 * - Reintentar (si ERROR o REJECTED)
 * - Descargar XML
 * - Descargar CDR (si ACCEPTED)
 */

'use client';

import { useState } from 'react';
import { FileText, Download, RotateCw, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SunatActionsProps {
  saleId: string;
  documentId?: string | null;
  status?: string | null;
  hasXml?: boolean;
  hasCdr?: boolean;
  userRole: string;
  paymentMethod?: string;
  onActionComplete?: () => void;
}

export default function SunatActions({
  saleId,
  documentId,
  status,
  hasXml,
  hasCdr,
  userRole,
  paymentMethod,
  onActionComplete,
}: SunatActionsProps) {
  const [showEmitModal, setShowEmitModal] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const [docType, setDocType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [customerDocType, setCustomerDocType] = useState('DNI');
  const [customerDocNumber, setCustomerDocNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // No mostrar acciones para FIADO
  if (paymentMethod === 'FIADO') {
    return null;
  }

  const handleEmit = async () => {
    if (!customerDocNumber || !customerName) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    setEmitting(true);

    try {
      const res = await fetch('/api/sunat/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          docType,
          customerDocType,
          customerDocNumber,
          customerName,
          customerAddress: customerAddress || undefined,
          customerEmail: customerEmail || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error al emitir comprobante');
        return;
      }

      toast.success('Comprobante creado y encolado para envío a SUNAT');
      setShowEmitModal(false);
      onActionComplete?.();
    } catch (error: any) {
      console.error('Error emitting:', error);
      toast.error('Error de red al emitir comprobante');
    } finally {
      setEmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!documentId) return;

    setRetrying(true);

    try {
      const res = await fetch(`/api/sunat/documents/${documentId}/retry`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error al reintentar envío');
        return;
      }

      toast.success('Reintento encolado. El worker procesará el envío.');
      onActionComplete?.();
    } catch (error: any) {
      console.error('Error retrying:', error);
      toast.error('Error de red al reintentar envío');
    } finally {
      setRetrying(false);
    }
  };

  const handleDownload = async (type: 'xml' | 'cdr') => {
    if (!documentId) return;

    try {
      const url = `/api/sunat/documents/${documentId}/download?type=${type}`;
      window.open(url, '_blank');
      toast.success(`Descargando ${type.toUpperCase()}...`);
    } catch (error: any) {
      console.error('Error downloading:', error);
      toast.error('Error al descargar archivo');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* Emitir (si no tiene documento) */}
      {!documentId && (
        <button
          onClick={() => setShowEmitModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Emitir
        </button>
      )}

      {/* Reintentar (si ERROR o REJECTED) */}
      {documentId && (status === 'ERROR' || status === 'REJECTED') && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-orange-600 rounded hover:bg-orange-700 transition-colors disabled:opacity-50"
        >
          {retrying ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCw className="w-3.5 h-3.5" />
          )}
          Reintentar
        </button>
      )}

      {/* Descargar XML */}
      {documentId && hasXml && (
        <button
          onClick={() => handleDownload('xml')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          XML
        </button>
      )}

      {/* Descargar CDR */}
      {documentId && hasCdr && status === 'ACCEPTED' && (
        <button
          onClick={() => handleDownload('cdr')}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          CDR
        </button>
      )}

      {/* Modal para emitir */}
      {showEmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Emitir Comprobante SUNAT</h3>

            <div className="space-y-4">
              {/* Tipo de Comprobante */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Comprobante</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDocType('BOLETA')}
                    className={`flex-1 px-3 py-2 text-sm rounded border ${
                      docType === 'BOLETA'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    BOLETA
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocType('FACTURA')}
                    disabled={userRole === 'CASHIER'}
                    className={`flex-1 px-3 py-2 text-sm rounded border ${
                      docType === 'FACTURA'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : userRole === 'CASHIER'
                        ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    FACTURA
                  </button>
                </div>
              </div>

              {/* Tipo de Documento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Documento</label>
                <select
                  value={customerDocType}
                  onChange={(e) => setCustomerDocType(e.target.value)}
                  disabled={docType === 'FACTURA'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  {docType === 'FACTURA' ? (
                    <option value="RUC">RUC</option>
                  ) : (
                    <>
                      <option value="DNI">DNI</option>
                      <option value="CE">Carnet de Extranjería</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </>
                  )}
                </select>
              </div>

              {/* Número de Documento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de {customerDocType}
                </label>
                <input
                  type="text"
                  value={customerDocNumber}
                  onChange={(e) => setCustomerDocNumber(e.target.value)}
                  placeholder={customerDocType === 'RUC' ? '20123456789' : '12345678'}
                  maxLength={customerDocType === 'RUC' ? 11 : 20}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {docType === 'FACTURA' ? 'Razón Social' : 'Nombre Completo'}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={docType === 'FACTURA' ? 'MI EMPRESA S.A.C.' : 'Juan Pérez'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Dirección (FACTURA) */}
              {docType === 'FACTURA' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dirección <span className="text-gray-500">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Av. Principal 123, Lima"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-gray-500">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleEmit}
                disabled={emitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {emitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Emitiendo...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Emitir
                  </>
                )}
              </button>
              <button
                onClick={() => setShowEmitModal(false)}
                disabled={emitting}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
