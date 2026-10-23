'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFlags } from '@/hooks/useFlags';
import { Plus, Search, User, AlertTriangle, Pill, Heart, X, Check, ChevronRight, Edit2, Clock, Shield, ArrowLeft, Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface Medication {
  id: string;
  productName: string;
  genericName: string | null;
  concentration: string | null;
  quantity: number;
  prescribedBy: string | null;
  dosage: string | null;
  consultReason: string | null;
  notes: string | null;
  dispensedAt: string;
}

interface InteractionLog {
  id: string;
  drugA: string;
  drugB: string;
  severity: string;
  description: string;
  action: string;
  createdAt: string;
}

interface Patient {
  id: string;
  dni: string;
  name: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  allergies: string | null;
  conditions: string | null;
  notes: string | null;
  active: boolean;
  _count?: { medicationHistory: number; controlledEntries: number };
  medicationHistory?: Medication[];
  controlledEntries?: any[];
  drugInteractionLogs?: InteractionLog[];
}

const emptyForm = { dni: '', name: '', phone: '', birthDate: '', gender: '', address: '', allergies: '', conditions: '', notes: '' };

export default function PatientsPage() {
  const router = useRouter();
  const { isOn: isFlagOn } = useFlags();
  const enabled = isFlagOn('ENABLE_PATIENTS');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/patients${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      setPatients(data.patients || []);
    } catch {
      toast.error('Error al cargar pacientes');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const handleSave = async () => {
    if (!form.dni.trim() || !form.name.trim()) { toast.error('DNI y nombre son obligatorios'); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/patients/${editingId}` : '/api/patients';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(editingId ? 'Paciente actualizado' : 'Paciente registrado');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: Patient) => {
    setForm({
      dni: p.dni, name: p.name, phone: p.phone || '', birthDate: p.birthDate ? p.birthDate.slice(0, 10) : '',
      gender: p.gender || '', address: p.address || '', allergies: p.allergies || '', conditions: p.conditions || '', notes: p.notes || '',
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set('from', exportFrom);
      if (exportTo)   params.set('to',   exportTo);
      const res = await fetch(`/api/patients/export?${params.toString()}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al exportar');
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `pacientes_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exportación completada');
      setShowExportModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const viewDetail = async (patientId: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/patients?id=${patientId}`);
      const data = await res.json();
      setSelectedPatient(data.patient);
    } catch {
      toast.error('Error al cargar detalle');
    } finally {
      setLoadingDetail(false);
    }
  };

  if (!enabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <User className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">Módulo de Pacientes no habilitado</p>
          <p className="text-sm">Activa el flag ENABLE_PATIENTS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
            <p className="text-sm text-gray-500">Historial médico, alergias y medicamentos dispensados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm">
            <Plus className="w-4 h-4" /> Nuevo Paciente
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Buscar por nombre, DNI o teléfono..." value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
      </div>

      <div className="flex gap-6">
        {/* Lista de pacientes */}
        <div className={`${selectedPatient ? 'w-1/3' : 'w-full'} transition-all`}>
          {loading ? <div className="text-center py-10 text-gray-400">Cargando...</div> : patients.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No hay pacientes registrados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {patients.map((p) => (
                <div key={p.id} onClick={() => viewDetail(p.id)}
                  className={`bg-white border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-all ${selectedPatient?.id === p.id ? 'ring-2 ring-purple-500 border-purple-300' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{p.name}</span>
                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">DNI: {p.dni}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {p._count && <span className="flex items-center gap-1"><Pill className="w-3 h-3" /> {p._count.medicationHistory} medicamentos</span>}
                        {p._count && p._count.controlledEntries > 0 && (
                          <span className="flex items-center gap-1 text-red-500"><Shield className="w-3 h-3" /> {p._count.controlledEntries} controlados</span>
                        )}
                        {p.allergies && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> Alergias</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(p); }} className="p-1.5 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel de detalle */}
        {selectedPatient && (
          <div className="w-2/3 bg-white border rounded-lg p-5 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
            {loadingDetail ? <div className="text-center py-10 text-gray-400">Cargando detalle...</div> : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
                    <div className="text-sm text-gray-500">
                      DNI: {selectedPatient.dni}
                      {selectedPatient.phone && ` • Tel: ${selectedPatient.phone}`}
                      {selectedPatient.gender && ` • ${selectedPatient.gender === 'M' ? 'Masculino' : 'Femenino'}`}
                      {selectedPatient.birthDate && ` • ${new Date(selectedPatient.birthDate).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button onClick={() => setSelectedPatient(null)} className="p-1.5 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
                </div>

                {/* Alergias y condiciones */}
                {(selectedPatient.allergies || selectedPatient.conditions) && (
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {selectedPatient.allergies && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-red-700 flex items-center gap-1 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> ALERGIAS</h4>
                        <p className="text-sm text-red-800">{selectedPatient.allergies}</p>
                      </div>
                    )}
                    {selectedPatient.conditions && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-1"><Heart className="w-3.5 h-3.5" /> CONDICIONES CRÓNICAS</h4>
                        <p className="text-sm text-blue-800">{selectedPatient.conditions}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Alertas de interacciones */}
                {selectedPatient.drugInteractionLogs && selectedPatient.drugInteractionLogs.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Alertas de Interacciones Recientes
                    </h3>
                    <div className="space-y-1.5">
                      {selectedPatient.drugInteractionLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className={`text-xs p-2 rounded ${log.severity === 'HIGH' ? 'bg-red-50 text-red-700' : log.severity === 'MODERATE' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                          <strong>{log.drugA}</strong> + <strong>{log.drugB}</strong>: {log.description}
                          <span className="ml-2 opacity-70">({log.action})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historial de medicamentos */}
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <Pill className="w-4 h-4 text-purple-500" /> Historial de Medicamentos
                </h3>
                {(!selectedPatient.medicationHistory || selectedPatient.medicationHistory.length === 0) ? (
                  <p className="text-sm text-gray-400 text-center py-4">Sin historial de medicamentos</p>
                ) : (
                  <div className="space-y-2">
                    {selectedPatient.medicationHistory.map((med) => (
                      <div key={med.id} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg text-sm">
                        <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{med.productName}</span>
                            {med.concentration && <span className="text-xs text-purple-600">{med.concentration}</span>}
                            <span className="text-xs text-gray-400">{new Date(med.dispensedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {med.genericName && <span>{med.genericName} • </span>}
                            Cant: {Number(med.quantity)}
                            {med.dosage && <span> • {med.dosage}</span>}
                            {med.prescribedBy && <span> • Dr. {med.prescribedBy}</span>}
                            {med.consultReason && <span className="text-purple-600"> • {med.consultReason}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal exportar Excel */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-bold">Exportar a Excel</h2>
              </div>
              <button onClick={() => setShowExportModal(false)}><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Elige un rango de fechas para filtrar por <strong>fecha de dispensación</strong>. Déjalo vacío para exportar todo el historial.
            </p>

            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-3.5 h-3.5" /> Desde
                </label>
                <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-3.5 h-3.5" /> Hasta
                </label>
                <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-4 text-xs text-purple-700">
              El archivo incluirá dos hojas: <strong>&quot;Pacientes&quot;</strong> (fichas) y <strong>&quot;Dispensaciones&quot;</strong> (historial detallado por producto).
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm">
                <Download className="w-4 h-4" /> {exporting ? 'Generando...' : 'Descargar Excel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 my-8 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingId ? 'Editar Paciente' : 'Nuevo Paciente'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">DNI *</label>
                  <input type="text" value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="12345678" maxLength={8} disabled={!!editingId} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="María García López" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="999888777" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nacimiento</label>
                  <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Género</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">—</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <label className="block text-sm font-semibold text-red-700 mb-1">⚠️ Alergias conocidas</label>
                <textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="w-full border border-red-200 rounded px-3 py-2 text-sm bg-white" rows={2} placeholder="Ej: Penicilina, Sulfonamidas, Ibuprofeno" />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <label className="block text-sm font-semibold text-blue-700 mb-1">💊 Condiciones crónicas</label>
                <textarea value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} className="w-full border border-blue-200 rounded px-3 py-2 text-sm bg-white" rows={2} placeholder="Ej: Diabetes tipo 2, Hipertensión, Asma" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
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
