/**
 * MÓDULO 18.5 — SunatStatusBadge
 * 
 * Badge que muestra el estado de un comprobante electrónico SUNAT
 * - DRAFT: Borrador
 * - SIGNED: Firmado (pendiente envío)
 * - SENT: Enviado a SUNAT (esperando respuesta)
 * - ACCEPTED: Aceptado por SUNAT ✅
 * - REJECTED: Rechazado por SUNAT ❌
 * - ERROR: Error técnico al enviar
 */

'use client';

import { FileCheck, FileX, Clock, AlertTriangle, File, Send } from 'lucide-react';

export type SunatStatus = 'DRAFT' | 'SIGNED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'ERROR';

interface SunatStatusBadgeProps {
  status: SunatStatus;
  sunatCode?: string | null;
  sunatMessage?: string | null;
}

export default function SunatStatusBadge({ status, sunatCode, sunatMessage }: SunatStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'DRAFT':
        return {
          label: 'Borrador',
          icon: File,
          className: 'bg-gray-100 text-gray-700 border-gray-300',
        };
      case 'SIGNED':
        return {
          label: 'Firmado',
          icon: Clock,
          className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
        };
      case 'SENT':
        return {
          label: 'Enviado',
          icon: Send,
          className: 'bg-blue-100 text-blue-700 border-blue-300',
        };
      case 'ACCEPTED':
        return {
          label: 'Aceptado',
          icon: FileCheck,
          className: 'bg-green-100 text-green-700 border-green-300',
        };
      case 'REJECTED':
        return {
          label: 'Rechazado',
          icon: FileX,
          className: 'bg-red-100 text-red-700 border-red-300',
        };
      case 'ERROR':
        return {
          label: 'Error',
          icon: AlertTriangle,
          className: 'bg-orange-100 text-orange-700 border-orange-300',
        };
      default:
        return {
          label: 'Desconocido',
          icon: AlertTriangle,
          className: 'bg-gray-100 text-gray-700 border-gray-300',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className="inline-flex flex-col gap-1">
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}>
        <Icon className="w-3.5 h-3.5" />
        {config.label}
      </div>
      
      {sunatCode && sunatMessage && (
        <div className="text-xs text-gray-600" title={sunatMessage}>
          {sunatCode}: {sunatMessage.length > 30 ? sunatMessage.slice(0, 30) + '...' : sunatMessage}
        </div>
      )}
    </div>
  );
}
