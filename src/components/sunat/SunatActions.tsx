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
  documentType?: 'FACTURA' | 'BOLETA';
  documentTotal?: number;
  allowNotes?: boolean;
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
  documentType,
  documentTotal = 0,
  allowNotes = true,
  onActionComplete,
}: SunatActionsProps) {
  const [showEmitModal, setShowEmitModal] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [noteType, setNoteType] = useState<'NOTA_CREDITO' | 'NOTA_DEBITO'>('NOTA_CREDITO');
  const [noteReasonCode, setNoteReasonCode] = useState('01');
  const [noteReason, setNoteReason] = useState('ANULACIÓN DE LA OPERACIÓN');
  const [noteAmount, setNoteAmount] = useState(String(documentTotal || ''));
  const [cancelSale, setCancelSale] = useState(true);

  const [docType, setDocType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [customerDocType, setCustomerDocType] = useState('OTHER');
  const [customerDocNumber, setCustomerDocNumber] = useState('-');
  const [customerName, setCustomerName] = useState('CLIENTES VARIOS');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const effectiveCustomerDocType = docType === 'FACTURA' ? 'RUC' : customerDocType;

  // No mostrar acciones para FIADO
  if (paymentMethod === 'FIADO') {
    return null;
  }

  const handleEmit = async () => {
    const finalConsumer = docType === 'BOLETA' && effectiveCustomerDocType === 'OTHER';
    if ((!customerDocNumber || !customerName) && !finalConsumer) {
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
          customerDocType: effectiveCustomerDocType,
          customerDocNumber: finalConsumer ? '-' : customerDocNumber,
          customerName: finalConsumer ? 'CLIENTES VARIOS' : customerName,
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

  const handleDownload = async (type: 'xml' | 'cdr' | 'pdf') => {
    if (!documentId) return;

    try {
      const url = `/api/sunat/documents/${documentId}/download?type=${type}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Descarga de ${type.toUpperCase()} iniciada. Revisa tu carpeta Descargas.`);
    } catch (error: any) {
      console.error('Error downloading:', error);
      toast.error('Error al descargar archivo');
    }
  };

  const handleCreateNote = async () => {
    if (!documentId) return;
    const amount = Number(noteAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !noteReason.trim()) {
      toast.error('Completa el importe y el motivo de la nota');
      return;
    }
    setCreatingNote(true);
    try {
      const res = await fetch('/api/sunat/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceDocumentId: documentId,
          noteType,
          reasonCode: noteReasonCode,
          reason: noteReason.trim(),
          amount,
          cancelSaleOnAcceptance: noteType === 'NOTA_CREDITO' && cancelSale,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'No se pudo crear la nota electrónica');
        return;
      }
      toast.success(`${noteType === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Nota de débito'} ${data.document.fullNumber} encolada`);
      setShowNoteModal(false);
      onActionComplete?.();
    } catch (error) {
      console.error('Error creating SUNAT note:', error);
      toast.error('Error de red al crear la nota');
    } finally {
      setCreatingNote(false);
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

      {/* Reintentar solamente fallos técnicos; un rechazo requiere corrección. */}
      {documentId && status === 'ERROR' && (
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

      {/* Representación impresa con QR */}
      {documentId && hasXml && (
        <button
          onClick={() => handleDownload('pdf')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          PDF
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

      {allowNotes && documentId && userRole === 'OWNER' && (status === 'ACCEPTED' || status === 'OBSERVED') && (
        <button
          onClick={() => {
            setNoteAmount(String(documentTotal));
            setShowNoteModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 rounded hover:bg-violet-700"
        >
          <FileText className="w-3.5 h-3.5" />
          Nota / Anular
        </button>
      )}

      {showNoteModal && documentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Ajuste fiscal de {documentType || 'comprobante'}</h3>
            <p className="text-sm text-gray-600 mb-4">El comprobante original se conserva. SUNAT recibirá una nota vinculada.</p>
            <div className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => {
                  setNoteType('NOTA_CREDITO'); setNoteReasonCode('01');
                  setNoteReason('ANULACIÓN DE LA OPERACIÓN'); setCancelSale(true); setNoteAmount(String(documentTotal));
                }} className={`flex-1 px-3 py-2 rounded border text-sm ${noteType === 'NOTA_CREDITO' ? 'bg-violet-600 text-white' : 'bg-white'}`}>Nota de crédito</button>
                <button type="button" onClick={() => {
                  setNoteType('NOTA_DEBITO'); setNoteReasonCode('02');
                  setNoteReason('AUMENTO EN EL VALOR'); setCancelSale(false); setNoteAmount('');
                }} className={`flex-1 px-3 py-2 rounded border text-sm ${noteType === 'NOTA_DEBITO' ? 'bg-violet-600 text-white' : 'bg-white'}`}>Nota de débito</button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Motivo SUNAT</label>
                <select value={noteReasonCode} onChange={(event) => {
                  const option = event.currentTarget.selectedOptions[0];
                  setNoteReasonCode(event.target.value); setNoteReason(option.text);
                  if (event.target.value !== '01' && event.target.value !== '05') setCancelSale(false);
                }} className="w-full px-3 py-2 border rounded">
                  {noteType === 'NOTA_CREDITO' ? <>
                    <option value="01">ANULACIÓN DE LA OPERACIÓN</option>
                    <option value="02">ANULACIÓN POR ERROR EN RUC</option>
                    <option value="03">DESCUENTO GLOBAL</option>
                    <option value="04">DESCUENTO POR ÍTEM</option>
                    <option value="05">DEVOLUCIÓN TOTAL</option>
                    <option value="06">DEVOLUCIÓN PARCIAL</option>
                    <option value="08">DISMINUCIÓN EN EL VALOR</option>
                    <option value="09">OTROS CONCEPTOS</option>
                  </> : <>
                    <option value="01">INTERESES POR MORA</option>
                    <option value="02">AUMENTO EN EL VALOR</option>
                    <option value="03">PENALIDADES</option>
                    <option value="10">OTROS CONCEPTOS</option>
                  </>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descripción</label>
                <input value={noteReason} onChange={(event) => setNoteReason(event.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Importe total (S/)</label>
                <input type="number" min="0.01" step="0.01" max={noteType === 'NOTA_CREDITO' ? documentTotal : undefined}
                  value={noteAmount} onChange={(event) => setNoteAmount(event.target.value)} className="w-full px-3 py-2 border rounded" />
              </div>
              {noteType === 'NOTA_CREDITO' && (noteReasonCode === '01' || noteReasonCode === '05') && (
                <label className="flex items-start gap-2 rounded bg-red-50 p-3 text-sm text-red-800">
                  <input type="checkbox" checked={cancelSale} onChange={(event) => setCancelSale(event.target.checked)} className="mt-1" />
                  Al ser aceptada, anular la venta local y devolver el stock. Requiere el importe total S/ {documentTotal.toFixed(2)}.
                </label>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreateNote} disabled={creatingNote} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded disabled:opacity-50">
                {creatingNote ? 'Creando...' : 'Firmar y encolar nota'}
              </button>
              <button onClick={() => setShowNoteModal(false)} disabled={creatingNote} className="px-4 py-2 bg-gray-200 rounded">Cerrar</button>
            </div>
          </div>
        </div>
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
                    onClick={() => {
                      setDocType('BOLETA');
                      setCustomerDocType('OTHER');
                      setCustomerDocNumber('-');
                      setCustomerName('CLIENTES VARIOS');
                    }}
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
                    onClick={() => {
                      setDocType('FACTURA');
                      setCustomerDocType('RUC');
                      setCustomerDocNumber('');
                      setCustomerName('');
                    }}
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
                  value={effectiveCustomerDocType}
                  onChange={(e) => setCustomerDocType(e.target.value)}
                  disabled={docType === 'FACTURA'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  {docType === 'FACTURA' ? (
                    <option value="RUC">RUC</option>
                  ) : (
                    <>
                      <option value="OTHER">Sin documento (consumidor final)</option>
                      <option value="DNI">DNI</option>
                      <option value="CE">Carnet de Extranjería</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </>
                  )}
                </select>
              </div>

              {docType === 'BOLETA' && effectiveCustomerDocType === 'OTHER' && (
                <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Se emitirá a CLIENTES VARIOS. Si el total supera S/ 700, debes identificar al cliente.
                </div>
              )}

              {/* Número de Documento */}
              {!(docType === 'BOLETA' && effectiveCustomerDocType === 'OTHER') && <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de {effectiveCustomerDocType}
                </label>
                <input
                  type="text"
                  value={customerDocNumber}
                  onChange={(e) => setCustomerDocNumber(e.target.value)}
                  placeholder={effectiveCustomerDocType === 'RUC' ? '20123456789' : '12345678'}
                  maxLength={effectiveCustomerDocType === 'RUC' ? 11 : 20}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                />
              </div>}

              {/* Nombre */}
              {!(docType === 'BOLETA' && effectiveCustomerDocType === 'OTHER') && <div>
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
              </div>}

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
