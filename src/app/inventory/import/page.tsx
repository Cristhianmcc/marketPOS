'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { 
  Upload, FileText, AlertCircle, CheckCircle, ArrowLeft, 
  Download, X, RefreshCw, Wrench, ShoppingBag, FileSpreadsheet
} from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface ParsedConversion {
  unitCode: string;
  factor: number;
}

interface ParsedProduct {
  row: number;
  name: string;
  category: string;
  barcode: string | null;
  brand: string | null;
  content: string | null;
  baseUnitCode: string;
  price: number;
  stock: number;
  minStock: number | null;
  conversions: ParsedConversion[];
  errors: string[];
  warnings: string[];
}

interface PreviewSummary {
  totalRows: number;
  previewRows: number;
  validRows: number;
  errorRows: number;
  hasMore: boolean;
}

interface AvailableUnit {
  code: string;
  symbol: string | null;
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedProduct[] | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);

  // Templates
  const templates = [
    { 
      name: 'Ferretería', 
      file: '/templates/plantilla-ferreteria.csv',
      icon: Wrench,
      description: '100+ productos de ferretería con conversiones'
    },
    { 
      name: 'Bodega', 
      file: '/templates/plantilla-bodega.csv',
      icon: ShoppingBag,
      description: '90+ productos de bodega/minimarket'
    },
    { 
      name: 'Plantilla Vacía', 
      file: '/templates/plantilla-vacia.csv',
      icon: FileSpreadsheet,
      description: 'Solo cabeceras, para llenar manualmente'
    },
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Solo se permiten archivos CSV');
      return;
    }

    setFile(selectedFile);
    await processFile(selectedFile);
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setPreview(null);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/products/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error al procesar el archivo');
        setLoading(false);
        return;
      }

      setPreview(data.preview);
      setSummary(data.summary);
      setAvailableUnits(data.availableUnits || []);

      if (data.summary.errorRows > 0) {
        toast.warning(`${data.summary.errorRows} filas con errores`);
      } else {
        toast.success(`${data.summary.validRows} productos listos para importar`);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error al procesar el archivo CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    // Filter only valid products
    const validProducts = preview.filter(p => p.errors.length === 0);
    
    if (validProducts.length === 0) {
      toast.error('No hay productos válidos para importar');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/products/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: validProducts,
          updateExisting,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Error en la importación');
        setImporting(false);
        return;
      }

      const { result } = data;
      toast.success(
        `Importación exitosa: ${result.created} creados, ${result.updated} actualizados, ${result.skipped} omitidos`
      );

      setTimeout(() => router.push('/inventory'), 1500);
    } catch (error) {
      console.error('Error importing:', error);
      toast.error('Error de conexión');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

  return (
    <AuthLayout storeName="Importar Inventario">
      <Toaster position="top-right" richColors />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push('/inventory')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inventario
            </button>
            <h1 className="text-2xl font-semibold text-gray-900">Importar desde CSV</h1>
            <p className="text-sm text-gray-500 mt-1">
              Carga un archivo CSV con tus productos. Soporta unidades de medida y conversiones.
            </p>
          </div>

          {/* Templates Section */}
          {!preview && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-gray-700 mb-3">
                Plantillas de ejemplo (descargar y editar):
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((template) => {
                  const Icon = template.icon;
                  return (
                    <a
                      key={template.name}
                      href={template.file}
                      download
                      className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all"
                    >
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{template.name}</p>
                        <p className="text-xs text-gray-500">{template.description}</p>
                        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          Descargar CSV
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Section */}
          {!preview && (
            <div className="bg-white border border-gray-200 rounded-lg p-8">
              <div className="max-w-md mx-auto">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-400 transition-colors">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-900 font-medium mb-2">
                    Arrastra tu archivo CSV o haz clic para seleccionar
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="csv-upload"
                    disabled={loading}
                  />
                  <label
                    htmlFor="csv-upload"
                    className="inline-block mt-4 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium cursor-pointer hover:bg-green-700 transition-colors"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Procesando...
                      </span>
                    ) : (
                      'Seleccionar archivo'
                    )}
                  </label>
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-gray-900 mb-2">Formato del CSV:</p>
                  <p className="text-xs text-gray-600 font-mono break-all">
                    name,category,barcode,brand,content,baseUnitCode,price,stock,minStock,conversions
                  </p>
                  <ul className="mt-3 text-xs text-gray-600 space-y-1">
                    <li>• <strong>name</strong>: Nombre del producto (requerido)</li>
                    <li>• <strong>baseUnitCode</strong>: UNIT, KG, M, L, M2, etc.</li>
                    <li>• <strong>conversions</strong>: opcional, formato "BOX:12,PACK:6"</li>
                    <li>• Separador: coma (,) o punto y coma (;)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Preview Section */}
          {preview && summary && (
            <div className="space-y-6">
              {/* File info */}
              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file?.name}</p>
                    <p className="text-xs text-gray-500">{summary.totalRows} filas totales</p>
                  </div>
                </div>
                <button
                  onClick={resetForm}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-gray-900">{summary.validRows}</p>
                      <p className="text-sm text-gray-500">Productos válidos</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-gray-900">{summary.errorRows}</p>
                      <p className="text-sm text-gray-500">Con errores</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <RefreshCw className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={updateExisting}
                          onChange={(e) => setUpdateExisting(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Actualizar existentes</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">Sobrescribir precio/stock</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900">
                    Vista previa (primeras {summary.previewRows} filas)
                    {summary.hasMore && <span className="text-gray-500"> de {summary.totalRows}</span>}
                  </p>
                  {availableUnits.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Unidades: {availableUnits.map(u => u.code).join(', ')}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Fila
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Nombre
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Categoría
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Unidad
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Precio
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Stock
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Conversiones
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {preview.map((row) => {
                        const hasErrors = row.errors.length > 0;
                        const hasWarnings = row.warnings.length > 0;
                        
                        return (
                          <tr key={row.row} className={hasErrors ? 'bg-red-50' : hasWarnings ? 'bg-yellow-50' : ''}>
                            <td className="px-4 py-2 text-xs text-gray-500">{row.row}</td>
                            <td className="px-4 py-2">
                              <p className="text-sm text-gray-900">{row.name || '—'}</p>
                              {row.barcode && (
                                <p className="text-xs text-gray-500 font-mono">{row.barcode}</p>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">{row.category}</td>
                            <td className="px-4 py-2 text-center">
                              <span className="inline-flex px-2 py-1 bg-gray-100 rounded-md text-xs text-gray-700">
                                {row.baseUnitCode}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-sm text-gray-900">
                              {formatMoney(row.price)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm text-gray-600">
                              {row.stock}
                            </td>
                            <td className="px-4 py-2">
                              {row.conversions.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.conversions.map((conv, i) => (
                                    <span 
                                      key={i}
                                      className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                                    >
                                      {conv.unitCode}:{conv.factor}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {hasErrors ? (
                                <div className="group relative">
                                  <span className="inline-flex px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs cursor-help">
                                    Error
                                  </span>
                                  <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10 w-48 p-2 bg-red-800 text-white text-xs rounded shadow-lg">
                                    {row.errors.join(', ')}
                                  </div>
                                </div>
                              ) : hasWarnings ? (
                                <div className="group relative">
                                  <span className="inline-flex px-2 py-1 bg-yellow-100 text-yellow-700 rounded-md text-xs cursor-help">
                                    Aviso
                                  </span>
                                  <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10 w-48 p-2 bg-yellow-800 text-white text-xs rounded shadow-lg">
                                    {row.warnings.join(', ')}
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs">
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cargar otro archivo
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || summary.validRows === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {importing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importar {summary.validRows} productos
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthLayout>
  );
}
