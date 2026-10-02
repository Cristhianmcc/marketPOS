'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, AlertTriangle, Plus, X, Check, Database, Zap, Shield, Info, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Interaction {
  id: string;
  drugA: string;
  drugB: string;
  severity: 'HIGH' | 'MODERATE' | 'LOW';
  description: string;
  recommendation: string | null;
}

const severityColors: Record<string, { bg: string; text: string; badge: string; label: string }> = {
  HIGH: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100 text-red-800', label: 'ALTA' },
  MODERATE: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', label: 'MODERADA' },
  LOW: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100 text-green-800', label: 'BAJA' },
};

const emptyForm = { drugA: '', drugB: '', severity: 'MODERATE', description: '', recommendation: '' };

export default function DrugInteractionsPage() {
  const router = useRouter();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Verificador rápido
  const [checkDrugs, setCheckDrugs] = useState('');
  const [checkResults, setCheckResults] = useState<Interaction[] | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      params.set('page', String(page));
      const res = await fetch(`/api/drug-interactions?${params}`);
      const data = await res.json();
      setInteractions(data.interactions || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Error al cargar interacciones');
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => { load(); }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/drug-interactions/seed', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.message);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar datos');
    } finally {
      setSeeding(false);
    }
  };

  const handleSave = async () => {
    if (!form.drugA.trim() || !form.drugB.trim() || !form.description.trim()) {
      toast.error('Fármaco A, B y descripción son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/drug-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Interacción registrada');
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleCheck = async () => {
    const drugs = checkDrugs.split(',').map(d => d.trim()).filter(Boolean);
    if (drugs.length < 2) { toast.error('Ingresa al menos 2 fármacos separados por comas'); return; }
    setChecking(true);
    try {
      const res = await fetch(`/api/drug-interactions?action=check&drugs=${encodeURIComponent(drugs.join(','))}`);
      const data = await res.json();
      setCheckResults(data.interactions || []);
      if (data.interactions.length === 0) toast.success('No se encontraron interacciones');
    } catch {
      toast.error('Error al verificar');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Interacciones Medicamentosas</h1>
            <p className="text-sm text-gray-500">Base de datos de interacciones farmacológicas y verificador rápido</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSeed} disabled={seeding}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm">
            <Database className="w-4 h-4" /> {seeding ? 'Cargando...' : 'Cargar datos iniciales'}
          </button>
          <button onClick={() => { setForm(emptyForm); setShowForm(true); }}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">
            <Plus className="w-4 h-4" /> Nueva Interacción
          </button>
        </div>
      </div>

      {/* Verificador rápido */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4" /> Verificador Rápido de Interacciones
        </h3>
        <div className="flex gap-2">
          <input type="text" value={checkDrugs} onChange={(e) => setCheckDrugs(e.target.value)}
            placeholder="Ej: warfarina, ibuprofeno, omeprazol" onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white" />
          <button onClick={handleCheck} disabled={checking}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm whitespace-nowrap">
            {checking ? 'Verificando...' : 'Verificar'}
          </button>
        </div>
        <p className="text-xs text-blue-600 mt-1">Ingresa principios activos separados por comas</p>

        {/* Resultado del verificador */}
        {checkResults !== null && (
          <div className="mt-3">
            {checkResults.length === 0 ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3 text-sm">
                <Shield className="w-4 h-4" /> No se encontraron interacciones entre los fármacos indicados
              </div>
            ) : (
              <div className="space-y-2">
                {checkResults.map((inter) => {
                  const colors = severityColors[inter.severity];
                  return (
                    <div key={inter.id} className={`${colors.bg} rounded-lg p-3 border`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`w-4 h-4 ${colors.text}`} />
                          <span className="font-semibold text-sm capitalize">{inter.drugA}</span>
                          <span className="text-gray-400">+</span>
                          <span className="font-semibold text-sm capitalize">{inter.drugB}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>{severityColors[inter.severity].label}</span>
                        </div>
                      </div>
                      <p className={`text-sm mt-1 ${colors.text}`}>{inter.description}</p>
                      {inter.recommendation && (
                        <p className="text-xs mt-1 text-gray-600 flex items-start gap-1">
                          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> {inter.recommendation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Buscador de la base de datos */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Buscar por nombre de fármaco o descripción..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500" />
      </div>

      {/* Tabla de interacciones */}
      {loading ? <div className="text-center py-10 text-gray-400">Cargando...</div> : interactions.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No hay interacciones registradas</p>
          <p className="text-sm">Usa &quot;Cargar datos iniciales&quot; para importar interacciones comunes</p>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fármaco A</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fármaco B</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severidad</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recomendación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {interactions.map((inter) => {
                  const colors = severityColors[inter.severity];
                  return (
                    <tr key={inter.id} className={`${colors.bg} hover:opacity-90`}>
                      <td className="px-4 py-3 text-sm font-medium capitalize">{inter.drugA}</td>
                      <td className="px-4 py-3 text-sm font-medium capitalize">{inter.drugB}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${colors.badge}`}>{severityColors[inter.severity].label}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs">{inter.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">{inter.recommendation || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {total > 50 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>Mostrando {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50">Anterior</button>
                <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50">Siguiente</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de nueva interacción */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nueva Interacción</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fármaco A (principio activo) *</label>
                  <input type="text" value={form.drugA} onChange={(e) => setForm({ ...form, drugA: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ej: warfarina" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fármaco B (principio activo) *</label>
                  <input type="text" value={form.drugB} onChange={(e) => setForm({ ...form, drugB: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ej: ibuprofeno" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severidad *</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="HIGH">🔴 Alta — Contraindicado o riesgo grave</option>
                  <option value="MODERATE">🟡 Moderada — Monitoreo necesario</option>
                  <option value="LOW">🟢 Baja — Información relevante</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la interacción *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Describe el efecto de combinar ambos fármacos..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recomendación clínica</label>
                <textarea value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Alternativas o acciones sugeridas..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm">
                <Check className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
