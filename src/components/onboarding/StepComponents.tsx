// src/components/onboarding/StepComponents.tsx
'use client';

import { Store, DollarSign, Package, Users, Receipt, CheckCircle, Download, Upload } from 'lucide-react';

// ============= STEP 1: Datos de Tienda =============
interface Step1Props {
  storeName: string;
  setStoreName: (val: string) => void;
  storeRuc: string;
  setStoreRuc: (val: string) => void;
  storeAddress: string;
  setStoreAddress: (val: string) => void;
  storePhone: string;
  setStorePhone: (val: string) => void;
  ticketHeader1: string;
  setTicketHeader1: (val: string) => void;
  ticketHeader2: string;
  setTicketHeader2: (val: string) => void;
}

export function Step1Content(props: Step1Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Store className="w-8 h-8 text-blue-600" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Datos de tu tienda</h2>
          <p className="text-gray-600 text-sm">Información que aparecerá en tus tickets</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Nombre de la tienda <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={props.storeName}
          onChange={(e) => {
            props.setStoreName(e.target.value);
            if (!props.ticketHeader1) {
              props.setTicketHeader1(e.target.value);
            }
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Ej: Bodega San Martín"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            RUC
          </label>
          <input
            type="text"
            value={props.storeRuc}
            onChange={(e) => props.setStoreRuc(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="20123456789"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Teléfono
          </label>
          <input
            type="text"
            value={props.storePhone}
            onChange={(e) => props.setStorePhone(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="987654321"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Dirección
        </label>
        <input
          type="text"
          value={props.storeAddress}
          onChange={(e) => props.setStoreAddress(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Av. Principal 123, Lima"
        />
      </div>

      <div className="pt-4 border-t">
        <h3 className="font-medium text-gray-900 mb-3">Encabezado del ticket</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Línea 1 (máx. 100 caracteres)</label>
            <input
              type="text"
              value={props.ticketHeader1}
              onChange={(e) => props.setTicketHeader1(e.target.value)}
              maxLength={100}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="Nombre de tu tienda"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Línea 2 (máx. 100 caracteres)</label>
            <input
              type="text"
              value={props.ticketHeader2}
              onChange={(e) => props.setTicketHeader2(e.target.value)}
              maxLength={100}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="Dirección o RUC"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============= STEP 2: Configuración =============
interface Step2Props {
  useShifts: boolean;
  setUseShifts: (val: boolean) => void;
  initialCash: string;
  setInitialCash: (val: string) => void;
  defaultPaymentMethod: string;
  setDefaultPaymentMethod: (val: string) => void;
}

export function Step2Content(props: Step2Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <DollarSign className="w-8 h-8 text-green-600" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Configuración de caja</h2>
          <p className="text-gray-600 text-sm">Define cómo funcionará tu sistema de ventas</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={props.useShifts}
            onChange={(e) => props.setUseShifts(e.target.checked)}
            className="mt-1 w-4 h-4 text-blue-600 rounded"
          />
          <div className="flex-1">
            <label className="font-medium text-gray-900">Usar turnos de caja</label>
            <p className="text-sm text-gray-600 mt-1">
              Recomendado: Cada cajero abrirá y cerrará turno con conteo de efectivo.
              Permite mejor control y auditoría.
            </p>
          </div>
        </div>
      </div>

      {props.useShifts && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Efectivo inicial sugerido (S/)
          </label>
          <input
            type="number"
            step="0.01"
            value={props.initialCash}
            onChange={(e) => props.setInitialCash(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="100.00"
          />
          <p className="text-xs text-gray-500 mt-1">Monto típico para dar vuelto al abrir turno</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Método de pago por defecto
        </label>
        <select
          value={props.defaultPaymentMethod}
          onChange={(e) => props.setDefaultPaymentMethod(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="CASH">Efectivo</option>
          <option value="YAPE">Yape</option>
          <option value="PLIN">Plin</option>
          <option value="CARD">Tarjeta</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">Se preseleccionará este método en cada venta</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900 mb-2">💡 Tips:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Si vendes mayormente al contado, usa "Efectivo" como predeterminado</li>
          <li>Puedes cambiar el método de pago en cada venta si es necesario</li>
          <li>Los turnos ayudan a detectar faltantes o sobrantes de caja</li>
        </ul>
      </div>
    </div>
  );
}

// ============= STEP 3: Productos =============
interface Step3Props {
  importMethod: 'csv' | 'manual' | null;
  setImportMethod: (val: 'csv' | 'manual' | null) => void;
  csvFile: File | null;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  csvPreview: any;
  loading: boolean;
  importing: boolean;
}

export function Step3Content(props: Step3Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Package className="w-8 h-8 text-purple-600" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Importar productos</h2>
          <p className="text-gray-600 text-sm">Carga tu catálogo o agrega productos manualmente</p>
        </div>
      </div>

      {!props.importMethod && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => props.setImportMethod('csv')}
            className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Upload className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <h3 className="font-medium text-gray-900 mb-1">Importar CSV</h3>
            <p className="text-sm text-gray-600">
              Carga un archivo con todos tus productos (hasta 500)
            </p>
          </button>

          <button
            onClick={() => props.setImportMethod('manual')}
            className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Package className="w-8 h-8 text-blue-600 mx-auto mb-3" />
            <h3 className="font-medium text-gray-900 mb-1">Agregar Manual</h3>
            <p className="text-sm text-gray-600">
              Ingresa tus productos uno por uno (para catálogos pequeños)
            </p>
          </button>
        </div>
      )}

      {props.importMethod === 'csv' && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800 mb-2">
              📋 Descarga primero la plantilla para ver el formato correcto
            </p>
            <a
              href="/api/onboarding/csv-template"
              download="plantilla_productos.csv"
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Descargar plantilla CSV
            </a>
          </div>

          {!props.csvFile && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <label className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700 font-medium">
                  Seleccionar archivo CSV
                </span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={props.handleFileSelect}
                  className="hidden"
                  disabled={props.loading}
                />
              </label>
              <p className="text-sm text-gray-500 mt-2">
                Máximo 500 productos • Formato UTF-8
              </p>
            </div>
          )}

          {props.csvPreview && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">
                    Preview: {props.csvPreview.summary.totalRows} productos
                  </p>
                  <p className="text-sm text-gray-600">
                    ✅ {props.csvPreview.summary.validRows} válidos •
                    ❌ {props.csvPreview.summary.errorRows} con errores
                  </p>
                </div>
                <button
                  onClick={() => {
                    props.setImportMethod(null);
                    // reset states
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Cambiar archivo
                </button>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Producto</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Precio</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Stock</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {props.csvPreview.preview.slice(0, 20).map((product: any, idx: number) => (
                      <tr key={idx} className={product.errors.length > 0 ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2">{product.nombre}</td>
                        <td className="px-4 py-2">S/ {product.price}</td>
                        <td className="px-4 py-2">{product.stock} {product.unitType}</td>
                        <td className="px-4 py-2">
                          {product.errors.length > 0 ? (
                            <span className="text-red-600 text-xs">{product.errors[0]}</span>
                          ) : (
                            <span className="text-green-600 text-xs">✓ OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {props.csvPreview.summary.hasMore && (
                <div className="bg-gray-50 px-4 py-2 border-t text-center text-sm text-gray-600">
                  ... y {props.csvPreview.summary.totalRows - 20} productos más
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {props.importMethod === 'manual' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <Package className="w-12 h-12 text-blue-600 mx-auto mb-3" />
          <p className="text-gray-700 mb-4">
            Esta opción te redirigirá a Inventario para agregar productos uno por uno.
          </p>
          <button
            onClick={() => window.location.href = '/inventory?addProduct=true'}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Ir a Inventario
          </button>
        </div>
      )}
    </div>
  );
}

// ============= STEP 4: Usuarios =============
interface Step4Props {
  cashierName: string;
  setCashierName: (val: string) => void;
  cashierEmail: string;
  setCashierEmail: (val: string) => void;
  cashierPassword: string;
  setCashierPassword: (val: string) => void;
}

export function Step4Content(props: Step4Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-8 h-8 text-indigo-600" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Crear cajero</h2>
          <p className="text-gray-600 text-sm">Opcional: Puedes crear usuarios adicionales después</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 Si ahora solo vas a usar tú el sistema, puedes omitir este paso y crear cajeros más tarde desde Configuración → Usuarios
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Nombre del cajero
        </label>
        <input
          type="text"
          value={props.cashierName}
          onChange={(e) => props.setCashierName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Ej: María González"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email de acceso
        </label>
        <input
          type="email"
          value={props.cashierEmail}
          onChange={(e) => props.setCashierEmail(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="cajero@tienda.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contraseña
        </label>
        <input
          type="password"
          value={props.cashierPassword}
          onChange={(e) => props.setCashierPassword(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Mínimo 6 caracteres"
        />
        <p className="text-xs text-gray-500 mt-1">El cajero podrá cambiarla después</p>
      </div>
    </div>
  );
}

// ============= STEP 5: Ticket Preview =============
interface Step5Props {
  storeName: string;
  ticketHeader1: string;
  ticketHeader2: string;
}

export function Step5Content(props: Step5Props) {
  const handleTestPrint = () => {
    window.print();
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #ticket-preview, #ticket-preview * {
            visibility: visible;
          }
          #ticket-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
      
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Receipt className="w-8 h-8 text-orange-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Preview del ticket</h2>
            <p className="text-gray-600 text-sm">Así se verá el ticket de tus ventas</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-3">Vista previa</h3>
            <div id="ticket-preview" className="border rounded-lg p-6 bg-white font-mono text-sm max-w-xs mx-auto">
              <div className="text-center mb-4">
                <p className="font-bold">{props.ticketHeader1 || props.storeName || 'MI BODEGA'}</p>
                {props.ticketHeader2 && <p className="text-xs">{props.ticketHeader2}</p>}
              </div>
              
              <div className="border-t border-dashed my-3"></div>
              
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Coca Cola 1.5L</span>
                  <span>S/ 5.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Pan Frances</span>
                  <span>S/ 0.30</span>
                </div>
                <div className="flex justify-between">
                  <span>Azucar 1kg</span>
                  <span>S/ 4.50</span>
                </div>
              </div>
              
              <div className="border-t border-dashed my-3"></div>
              
              <div className="flex justify-between font-bold">
                <span>TOTAL:</span>
                <span>S/ 9.80</span>
              </div>
              
              <div className="text-center mt-4 text-xs">
                <p>¡Gracias por su compra!</p>
                <p className="text-[10px] text-gray-500 mt-2">
                  {new Date().toLocaleString('es-PE')}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Configuración</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Formato:</span>
                  <span className="font-medium">80mm (térmico)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Codificación:</span>
                  <span className="font-medium">UTF-8</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fuente:</span>
                  <span className="font-medium">Monospace 12pt</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleTestPrint}
              className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium flex items-center justify-center gap-2"
            >
              <Receipt className="w-5 h-5" />
              Imprimir ticket de prueba
            </button>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                💡 Asegúrate de que tu impresora térmica esté configurada para 80mm de ancho.
                Puedes cambiar el encabezado después en Configuración.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============= STEP 6: Completado =============
interface Step6Props {
  onComplete: () => void;
  loading: boolean;
}

export function Step6Content(props: Step6Props) {
  return (
    <div className="text-center py-8">
      <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
      
      <h2 className="text-2xl font-bold text-gray-900 mb-3">
        ¡Todo listo para empezar! 🎉
      </h2>
      
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Tu tienda está configurada y lista para realizar ventas.
        Puedes empezar a usar el sistema de punto de venta ahora mismo.
      </p>

      <button
        onClick={props.onComplete}
        disabled={props.loading}
        className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg inline-flex items-center gap-2"
      >
        <CheckCircle className="w-5 h-5" />
        {props.loading ? 'Guardando...' : 'Ir al Punto de Venta'}
      </button>

      <div className="mt-8 pt-8 border-t max-w-md mx-auto">
        <h3 className="font-medium text-gray-900 mb-4">Próximos pasos recomendados:</h3>
        <ul className="space-y-2 text-sm text-gray-600 text-left">
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">✓</span>
            <span>Revisar que todos los productos tengan precio correcto</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">✓</span>
            <span>Configurar impresora térmica para tickets de 80mm</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">✓</span>
            <span>Hacer una venta de prueba antes de abrir al público</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5">✓</span>
            <span>Explorar reportes y configuración de promociones</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
