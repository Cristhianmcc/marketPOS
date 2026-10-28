'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFlags } from '@/hooks/useFlags';
import { Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Building2, X, Check, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  name: string;
  ruc: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  _count: { purchaseOrders: number };
}

const emptyForm = { name: '', ruc: '', contactName: '', phone: '', email: '', address: '', notes: '' };

export default function SuppliersPage() {
  const router = useRouter();
  const { isOn: isFlagOn } = useFlags();
  const enabled = isFlagOn('ENABLE_SUPPLIERS');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/suppliers?active=true${query ? `&query=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch {
      toast.error('Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/suppliers/${editingId}` : '/api/suppliers';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(editingId ? 'Proveedor actualizado' : 'Proveedor creado');
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

  const handleEdit = (s: Supplier) => {
    setForm({ name: s.name, ruc: s.ruc || '', contactName: s.contactName || '', phone: s.phone || '', email: s.email || '', address: s.address || '', notes: s.notes || '' });
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleDelete = async (s: Supplier) => {
    if (!confirm(`¿Eliminar proveedor "${s.name}"?`)) return;
    try {
      const res = await fetch(`/api/suppliers/${s.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success('Proveedor eliminado');
      load();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar');
    }
  };

  if (!enabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-gray-500">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">Módulo de Proveedores no habilitado</p>
          <p className="text-sm">Activa el flag ENABLE_SUPPLIERS en la configuración</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
            <p className="text-sm text-gray-500">Gestiona tus proveedores y sus datos de contacto</p>
          </div>
        </div>
        <button
          onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo Proveedor
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, RUC o contacto..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Laboratorio Farmindustria" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RUC</label>
                  <input type="text" value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="20100047218" maxLength={11} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contacto</label>
                  <input type="text" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Juan Pérez" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="999 888 777" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ventas@lab.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Av. Industrial 123, Lima" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm">
                <Check className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando...</div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No hay proveedores registrados</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white border rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    {s.ruc && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">RUC: {s.ruc}</span>}
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{s._count.purchaseOrders} OC</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-gray-500">
                    {s.contactName && <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{s.contactName}</span>}
                    {s.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{s.phone}</span>}
                    {s.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{s.email}</span>}
                    {s.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.address}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button onClick={() => handleEdit(s)} className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/10" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(s)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
