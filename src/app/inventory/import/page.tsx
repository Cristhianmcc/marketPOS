'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/AuthLayout';
import { Upload, FileText, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface CSVRow {
  name: string;
  category: string;
  barcode?: string;
  brand?: string;
  content?: string;
  unitType: 'UNIT' | 'KG';
  price: number;
  stock?: number;
  minStock?: number;
}

interface ImportPreview {
  newProducts: CSVRow[];
  existingProducts: CSVRow[];
  errors: { row: number; message: string }[];
}

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState({
    price: false,
    stock: false,
  });

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
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());
      
      if (lines.length < 2) {
        toast.error('El archivo está vacío o no tiene datos');
        setLoading(false);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const requiredHeaders = ['name', 'category', 'unittype', 'price'];
      const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

      if (missingHeaders.length > 0) {
        toast.error(`Faltan columnas requeridas: ${missingHeaders.join(', ')}`);
        setLoading(false);
        return;
      }

      const rows: CSVRow[] = [];
      const errors: { row: number; message: string }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const row: any = {};

        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Validaciones
        if (!row.name) {
          errors.push({ row: i + 1, message: 'Nombre es requerido' });
          continue;
        }
        if (!row.category) {
          errors.push({ row: i + 1, message: 'Categoría es requerida' });
          continue;
        }
        if (!['UNIT', 'KG'].includes(row.unittype?.toUpperCase())) {
          errors.push({ row: i + 1, message: 'unitType debe ser UNIT o KG' });
          continue;
        }
        if (!row.price || isNaN(parseFloat(row.price)) || parseFloat(row.price) <= 0) {
          errors.push({ row: i + 1, message: 'Precio inválido' });
          continue;
        }

        const csvRow: CSVRow = {
          name: row.name,
          category: row.category,
          barcode: row.barcode || undefined,
          brand: row.brand || undefined,
          content: row.content || undefined,
          unitType: row.unittype.toUpperCase() as 'UNIT' | 'KG',
          price: parseFloat(row.price),
          stock: row.stock ? parseFloat(row.stock) : undefined,
          minStock: row.minstock ? parseFloat(row.minstock) : undefined,
        };

        rows.push(csvRow);
      }

      // Verificar productos existentes
      const res = await fetch('/api/products');
      const { products: existingDbProducts } = await res.json();
      
      const newProducts: CSVRow[] = [];
      const existingProducts: CSVRow[] = [];

      rows.forEach((row) => {
        const exists = existingDbProducts.some(
          (p: any) => p.barcode && row.barcode && p.barcode === row.barcode
        );
        
        if (exists) {
          existingProducts.push(row);
        } else {
          newProducts.push(row);
        }
      });

      setPreview({ newProducts, existingProducts, errors });
      
      if (errors.length > 0) {
        toast.warning(`${errors.length} filas con errores fueron omitidas`);
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

    setImporting(true);
    try {
      const res = await fetch('/api/inventory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newProducts: preview.newProducts,
          existingProducts: preview.existingProducts,
          updateExisting,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(
          `Importación exitosa: ${data.created} creados, ${data.updated} actualizados`
        );
        setTimeout(() => router.push('/inventory'), 1500);
      } else {
        toast.error(data.error || 'Error en la importación');
      }
    } catch (error) {
      console.error('Error importing:', error);
      toast.error('Error de conexión');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AuthLayout storeName="Importar Inventario">
      <Toaster position="top-right" richColors />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => router.push('/inventory')}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#1F2A37] mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inventario
            </button>
            <h1 className="text-2xl font-semibold text-[#1F2A37]">Importar desde CSV</h1>
            <p className="text-sm text-gray-500 mt-1">
              Carga un archivo CSV con tus productos para importarlos masivamente
            </p>
          </div>

          {/* Upload Section */}
          {!preview && (
            <div className="bg-white border border-gray-200 rounded-lg p-8">
              <div className="max-w-md mx-auto">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-[#1F2A37] font-medium mb-2">
                    Arrastra tu archivo CSV o haz clic para seleccionar
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="csv-upload"
                    disabled={loading}
                  />
                  <label
                    htmlFor="csv-upload"
                    className="inline-block mt-4 px-4 py-2 bg-[#16A34A] text-white rounded-md text-sm font-medium cursor-pointer hover:bg-[#15803d] transition-colors"
                  >
                    {loading ? 'Procesando...' : 'Seleccionar archivo'}
                  </label>
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-medium text-[#1F2A37] mb-2">Formato del CSV:</p>
                  <p className="text-xs text-gray-600 font-mono">
                    name,category,unitType,price,barcode,brand,content,stock,minStock
                  </p>
                  <ul className="mt-3 text-xs text-gray-600 space-y-1">
                    <li>• Columnas requeridas: name, category, unitType, price</li>
                    <li>• unitType: UNIT o KG</li>
                    <li>• barcode: opcional, 8-14 dígitos</li>
                    <li>• stock/minStock: opcionales (números)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Preview Section */}
          {preview && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-[#1F2A37]">
                        {preview.newProducts.length}
                      </p>
                      <p className="text-sm text-gray-500">Productos nuevos</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-[#1F2A37]">
                        {preview.existingProducts.length}
                      </p>
                      <p className="text-sm text-gray-500">Ya existentes</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-[#1F2A37]">{preview.errors.length}</p>
                      <p className="text-sm text-gray-500">Errores</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Update Options */}
              {preview.existingProducts.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-[#1F2A37] mb-3">
                    Opciones para productos existentes:
                  </p>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={updateExisting.price}
                        onChange={(e) =>
                          setUpdateExisting({ ...updateExisting, price: e.target.checked })
                        }
                        className="w-4 h-4 text-[#16A34A] border-gray-300 rounded focus:ring-[#16A34A]"
                      />
                      <span className="text-sm text-gray-700">Actualizar precios</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={updateExisting.stock}
                        onChange={(e) =>
                          setUpdateExisting({ ...updateExisting, stock: e.target.checked })
                        }
                        className="w-4 h-4 text-[#16A34A] border-gray-300 rounded focus:ring-[#16A34A]"
                      />
                      <span className="text-sm text-gray-700">Actualizar stock</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200">
                  <p className="text-sm font-medium text-[#1F2A37]">
                    Vista previa (primeras 20 filas)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Nombre
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Categoría
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Código
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
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {[...preview.newProducts, ...preview.existingProducts]
                        .slice(0, 20)
                        .map((row, index) => {
                          const isExisting = preview.existingProducts.includes(row);
                          return (
                            <tr key={index} className={isExisting ? 'bg-blue-50' : ''}>
                              <td className="px-4 py-2 text-sm text-[#1F2A37]">{row.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-600">{row.category}</td>
                              <td className="px-4 py-2 text-xs font-mono text-gray-600">
                                {row.barcode || '—'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className="inline-flex px-2 py-1 bg-gray-100 rounded-md text-xs text-gray-700">
                                  {row.unitType}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-sm text-[#1F2A37]">
                                S/ {row.price.toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-right text-sm text-gray-600">
                                {row.stock ?? '—'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span
                                  className={`inline-flex px-2 py-1 rounded-md text-xs ${
                                    isExisting
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-green-100 text-green-700'
                                  }`}
                                >
                                  {isExisting ? 'Existente' : 'Nuevo'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    Errores encontrados ({preview.errors.length}):
                  </p>
                  <ul className="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {preview.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>
                        Fila {err.row}: {err.message}
                      </li>
                    ))}
                    {preview.errors.length > 10 && (
                      <li className="font-medium">... y {preview.errors.length - 10} más</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cargar otro archivo
                </button>
                <button
                  onClick={handleImport}
                  disabled={
                    importing ||
                    (preview.newProducts.length === 0 && preview.existingProducts.length === 0)
                  }
                  className="px-6 py-2 bg-[#16A34A] text-white rounded-md text-sm font-medium hover:bg-[#15803d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? 'Importando...' : 'Confirmar importación'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthLayout>
  );
}
