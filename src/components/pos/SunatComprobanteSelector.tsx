/**
 * MÓDULO 18.5 + 18.8 — SunatComprobanteSelector
 * 
 * Componente para seleccionar tipo de comprobante SUNAT en checkout
 * - BOLETA: DNI/CE (CASHIER puede emitir)
 * - FACTURA: RUC (solo OWNER)
 * - NINGUNO: Sin comprobante SUNAT
 * 
 * REGLAS:
 * - Solo visible si ENABLE_SUNAT=true y store tiene SUNAT enabled
 * - Bloqueado si FIADO (retornar error 409)
 * - Validaciones de RUC/DNI
 * - Auto-emisión según preferencias (18.8)
 */

'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, FileText, Receipt } from 'lucide-react';

interface SunatComprobanteInputs {
  enabled: boolean;
  docType: 'BOLETA' | 'FACTURA' | null;
  customerDocType: string;
  customerDocNumber: string;
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;
}

interface SunatPreferences {
  enabled: boolean;
  autoEmitBoleta: boolean;
  allowFactura: boolean;
  defaultDocType: string;
}

interface SunatComprobanteSelectorProps {
  userRole: 'CASHIER' | 'OWNER' | 'SUPERADMIN';
  paymentMethod: string;
  onChange: (data: SunatComprobanteInputs) => void;
}

export default function SunatComprobanteSelector({
  userRole,
  paymentMethod,
  onChange,
}: SunatComprobanteSelectorProps) {
  const [sunatEnabled, setSunatEnabled] = useState(false);
  const [preferences, setPreferences] = useState<SunatPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [wantComprobante, setWantComprobante] = useState(false);
  const [docType, setDocType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [customerDocType, setCustomerDocType] = useState<string>('OTHER');
  const [customerDocNumber, setCustomerDocNumber] = useState('-');
  const [customerName, setCustomerName] = useState('CLIENTES VARIOS');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Verificar si SUNAT está habilitado y cargar preferencias
  useEffect(() => {
    const checkSunatStatus = async () => {
      try {
        // Primero verificar status general
        const statusRes = await fetch('/api/sunat/settings/status');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSunatEnabled(statusData.enabled && statusData.configured);
          
          if (statusData.enabled && statusData.configured) {
            // Luego cargar preferencias
            const prefsRes = await fetch('/api/sunat/preferences');
            if (prefsRes.ok) {
              const prefsData = await prefsRes.json();
              setPreferences(prefsData);
              
              // MÓDULO 18.8: Auto-activar según preferencias
              if (prefsData.autoEmitBoleta && paymentMethod !== 'FIADO') {
                setWantComprobante(true);
                setDocType('BOLETA');
              }
              
              // Si hay un tipo por defecto
              if (prefsData.defaultDocType === 'BOLETA') {
                setWantComprobante(true);
                setDocType('BOLETA');
              } else if (prefsData.defaultDocType === 'FACTURA' && prefsData.allowFactura && userRole !== 'CASHIER') {
                setWantComprobante(true);
                setDocType('FACTURA');
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking SUNAT status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSunatStatus();
  }, [paymentMethod, userRole]);

  // Notificar cambios al padre
  useEffect(() => {
    if (!wantComprobante || !sunatEnabled) {
      onChange({ enabled: false, docType: null, customerDocType: '', customerDocNumber: '', customerName: '' });
    } else {
      // IMPORTANTE: Para FACTURA siempre forzar RUC
      const effectiveDocType = docType === 'FACTURA' ? 'RUC' : customerDocType;
      const finalConsumer = docType === 'BOLETA' && effectiveDocType === 'OTHER';
      onChange({
        enabled: true,
        docType,
        customerDocType: effectiveDocType,
        customerDocNumber: finalConsumer ? '-' : customerDocNumber,
        customerName: finalConsumer ? 'CLIENTES VARIOS' : customerName,
        customerAddress,
        customerEmail,
      });
    }
  }, [wantComprobante, docType, customerDocType, customerDocNumber, customerName, customerAddress, customerEmail, sunatEnabled]);

  // Actualizar customerDocType según docType
  useEffect(() => {
    if (docType === 'FACTURA') {
      setCustomerDocType('RUC');
      setCustomerDocNumber('');
      setCustomerName('');
    } else {
      setCustomerDocType('OTHER');
      setCustomerDocNumber('-');
      setCustomerName('CLIENTES VARIOS');
    }
  }, [docType]);

  // FIADO no soporta SUNAT
  if (paymentMethod === 'FIADO') {
    return null;
  }

  // SUNAT no habilitado
  if (!sunatEnabled) {
    return null;
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Cargando...</div>;
  }

  return (
    <div className="bg-primary/10 rounded-xl p-3 border border-primary/30">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="wantComprobante"
          checked={wantComprobante}
          onChange={(e) => setWantComprobante(e.target.checked)}
          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary/40"
        />
        <label htmlFor="wantComprobante" className="text-sm font-medium text-primary flex items-center gap-1.5">
          <Receipt className="w-4 h-4" />
          Comprobante SUNAT
        </label>
      </div>

      {wantComprobante && (
        <div className="mt-3 space-y-2.5 pt-3 border-t border-primary/30">
          {/* Tipo de Comprobante */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDocType('BOLETA')}
              className={`flex-1 px-2 py-1.5 text-xs rounded border font-medium ${
                docType === 'BOLETA'
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Receipt className="w-3 h-3 inline mr-1" />
              BOLETA
            </button>
            <button
              type="button"
              onClick={() => setDocType('FACTURA')}
              disabled={userRole === 'CASHIER'}
              className={`flex-1 px-2 py-1.5 text-xs rounded border font-medium ${
                docType === 'FACTURA'
                  ? 'bg-primary text-white border-primary'
                  : userRole === 'CASHIER'
                  ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              title={userRole === 'CASHIER' ? 'Solo OWNER puede emitir FACTURA' : ''}
            >
              <FileText className="w-3 h-3 inline mr-1" />
              FACTURA
            </button>
          </div>

          {/* Datos del cliente en grid compacto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                {docType === 'FACTURA' ? 'RUC' : 'Tipo Doc'}
              </label>
              {docType === 'FACTURA' ? (
                <input
                  type="text"
                  value="RUC"
                  disabled
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-gray-100"
                />
              ) : (
                <select
                  value={customerDocType}
                  onChange={(e) => setCustomerDocType(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-primary/40 focus:border-primary"
                >
                  <option value="OTHER">Sin documento</option>
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
              )}
            </div>
            {docType === 'BOLETA' && customerDocType === 'OTHER' ? (
              <div className="flex items-end pb-1 text-[11px] text-primary">
                Consumidor final (hasta S/ 700)
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Número</label>
                <input
                  type="text"
                  value={customerDocNumber}
                  onChange={(e) => setCustomerDocNumber(e.target.value)}
                  placeholder={customerDocType === 'RUC' ? '20123456789' : '12345678'}
                  maxLength={customerDocType === 'RUC' ? 11 : customerDocType === 'DNI' ? 8 : 20}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-primary/40 focus:border-primary"
                />
              </div>
            )}
          </div>

          {/* Nombre/Razón Social */}
          {!(docType === 'BOLETA' && customerDocType === 'OTHER') && <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
              {docType === 'FACTURA' ? 'Razón Social' : 'Nombre'}
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={docType === 'FACTURA' ? 'EMPRESA S.A.C.' : 'Juan Pérez'}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-primary/40 focus:border-primary"
            />
          </div>}

          {/* Dirección solo para FACTURA */}
          {docType === 'FACTURA' && (
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-0.5">
                Dirección <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Av. Principal 123"
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-primary/40 focus:border-primary"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
