/**
 * MÓDULO 18.10 — SUNAT CONSOLE: Listado de Documentos Electrónicos
 * 
 * Página para OWNER/SUPERADMIN con:
 * - Filtros por fecha, tipo, estado
 * - Tabla con documentos
 * - Acciones: descargar XML/CDR, reintentar
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  Download,
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  FileCheck,
  Home,
  Send,
  PenLine,
} from 'lucide-react';

// Tipos
interface SunatDocument {
  id: string;
  storeId: string;
  storeName: string;
  docType: 'FACTURA' | 'BOLETA' | 'NC' | 'ND' | 'SUMMARY' | 'VOIDED';
  series: string;
  number: number;
  fullNumber: string;
  status: 'DRAFT' | 'SIGNED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'OBSERVED' | 'ERROR' | 'CANCELED';
  issueDate: string;
  createdAt: string;
  saleId: string | null;
  saleNumber: number | null;
  customerDocType: string;
  customerDocNumber: string;
  customerName: string;
  total: string;
  currency: string;
  sunatCode: string | null;
  sunatMessage: string | null;
  ticketMasked: string | null;
  hasXmlSigned: boolean;
  hasCdr: boolean;
}

interface DocumentsResponse {
  items: SunatDocument[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Helpers
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMoney = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return `S/ ${num.toFixed(2)}`;
};

// Badge de estado
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', icon: <Clock className="w-3 h-3" /> },
    SIGNED: { bg: 'bg-blue-100', text: 'text-blue-600', icon: <FileCheck className="w-3 h-3" /> },
    SENT: { bg: 'bg-yellow-100', text: 'text-yellow-600', icon: <Clock className="w-3 h-3" /> },
    ACCEPTED: { bg: 'bg-green-100', text: 'text-green-600', icon: <CheckCircle className="w-3 h-3" /> },
    REJECTED: { bg: 'bg-red-100', text: 'text-red-600', icon: <XCircle className="w-3 h-3" /> },
    OBSERVED: { bg: 'bg-orange-100', text: 'text-orange-600', icon: <AlertCircle className="w-3 h-3" /> },
    ERROR: { bg: 'bg-red-100', text: 'text-red-600', icon: <XCircle className="w-3 h-3" /> },
    CANCELED: { bg: 'bg-gray-100', text: 'text-gray-500', icon: <XCircle className="w-3 h-3" /> },
  };
  
  const cfg = config[status] || config.DRAFT;
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {status}
    </span>
  );
};

// Badge de tipo de documento
const DocTypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    FACTURA: 'bg-indigo-100 text-indigo-700',
    BOLETA: 'bg-purple-100 text-purple-700',
    NC: 'bg-amber-100 text-amber-700',
    ND: 'bg-pink-100 text-pink-700',
    SUMMARY: 'bg-cyan-100 text-cyan-700',
    VOIDED: 'bg-gray-100 text-gray-700',
  };
  
  const labels: Record<string, string> = {
    FACTURA: 'Factura',
    BOLETA: 'Boleta',
    NC: 'Nota Crédito',
    ND: 'Nota Débito',
    SUMMARY: 'Resumen',
    VOIDED: 'Baja',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-600'}`}>
      {labels[type] || type}
    </span>
  );
};

export default function SunatDocumentsPage() {
  const router = useRouter();
  
  // Estado
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DocumentsResponse | null>(null);
  
  // Filtros
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [docType, setDocType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  
  // Acciones
  const [downloading, setDownloading] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<SunatDocument | null>(null);
  
  // Cargar datos
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (docType !== 'ALL') params.set('type', docType);
      if (status !== 'ALL') params.set('status', status);
      if (query.trim()) params.set('q', query.trim());
      params.set('page', String(page));
      params.set('pageSize', '25');
      
      const res = await fetch(`/api/sunat/documents?${params.toString()}`);
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar documentos');
      }
      
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, docType, status, query, page]);
  
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);
  
  // Descargar archivo
  const handleDownload = async (docId: string, type: 'xml' | 'cdr') => {
    setDownloading(`${docId}-${type}`);
    
    try {
      const res = await fetch(`/api/sunat/documents/${docId}/download?type=${type}`);
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al descargar');
      }
      
      // Obtener blob y descargar
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Nombre del archivo desde header o generar
      const contentDisposition = res.headers.get('content-disposition');
      let filename = type === 'xml' ? 'documento.xml' : 'cdr.xml';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDownloading(null);
    }
  };
  
  // Enviar a SUNAT (documentos SIGNED)
  const handleSendToSunat = async (docId: string) => {
    if (!confirm('¿Enviar este documento a SUNAT?')) return;
    
    setSending(docId);
    
    try {
      const res = await fetch(`/api/sunat/documents/${docId}/queue`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al encolar');
      }
      
      alert('Documento encolado para envío a SUNAT. El worker lo procesará en segundos.');
      fetchDocuments();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(null);
    }
  };
  
  // Firmar documento DRAFT
  const handleSign = async (docId: string) => {
    setSigning(docId);
    
    try {
      const res = await fetch(`/api/sunat/documents/${docId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al firmar');
      }
      
      alert('Documento firmado correctamente. Ahora puedes enviarlo a SUNAT.');
      fetchDocuments();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSigning(null);
    }
  };
  
  // Reintentar envío
  const handleRetry = async (docId: string) => {
    if (!confirm('¿Reintentar envío de este documento a SUNAT?')) return;
    
    setRetrying(docId);
    
    try {
      const res = await fetch(`/api/sunat/documents/${docId}/retry`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al reintentar');
      }
      
      alert('Documento encolado para reintento');
      fetchDocuments();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRetrying(null);
    }
  };
  
  // Reset filtros
  const resetFilters = () => {
    setFrom('');
    setTo('');
    setDocType('ALL');
    setStatus('ALL');
    setQuery('');
    setPage(1);
  };
  
  // Resumen de estados
  const getStatusCounts = () => {
    if (!data) return { accepted: 0, pending: 0, errors: 0 };
    
    const accepted = data.items.filter(d => d.status === 'ACCEPTED').length;
    const pending = data.items.filter(d => ['SIGNED', 'SENT', 'DRAFT'].includes(d.status)).length;
    const errors = data.items.filter(d => ['ERROR', 'REJECTED'].includes(d.status)).length;
    
    return { accepted, pending, errors };
  };
  
  const counts = getStatusCounts();
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/" className="hover:text-blue-600 flex items-center gap-1">
            <Home className="w-4 h-4" />
            Inicio
          </Link>
          <span>/</span>
          <span className="text-gray-900">Documentos Electrónicos</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documentos Electrónicos SUNAT</h1>
            <p className="text-gray-600 mt-1">Facturas, boletas y documentos electrónicos emitidos</p>
          </div>
          <button
            onClick={fetchDocuments}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>
      
      {/* Resumen (cards) */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-600">Aceptados</span>
          </div>
          <div className="text-2xl font-bold text-green-600 mt-1">{counts.accepted}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-yellow-200">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-gray-600">Pendientes</span>
          </div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{counts.pending}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-red-200">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-gray-600">Errores</span>
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">{counts.errors}</div>
        </div>
      </div>
      
      {/* Barra de búsqueda y filtros */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número, cliente..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Botón filtros */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg ${showFilters ? 'bg-blue-50 border-blue-300' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>
        
        {/* Panel de filtros */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={to}
                onChange={(e) => { setTo(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={docType}
                onChange={(e) => { setDocType(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="ALL">Todos</option>
                <option value="FACTURA">Factura</option>
                <option value="BOLETA">Boleta</option>
                <option value="NC">Nota Crédito</option>
                <option value="ND">Nota Débito</option>
                <option value="SUMMARY">Resumen</option>
                <option value="VOIDED">Baja</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="ALL">Todos</option>
                <option value="ACCEPTED">Aceptado</option>
                <option value="SIGNED">Firmado</option>
                <option value="SENT">Enviado</option>
                <option value="DRAFT">Borrador</option>
                <option value="ERROR">Error</option>
                <option value="REJECTED">Rechazado</option>
                <option value="OBSERVED">Observado</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-4 flex justify-end">
              <button
                onClick={resetFilters}
                className="text-sm text-blue-600 hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}
      
      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Cargando documentos...</span>
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.items.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(doc.issueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <DocTypeBadge type={doc.docType} />
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">
                        {doc.fullNumber}
                        {doc.saleNumber && (
                          <span className="text-gray-400 ml-2">
                            (#{doc.saleNumber})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[200px] truncate" title={doc.customerName}>
                          {doc.customerName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {doc.customerDocType}: {doc.customerDocNumber}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(doc.total)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={doc.status} />
                        {doc.sunatMessage && (
                          <div
                            className="text-xs text-gray-500 max-w-[150px] truncate mt-1 cursor-help"
                            title={doc.sunatMessage}
                          >
                            {doc.sunatCode ? `[${doc.sunatCode}] ` : ''}
                            {doc.sunatMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* Ver detalle */}
                          <button
                            onClick={() => setSelectedDoc(doc)}
                            className="p-1.5 hover:bg-gray-100 rounded"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                          </button>
                          
                          {/* Descargar XML */}
                          {doc.hasXmlSigned && (
                            <button
                              onClick={() => handleDownload(doc.id, 'xml')}
                              disabled={downloading === `${doc.id}-xml`}
                              className="p-1.5 hover:bg-blue-50 rounded"
                              title="Descargar XML"
                            >
                              {downloading === `${doc.id}-xml` ? (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                              ) : (
                                <Download className="w-4 h-4 text-blue-600" />
                              )}
                            </button>
                          )}
                          
                          {/* Descargar CDR */}
                          {doc.hasCdr && (
                            <button
                              onClick={() => handleDownload(doc.id, 'cdr')}
                              disabled={downloading === `${doc.id}-cdr`}
                              className="p-1.5 hover:bg-green-50 rounded"
                              title="Descargar CDR"
                            >
                              {downloading === `${doc.id}-cdr` ? (
                                <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                              ) : (
                                <FileText className="w-4 h-4 text-green-600" />
                              )}
                            </button>
                          )}
                          
                          {/* Firmar documento DRAFT */}
                          {doc.status === 'DRAFT' && (
                            <button
                              onClick={() => handleSign(doc.id)}
                              disabled={signing === doc.id}
                              className="p-1.5 hover:bg-amber-50 rounded"
                              title="Firmar documento"
                            >
                              {signing === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                              ) : (
                                <PenLine className="w-4 h-4 text-amber-600" />
                              )}
                            </button>
                          )}
                          
                          {/* Enviar a SUNAT (solo SIGNED) */}
                          {doc.status === 'SIGNED' && (
                            <button
                              onClick={() => handleSendToSunat(doc.id)}
                              disabled={sending === doc.id}
                              className="p-1.5 hover:bg-green-50 rounded"
                              title="Enviar a SUNAT"
                            >
                              {sending === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                              ) : (
                                <Send className="w-4 h-4 text-green-600" />
                              )}
                            </button>
                          )}
                          
                          {/* Reintentar */}
                          {['ERROR', 'REJECTED', 'SENT'].includes(doc.status) && (
                            <button
                              onClick={() => handleRetry(doc.id)}
                              disabled={retrying === doc.id}
                              className="p-1.5 hover:bg-orange-50 rounded"
                              title="Reintentar envío"
                            >
                              {retrying === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                              ) : (
                                <RefreshCw className="w-4 h-4 text-orange-600" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Paginación */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <div className="text-sm text-gray-600">
                  Mostrando {((data.page - 1) * data.pageSize) + 1} - {Math.min(data.page * data.pageSize, data.total)} de {data.total}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border rounded hover:bg-white disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm">
                    Página {data.page} de {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="p-2 border rounded hover:bg-white disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay documentos electrónicos</p>
            <p className="text-sm text-gray-400 mt-1">
              Los documentos aparecerán aquí cuando se emitan facturas o boletas
            </p>
          </div>
        )}
      </div>
      
      {/* Modal de detalle */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-start justify-between">
                <div>
                  <DocTypeBadge type={selectedDoc.docType} />
                  <h2 className="text-xl font-bold mt-2">{selectedDoc.fullNumber}</h2>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Estado */}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Estado</span>
                <StatusBadge status={selectedDoc.status} />
              </div>
              
              {/* Fecha */}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Fecha emisión</span>
                <span className="font-medium">{formatDateTime(selectedDoc.issueDate)}</span>
              </div>
              
              {/* Cliente */}
              <div className="pt-2 border-t">
                <span className="text-sm text-gray-500">Cliente</span>
                <div className="font-medium">{selectedDoc.customerName}</div>
                <div className="text-sm text-gray-600">
                  {selectedDoc.customerDocType}: {selectedDoc.customerDocNumber}
                </div>
              </div>
              
              {/* Total */}
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-gray-600">Total</span>
                <span className="text-xl font-bold">{formatMoney(selectedDoc.total)}</span>
              </div>
              
              {/* Mensaje SUNAT */}
              {selectedDoc.sunatMessage && (
                <div className="pt-2 border-t">
                  <span className="text-sm text-gray-500">Respuesta SUNAT</span>
                  <div className={`text-sm mt-1 p-2 rounded ${
                    selectedDoc.status === 'ACCEPTED' ? 'bg-green-50 text-green-700' :
                    selectedDoc.status === 'REJECTED' || selectedDoc.status === 'ERROR' ? 'bg-red-50 text-red-700' :
                    'bg-gray-50 text-gray-700'
                  }`}>
                    {selectedDoc.sunatCode && <span className="font-mono">[{selectedDoc.sunatCode}] </span>}
                    {selectedDoc.sunatMessage}
                  </div>
                </div>
              )}
              
              {/* Venta asociada */}
              {selectedDoc.saleNumber && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-gray-600">Venta</span>
                  <Link
                    href={`/receipt/${selectedDoc.saleId}`}
                    className="text-blue-600 hover:underline"
                  >
                    #{selectedDoc.saleNumber}
                  </Link>
                </div>
              )}
            </div>
            
            {/* Acciones */}
            <div className="p-6 border-t bg-gray-50 flex gap-3">
              {selectedDoc.hasXmlSigned && (
                <button
                  onClick={() => handleDownload(selectedDoc.id, 'xml')}
                  disabled={downloading === `${selectedDoc.id}-xml`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  XML
                </button>
              )}
              
              {selectedDoc.hasCdr && (
                <button
                  onClick={() => handleDownload(selectedDoc.id, 'cdr')}
                  disabled={downloading === `${selectedDoc.id}-cdr`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <FileText className="w-4 h-4" />
                  CDR
                </button>
              )}
              
              {['ERROR', 'REJECTED', 'SENT'].includes(selectedDoc.status) && (
                <button
                  onClick={() => { handleRetry(selectedDoc.id); setSelectedDoc(null); }}
                  disabled={retrying === selectedDoc.id}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reintentar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
