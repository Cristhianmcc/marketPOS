'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, Download, ArrowLeft } from 'lucide-react';
import { formatMoney } from '@/lib/money';

interface SaleItem {
  id: string;
  productName: string;
  productContent: string | null;
  unitType: 'UNIT' | 'KG';
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number | null;
  discountAmount: number;
  totalLine: number;
}

interface Sale {
  id: string;
  saleNumber: string;
  subtotal: number;
  tax: number;
  discountTotal: number;
  totalBeforeDiscount: number;
  total: number;
  paymentMethod: 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'FIADO';
  amountPaid: number | null;
  changeAmount: number | null;
  createdAt: string;
  printedAt: string | null;
  customerId: string | null;
  items: SaleItem[];
  user: {
    name: string;
  };
  customer: {
    name: string;
    phone: string | null;
  } | null;
  shift: {
    openedAt: string;
  } | null;
  store: {
    name: string;
    ruc: string | null;
    address: string | null;
    phone: string | null;
  };
}

export default function ReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSale();
  }, [params.id]);

  const fetchSale = async () => {
    try {
      const res = await fetch(`/api/sales/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setSale(data.sale);
      } else {
        alert('Venta no encontrada');
        router.push('/pos');
      }
    } catch (error) {
      console.error('Error fetching sale:', error);
      alert('Error al cargar venta');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    // Mark as printed
    try {
      await fetch(`/api/sales/${params.id}/mark-printed`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error marking as printed:', error);
    }

    // Print
    window.print();
  };

  const handleDownloadPDF = () => {
    // For v1, instruct user to use "Save as PDF" in print dialog
    alert('En el diálogo de impresión, selecciona "Guardar como PDF" como destino.');
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">Venta no encontrada</div>
      </div>
    );
  }

  const isAnulada = Number(sale.total) === 0 && Number(sale.subtotal) === 0;

  return (
    <>
      {/* Action buttons - hidden on print */}
      <div className="no-print bg-white border-b border-gray-200 py-4 px-6 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => router.push('/pos')}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Descargar PDF
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Receipt */}
      <div className="receipt-container">
        <div className="receipt">
          {/* Header */}
          <div className="receipt-header">
            <div className="store-name">{sale.store.name}</div>
            {sale.store.ruc && <div className="store-info">RUC: {sale.store.ruc}</div>}
            {sale.store.address && <div className="store-info">{sale.store.address}</div>}
            {sale.store.phone && <div className="store-info">Tel: {sale.store.phone}</div>}
          </div>
          {/* Mostrar si está anulado */}
          {isAnulada && (
            <>
              <div className="separator">================================</div>
              <div style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold', margin: '10px 0', color: '#dc2626' }}>
                *** TICKET ANULADO ***
              </div>
              <div className="separator">================================</div>
            </>
          )}
          <div className="separator">================================</div>

          {/* Sale info */}
          <div className="sale-info">
            <div className="info-row">
              <span>Fecha:</span>
              <span>{new Date(sale.createdAt).toLocaleString('es-PE')}</span>
            </div>
            <div className="info-row">
              <span>Ticket N°:</span>
              <span>{sale.saleNumber}</span>
            </div>
            <div className="info-row">
              <span>Cajero:</span>
              <span>{sale.user.name}</span>
            </div>
            {sale.customer && (
              <>
                <div className="info-row">
                  <span>Cliente:</span>
                  <span>{sale.customer.name}</span>
                </div>
                {sale.customer.phone && (
                  <div className="info-row">
                    <span>Tel:</span>
                    <span>{sale.customer.phone}</span>
                  </div>
                )}
              </>
            )}
            {sale.shift && (
              <div className="info-row">
                <span>Turno:</span>
                <span>{new Date(sale.shift.openedAt).toLocaleString('es-PE', { 
                  day: '2-digit', 
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              </div>
            )}
          </div>

          <div className="separator">================================</div>

          {/* Items */}
          <div className="items">
            {sale.items.map((item) => (
              <div key={item.id} className="item">
                <div className="item-name">
                  {item.productName}
                  {item.productContent && ` ${item.productContent}`}
                </div>
                <div className="item-line">
                  <span>
                    {item.unitType === 'KG' 
                      ? `${item.quantity.toFixed(3)} kg` 
                      : `${item.quantity} und`} x {formatMoney(item.unitPrice)}
                  </span>
                  <span>{formatMoney(item.subtotal)}</span>
                </div>
                {/* Descuento del ítem */}
                {item.discountAmount > 0 && (
                  <>
                    <div className="item-discount">
                      <span>
                        Desc: {item.discountType === 'PERCENT' 
                          ? `${item.discountValue}%` 
                          : formatMoney(item.discountValue!)}
                      </span>
                      <span>-{formatMoney(item.discountAmount)}</span>
                    </div>
                    <div className="item-total">
                      <span>Total línea:</span>
                      <span>{formatMoney(item.totalLine)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="separator">================================</div>

          {/* Totals - Solo si NO está anulado */}
          {!isAnulada && (
            <>
              <div className="totals">
                <div className="total-row">
                  <span>Subtotal:</span>
                  <span>{formatMoney(sale.subtotal)}</span>
                </div>
                {/* Descuentos */}
                {sale.discountTotal > 0 && (
                  <div className="total-row discount-row">
                    <span>Descuentos:</span>
                    <span>-{formatMoney(sale.discountTotal)}</span>
                  </div>
                )}
                {sale.tax > 0 && (
                  <div className="total-row">
                    <span>IGV (18%):</span>
                    <span>{formatMoney(sale.tax)}</span>
                  </div>
                )}
                <div className="total-row total-final">
                  <span>TOTAL:</span>
                  <span>{formatMoney(sale.total)}</span>
                </div>
              </div>

              <div className="separator">================================</div>

              {/* Payment */}
              <div className="payment">
                <div className="payment-method">
                  Pago: {
                    sale.paymentMethod === 'CASH' ? 'Efectivo' :
                    sale.paymentMethod === 'YAPE' ? 'Yape' :
                    sale.paymentMethod === 'PLIN' ? 'Plin' :
                    sale.paymentMethod === 'CARD' ? 'Tarjeta' :
                    'Fiado'
                  }
                </div>
                {sale.paymentMethod === 'FIADO' ? (
                  <>
                    <div className="payment-row" style={{ fontWeight: 'bold', marginTop: '10px' }}>
                      <span>Saldo pendiente:</span>
                      <span>{formatMoney(sale.total)}</span>
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '10px', padding: '8px 0' }}>
                      Cliente debe pagar en caja posteriormente
                    </div>
                  </>
                ) : sale.paymentMethod === 'CASH' ? (
                  <>
                    <div className="payment-row">
                      <span>Recibido:</span>
                      <span>{formatMoney(sale.amountPaid!)}</span>
                    </div>
                    <div className="payment-row">
                      <span>Vuelto:</span>
                      <span>{formatMoney(sale.changeAmount!)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          )}

          {/* Si está anulado mostrar mensaje */}
          {isAnulada && (
            <div style={{ textAlign: 'center', margin: '20px 0', color: '#dc2626' }}>
              <div>Este ticket ha sido anulado</div>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>Los productos han sido devueltos al stock</div>
            </div>
          )}

          <div className="separator">================================</div>

          {/* Footer */}
          <div className="receipt-footer">
            Gracias por su compra
          </div>
        </div>
      </div>

      <style jsx>{`
        .no-print {
          display: block;
        }

        .receipt-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          min-height: calc(100vh - 73px);
          background: #f3f4f6;
          padding: 2rem 1rem;
        }

        .receipt {
          width: 80mm;
          background: white;
          padding: 10mm;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.4;
          color: black;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .receipt-header {
          text-align: center;
          margin-bottom: 8px;
        }

        .store-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 4px;
        }

        .store-info {
          font-size: 10px;
          line-height: 1.3;
        }

        .separator {
          margin: 8px 0;
          overflow: hidden;
          white-space: nowrap;
        }

        .sale-info,
        .totals,
        .payment {
          margin: 8px 0;
        }

        .info-row,
        .total-row,
        .payment-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2px;
        }

        .total-final {
          font-weight: bold;
          font-size: 12px;
          margin-top: 4px;
        }

        .items {
          margin: 8px 0;
        }

        .item {
          margin-bottom: 8px;
        }

        .item-name {
          font-weight: bold;
          margin-bottom: 2px;
        }

        .item-line {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
        }

        .item-discount {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #ea580c;
          margin-top: 2px;
          padding-left: 8px;
        }

        .item-total {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          font-weight: bold;
          margin-top: 2px;
          padding-left: 8px;
        }

        .discount-row {
          color: #ea580c;
        }

        .payment-method {
          font-weight: bold;
          margin-bottom: 4px;
        }

        .receipt-footer {
          text-align: center;
          font-size: 10px;
          margin-top: 8px;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          body {
            margin: 0;
            padding: 0;
            background: white;
          }

          .receipt-container {
            display: block;
            min-height: 0;
            background: white;
            padding: 0;
            margin: 0;
          }

          .receipt {
            width: 80mm;
            box-shadow: none;
            margin: 0;
            padding: 5mm;
          }

          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}
