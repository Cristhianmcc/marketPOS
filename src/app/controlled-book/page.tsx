'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFlags } from '@/hooks/useFlags';
import { Search, BookOpen, Download, ChevronLeft, ChevronRight, Shield, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface ControlledEntry {
  id: string;
  saleNumber: number;
  saleDate: string;
  productName: string;
  genericName: string | null;
  concentration: string | null;
  laboratory: string | null;
  batchNumber: string | null;
  quantity: number;
  prescriptionNumber: string;
  prescribedBy: string | null;
  cmpNumber: string | null;
  patientName: string;
  patientDni: string;
  dispensedBy: { name: string };
  notes: string | null;
  createdAt: string;
}

export default function ControlledBookPage() {
  const router = useRouter();
  const { isOn: isFlagOn } = useFlags();
  const enabled = isFlagOn('ENABLE_CONTROLLED_BOOK');

  const [entries, setEntries] = useState<ControlledEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      params.set('page', String(page));
      const res = await fetch(`/api/controlled-book?${params.toString()}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch {
      toast.error('Error al cargar libro de controlados');
    } finally {
      setLoading(false);
    }
  }, [query, dateFrom, dateTo, page]);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const handleExportCSV = () => {
    if (entries.length === 0) { toast.error('No hay datos para exportar'); return; }
    const headers = ['Fecha', 'Nº Venta', 'Producto', 'Genérico', 'Conc.', 'Lab.', 'Lote', 'Cant.', 'Nº Receta', 'Médico', 'CMP', 'Paciente', 'DNI', 'Dispensador'];
    const rows = entries.map(e => [
      new Date(e.saleDate).toLocaleDateString(),
      e.saleNumber,
      e.productName,
      e.genericName || '',
      e.concentration || '',
      e.laboratory || '',
      e.batchNumber || '',
      e.quantity,
      e.prescriptionNumber,
      e.prescribedBy || '',
      e.cmpNumber || '',
      e.patientName,
      e.patientDni,
      e.dispensedBy.name,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `libro_controlados_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  if (!enabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <Shield className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">Libro de Controlados no habilitado</p>
          <p className="text-sm">Activa el flag ENABLE_CONTROLLED_BOOK</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-7 h-7 text-red-600" /> Libro de Controlados
            </h1>
            <p className="text-sm text-gray-500">Registro obligatorio DIGEMID de sustancias controladas — {total} registros</p>
          </div>
        </div>
        <button onClick={handleExportCSV} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por producto, paciente, DNI, Nº receta..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2.5 text-sm" />
          <span className="text-gray-400">—</span>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2.5 text-sm" />
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando registros...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No hay registros de sustancias controladas</p>
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-red-50 text-red-900">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">Fecha</th>
                <th className="text-left px-3 py-2.5 font-semibold">Venta</th>
                <th className="text-left px-3 py-2.5 font-semibold">Producto</th>
                <th className="text-right px-3 py-2.5 font-semibold">Cant.</th>
                <th className="text-left px-3 py-2.5 font-semibold">Lote</th>
                <th className="text-left px-3 py-2.5 font-semibold">Receta</th>
                <th className="text-left px-3 py-2.5 font-semibold">Médico</th>
                <th className="text-left px-3 py-2.5 font-semibold">Paciente</th>
                <th className="text-left px-3 py-2.5 font-semibold">DNI</th>
                <th className="text-left px-3 py-2.5 font-semibold">Dispensó</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 whitespace-nowrap">{new Date(e.saleDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5 font-medium">#{e.saleNumber}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{e.productName}</div>
                    {e.genericName && <div className="text-xs text-gray-500">{e.genericName} {e.concentration || ''}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{Number(e.quantity)}</td>
                  <td className="px-3 py-2.5 text-gray-500">{e.batchNumber || '—'}</td>
                  <td className="px-3 py-2.5 font-medium text-red-700">{e.prescriptionNumber}</td>
                  <td className="px-3 py-2.5">
                    {e.prescribedBy || '—'}
                    {e.cmpNumber && <div className="text-xs text-gray-400">CMP: {e.cmpNumber}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{e.patientName}</td>
                  <td className="px-3 py-2.5">{e.patientDni}</td>
                  <td className="px-3 py-2.5 text-gray-500">{e.dispensedBy.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-2 border rounded-lg disabled:opacity-40 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-2 border rounded-lg disabled:opacity-40 hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
