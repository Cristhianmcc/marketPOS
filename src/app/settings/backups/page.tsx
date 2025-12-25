'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Download, AlertTriangle, Upload, CheckCircle2 } from 'lucide-react';

export default function BackupsPage() {
  const [exporting, setExporting] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    checkSuperAdmin();
  }, []);

  async function checkSuperAdmin() {
    try {
      const res = await fetch('/api/auth/is-superadmin');
      if (res.ok) {
        const data = await res.json();
        setIsSuperAdmin(data.isSuperAdmin);
      }
    } catch (error) {
      console.error('Error checking superadmin:', error);
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true);
      toast.info('Generando backup...');

      const res = await fetch('/api/backups/export');
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Error al exportar');
      }

      // Descargar archivo
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Extraer filename del header Content-Disposition
      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `backup_${new Date().toISOString().split('T')[0]}.zip`;
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Backup descargado exitosamente');
    } catch (error: any) {
      console.error('Error exporting backup:', error);
      toast.error(error.message || 'Error al exportar backup');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Backups y Restauración</h1>
      <p className="text-gray-600 mb-8">
        Gestiona copias de seguridad de tu tienda
      </p>

      {/* Export Backup */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <Download className="w-6 h-6 text-blue-600 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">Descargar Backup</h2>
            <p className="text-gray-600 mb-4">
              Exporta todos los datos de tu tienda en un archivo ZIP seguro.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="font-medium text-blue-900 mb-2">¿Qué incluye el backup?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ Inventario (productos y stock)</li>
                <li>✓ Historial de ventas y tickets</li>
                <li>✓ Turnos y caja</li>
                <li>✓ Clientes y cuentas por cobrar</li>
                <li>✓ Movimientos de inventario</li>
                <li>✓ Configuración de la tienda</li>
              </ul>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <h3 className="font-medium text-orange-900 mb-2">Seguridad</h3>
              <ul className="text-sm text-orange-800 space-y-1">
                <li>• Las contraseñas NO se exportan</li>
                <li>• El archivo contiene solo datos de tu tienda</li>
                <li>• Guarda el backup en un lugar seguro</li>
              </ul>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              <Download className="w-5 h-5" />
              {exporting ? 'Generando backup...' : 'Exportar Backup (ZIP)'}
            </button>
          </div>
        </div>
      </div>

      {/* Restore Backup - Solo SUPERADMIN */}
      {isSuperAdmin ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <Upload className="w-6 h-6 text-purple-600 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Restaurar Backup (SUPERADMIN)</h2>
              <p className="text-gray-600 mb-4">
                Crea una nueva tienda desde un archivo de backup.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seleccionar archivo de backup (.zip)
                  </label>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (!file.name.endsWith('.zip')) {
                          toast.error('Solo se permiten archivos .zip');
                          return;
                        }
                        setSelectedFile(file);
                        setResult(null);
                      }
                    }}
                    disabled={restoring}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-purple-50 file:text-purple-700
                      hover:file:bg-purple-100
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {selectedFile && (
                    <p className="mt-2 text-sm text-gray-600">
                      Archivo seleccionado: <span className="font-medium">{selectedFile.name}</span>
                    </p>
                  )}
                </div>

                <button
                  onClick={async () => {
                    if (!selectedFile) {
                      toast.error('Selecciona un archivo de backup');
                      return;
                    }

                    setRestoring(true);
                    toast.info('Restaurando backup...');

                    try {
                      const formData = new FormData();
                      formData.append('backup', selectedFile);

                      const response = await fetch('/api/backups/restore/new-store', {
                        method: 'POST',
                        body: formData,
                      });

                      const data = await response.json();

                      if (!response.ok) {
                        toast.error(data.message || 'Error al restaurar backup');
                        return;
                      }

                      setResult(data);
                      toast.success('Backup restaurado exitosamente');
                      setSelectedFile(null);
                    } catch (error: any) {
                      console.error(error);
                      toast.error('Error al restaurar backup');
                    } finally {
                      setRestoring(false);
                    }
                  }}
                  disabled={!selectedFile || restoring}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-semibold
                    hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  {restoring ? 'Restaurando...' : 'Restaurar como Nueva Tienda'}
                </button>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">Qué hace esta operación:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Crea una nueva tienda con los datos del backup</li>
                        <li>Genera un OWNER con contraseña temporal</li>
                        <li>Preserva todo el historial (ventas, turnos, cuentas)</li>
                        <li>NO afecta ninguna tienda existente</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-orange-800">
                      <p className="font-semibold mb-1">Seguridad:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Valida integridad con checksum SHA-256</li>
                        <li>Si el email del OWNER ya existe, genera uno alternativo automáticamente</li>
                        <li>El backup NO contiene contraseñas del sistema original</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mt-1" />
            <div>
              <h3 className="font-semibold text-yellow-900 mb-2">Restauración de Backups</h3>
              <p className="text-sm text-yellow-800 mb-2">
                La restauración de backups solo está disponible para administradores del sistema.
              </p>
              <p className="text-sm text-yellow-800">
                Si necesitas restaurar un backup, contacta al soporte técnico.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mt-6">
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-bold text-green-800">Backup Restaurado Exitosamente</h3>
              <p className="text-sm text-green-700 mt-1">{result.message}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Nueva Tienda:</p>
              <p className="text-lg font-bold text-gray-900">{result.store.name}</p>
              <p className="text-xs text-gray-500">ID: {result.store.id}</p>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Credenciales del OWNER:</p>
              <div className="bg-gray-50 rounded p-3 space-y-2">
                <div>
                  <p className="text-xs text-gray-600">Email:</p>
                  <p className="font-mono text-sm font-semibold text-gray-900">{result.owner.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Contraseña Temporal:</p>
                  <p className="font-mono text-sm font-semibold text-red-600">{result.owner.temporaryPassword}</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-xs font-semibold text-red-800 mb-1">⚠️ IMPORTANTE:</p>
              <p className="text-xs text-red-700">
                {result.warning} Esta información solo se muestra una vez. Guárdala en un lugar seguro
                y entrégala al dueño de la tienda para que cambie la contraseña inmediatamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
