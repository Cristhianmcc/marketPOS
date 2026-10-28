'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Plus, Search, Zap, AlertTriangle, CalendarClock, ClipboardList } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useFlags } from '@/hooks/useFlags';
import {
  STATUS_STYLE, balanceOf, formatDateTime, isOverdue, money, num, useWorkOrderContext,
  type ApiWorkOrder, type WorkOrderStatusName,
} from './shared';

type Filter = WorkOrderStatusName | 'OPEN' | 'OVERDUE' | 'ALL';

const TABS: Filter[] = ['OPEN', 'APPROVED', 'IN_PROGRESS', 'READY', 'OVERDUE', 'CLOSED', 'CANCELLED', 'DRAFT', 'ALL'];

export default function WorkOrdersPage() {
  const router = useRouter();
  const ctx = useWorkOrderContext();
  const { isOn, isLoading: flagsLoading } = useFlags();
  const enabled = isOn('ENABLE_WORK_ORDERS');
  const [orders, setOrders] = useState<ApiWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (query.trim()) params.set('q', query.trim());
      const res = await fetch(`/api/work-orders?${params.toString()}`);
      if (!res.ok) throw new Error('Error al cargar órdenes');
      setOrders((await res.json()).data ?? []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (flagsLoading || !enabled) return;
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [enabled, flagsLoading, load]);

  const tabLabel = (tab: Filter) =>
    tab === 'OPEN' ? 'Pendientes' : tab === 'OVERDUE' ? 'Atrasadas' : tab === 'ALL' ? 'Todas' : ctx.labels[tab];

  const matches = useCallback((order: ApiWorkOrder, tab: Filter) => {
    if (tab === 'ALL') return true;
    if (tab === 'OPEN') return ['APPROVED', 'IN_PROGRESS', 'READY'].includes(order.status);
    if (tab === 'OVERDUE') return isOverdue(order);
    return order.status === tab;
  }, []);

  const counts = useMemo(() => Object.fromEntries(TABS.map((tab) => [tab, orders.filter((o) => matches(o, tab)).length])), [orders, matches]);
  const visible = useMemo(() => {
    const list = orders.filter((o) => matches(o, filter));
    // Primero lo que se entrega antes; sin fecha al final
    return list.sort((a, b) => (a.promisedAt ? new Date(a.promisedAt).getTime() : Infinity) - (b.promisedAt ? new Date(b.promisedAt).getTime() : Infinity) || b.orderNumber - a.orderNumber);
  }, [orders, filter, matches]);

  if (flagsLoading) {
    return <AuthLayout><div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div></AuthLayout>;
  }
  if (!enabled) {
    return (
      <AuthLayout>
        <div className="max-w-xl mx-auto py-16 px-4 text-center text-gray-600">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-400" />
          El módulo de órdenes de trabajo no está activo para esta tienda.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h1 className="text-2xl font-bold text-gray-900">{ctx.isLaundry ? 'Órdenes de lavandería' : 'Órdenes de trabajo'}</h1>
            <button onClick={() => router.push('/work-orders/new')} className="ml-auto px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:opacity-90">
              <Plus className="inline w-4 h-4 mr-1" />{ctx.isLaundry ? 'Recibir prendas' : 'Nueva orden'}
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por número de orden, cliente u observación"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/40 focus:border-primary" />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {TABS.map((tab) => (
              <button key={tab} onClick={() => setFilter(tab)}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm border ${filter === tab ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 hover:border-gray-300'} ${tab === 'OVERDUE' && counts[tab] > 0 && filter !== tab ? 'text-red-700 border-red-200' : ''}`}>
                {tabLabel(tab)} <span className="ml-1 opacity-80">{counts[tab] ?? 0}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-16 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-gray-500">No hay órdenes en {tabLabel(filter).toLowerCase()}.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((order) => {
                const overdue = isOverdue(order);
                const balance = balanceOf(order);
                return (
                  <li key={order.id}>
                    <button onClick={() => router.push(`/work-orders/${order.id}`)}
                      className={`w-full text-left bg-white rounded-lg border p-4 hover:shadow-sm ${overdue ? 'border-red-300' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">#{order.orderNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[order.status]}`}>{ctx.labels[order.status]}</span>
                        {order.express && <Zap className="w-4 h-4 text-orange-500" aria-label="Express" />}
                        {overdue && <AlertTriangle className="w-4 h-4 text-red-500" aria-label="Atrasada" />}
                      </div>
                      <div className="mt-1 text-sm text-gray-700 truncate">{order.customer?.name ?? 'Sin cliente'}</div>
                      <div className="text-xs text-gray-500 truncate">{order.items.map((i) => i.itemName).join(', ')}</div>
                      <div className={`mt-2 text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        <CalendarClock className="inline w-3 h-3 mr-1" />{order.promisedAt ? `Entrega ${formatDateTime(order.promisedAt)}` : 'Sin fecha de entrega'}
                      </div>
                      <div className="mt-2 flex justify-between text-sm">
                        <span>Total {money(num(order.total))}</span>
                        {['CLOSED', 'CANCELLED'].includes(order.status) ? null : <span className="font-semibold text-primary">Saldo {money(balance)}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
