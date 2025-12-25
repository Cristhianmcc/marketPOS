'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, AlertCircle, CheckCircle2, Database } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminBackupsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        router.push('/login');
        return;
      }
      setLoading(false);
    } catch (error) {
      router.push('/login');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        toast.error('Solo se permiten archivos .zip');
        return;
      }
      setSelectedFile(file);
      setResult(null);
    }
  }

  async function handleRestore() {
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
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-gray-600">Verificando acceso...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/pos')}
            className="text-purple-600 hover:text-purple-800 mb-4"
          >
            ← Volver al POS
          </button>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Database className="w-8 h-8" />
            Administración de Backups
          </h1>
          <p className="text-gray-600 mt-2">Panel exclusivo para SUPERADMIN</p>
        </div>

        {/* Restore Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Restaurar Backup a Nueva Tienda
          </h2>

          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar archivo de backup (.zip)
              </label>
              <input
                type="file"
                accept=".zip"
                onChange={handleFileChange}
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

            {/* Restore Button */}
            <button
              onClick={handleRestore}
              disabled={!selectedFile || restoring}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-semibold
                hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              <Upload className="w-5 h-5" />
              {restoring ? 'Restaurando...' : 'Restaurar como Nueva Tienda'}
            </button>

            {/* Info Cards */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
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
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
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

        {/* Result Display */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
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
    </div>
  );
}
