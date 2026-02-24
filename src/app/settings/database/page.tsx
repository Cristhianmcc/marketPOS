'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Database, 
  Server, 
  PlayCircle, 
  StopCircle, 
  RefreshCw,
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';

// Tipos - deben coincidir con preload.ts
type PgRunMode = 'APP_LIFETIME' | 'TASK_AT_LOGON' | 'WINDOWS_SERVICE';

interface PgStatus {
  running: boolean;
  configured: boolean;
  runMode: PgRunMode;
  port: number | null;
  pid?: number;
  taskRegistered?: boolean;
  serviceInstalled?: boolean;
  serviceRunning?: boolean;
}

interface PgConfigInfo {
  port: number;
  user: string;
  db: string;
  dataDir: string;
  runMode: PgRunMode;
  initialized: boolean;
  lastStarted?: string;
}

// Detectar si estamos en Electron
const isDesktop = typeof window !== 'undefined' && (window as any).desktop?.isDesktop;

export default function DatabaseSettingsPage() {
  const [status, setStatus] = useState<PgStatus | null>(null);
  const [config, setConfig] = useState<PgConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingMode, setChangingMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isDesktop) {
      setLoading(false);
      return;
    }

    try {
      const desktop = (window as any).desktop;
      const [pgStatus, pgConfig, admin] = await Promise.all([
        desktop.pg.getStatus(),
        desktop.pg.getConfig(),
        desktop.pg.isAdmin(),
      ]);
      
      setStatus(pgStatus);
      setConfig(pgConfig);
      setIsAdmin(admin);
    } catch (error) {
      console.error('Error loading PostgreSQL status:', error);
      toast.error('Error al cargar estado de PostgreSQL');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh cada 5 segundos
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSetRunMode = async (mode: PgRunMode) => {
    if (!isDesktop) return;
    
    setChangingMode(true);
    try {
      const desktop = (window as any).desktop;
      const result = await desktop.pg.setRunMode(mode);
      
      if (result.success) {
        toast.success(`Modo cambiado a ${getModeLabel(mode)}`);
        await loadData();
      } else {
        if (result.requiresAdmin) {
          toast.error('Se requieren permisos de administrador', {
            description: 'Ejecuta la aplicación como administrador para usar este modo.'
          });
        } else {
          toast.error(result.error || 'Error al cambiar modo');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar modo');
    } finally {
      setChangingMode(false);
    }
  };

  const handleStart = async () => {
    if (!isDesktop) return;
    setActionLoading('start');
    try {
      const result = await (window as any).desktop.pg.start();
      if (result.success) {
        toast.success('PostgreSQL iniciado');
        await loadData();
      } else {
        toast.error(result.error || 'Error al iniciar PostgreSQL');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async () => {
    if (!isDesktop) return;
    setActionLoading('stop');
    try {
      const result = await (window as any).desktop.pg.stop();
      if (result.success) {
        toast.success('PostgreSQL detenido');
        await loadData();
      } else {
        toast.error(result.error || 'Error al detener PostgreSQL');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const getModeLabel = (mode: PgRunMode): string => {
    switch (mode) {
      case 'APP_LIFETIME':
        return 'Ciclo de Vida de App';
      case 'TASK_AT_LOGON':
        return 'Tarea Programada (al iniciar sesión)';
      case 'WINDOWS_SERVICE':
        return 'Servicio de Windows';
      default:
        return mode;
    }
  };

  const getModeDescription = (mode: PgRunMode): string => {
    switch (mode) {
      case 'APP_LIFETIME':
        return 'PostgreSQL se inicia y detiene junto con la aplicación. No requiere permisos especiales.';
      case 'TASK_AT_LOGON':
        return 'PostgreSQL se inicia automáticamente al iniciar sesión en Windows. No requiere permisos de administrador.';
      case 'WINDOWS_SERVICE':
        return 'PostgreSQL se ejecuta como servicio de Windows. Permanece activo incluso sin sesión iniciada. Requiere permisos de administrador.';
      default:
        return '';
    }
  };

  // Si no es desktop, mostrar mensaje
  if (!isDesktop) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Base de Datos Local</h1>
        <p className="text-gray-600 mb-8">
          Configuración de PostgreSQL embebido
        </p>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-800">Solo disponible en Desktop</h3>
              <p className="text-yellow-700 mt-1">
                Esta configuración solo está disponible en la versión de escritorio de Monterrial POS.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Base de Datos Local</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Cargando estado...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Base de Datos Local</h1>
      <p className="text-gray-600 mb-8">
        Configuración de PostgreSQL embebido para modo offline
      </p>

      {/* Estado Actual */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <Database className="w-6 h-6 text-blue-600 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-4">Estado de PostgreSQL</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Estado de Ejecución */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {status?.running ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    {status?.running ? 'Ejecutándose' : 'Detenido'}
                  </span>
                </div>
                {status?.running && status?.pid && (
                  <p className="text-sm text-gray-600">PID: {status.pid}</p>
                )}
                {config?.port && (
                  <p className="text-sm text-gray-600">Puerto: {config.port}</p>
                )}
              </div>

              {/* Modo Actual */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="w-5 h-5 text-blue-600" />
                  <span className="font-medium">Modo de Ejecución</span>
                </div>
                <p className="text-sm text-gray-600">
                  {status?.runMode ? getModeLabel(status.runMode) : 'No configurado'}
                </p>
              </div>

              {/* Tarea Programada */}
              {status?.taskRegistered !== undefined && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-purple-600" />
                    <span className="font-medium">Tarea Programada</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {status.taskRegistered ? 'Registrada' : 'No registrada'}
                  </p>
                </div>
              )}

              {/* Servicio Windows */}
              {status?.serviceInstalled !== undefined && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                    <span className="font-medium">Servicio Windows</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {status.serviceInstalled 
                      ? (status.serviceRunning ? 'Instalado y ejecutándose' : 'Instalado (detenido)')
                      : 'No instalado'}
                  </p>
                </div>
              )}
            </div>

            {/* Acciones rápidas */}
            <div className="flex gap-3">
              <button
                onClick={handleStart}
                disabled={actionLoading !== null || status?.running}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  status?.running 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {actionLoading === 'start' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                Iniciar
              </button>
              
              <button
                onClick={handleStop}
                disabled={actionLoading !== null || !status?.running}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  !status?.running 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {actionLoading === 'stop' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <StopCircle className="w-4 h-4" />
                )}
                Detener
              </button>

              <button
                onClick={loadData}
                disabled={actionLoading !== null}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Actualizar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Selector de Modo */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <Server className="w-6 h-6 text-purple-600 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-2">Modo de Ejecución</h2>
            <p className="text-gray-600 mb-4">
              Elige cómo PostgreSQL debe ejecutarse en tu sistema.
            </p>

            <div className="space-y-4">
              {(['APP_LIFETIME', 'TASK_AT_LOGON', 'WINDOWS_SERVICE'] as PgRunMode[]).map((mode) => (
                <label
                  key={mode}
                  className={`block p-4 border rounded-lg cursor-pointer transition-all ${
                    status?.runMode === mode 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  } ${mode === 'WINDOWS_SERVICE' && !isAdmin ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="runMode"
                      value={mode}
                      checked={status?.runMode === mode}
                      disabled={changingMode || (mode === 'WINDOWS_SERVICE' && !isAdmin)}
                      onChange={() => handleSetRunMode(mode)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{getModeLabel(mode)}</span>
                        {mode === 'WINDOWS_SERVICE' && !isAdmin && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                            Requiere Admin
                          </span>
                        )}
                        {mode === 'APP_LIFETIME' && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                            Recomendado
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {getModeDescription(mode)}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {changingMode && (
              <div className="mt-4 flex items-center gap-2 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Cambiando modo de ejecución...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Información de Configuración */}
      {config && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold mb-4">Información de Configuración</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Usuario:</span>
              <span className="ml-2 font-mono">{config.user}</span>
            </div>
            <div>
              <span className="text-gray-600">Base de datos:</span>
              <span className="ml-2 font-mono">{config.db}</span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-600">Directorio de datos:</span>
              <span className="ml-2 font-mono text-xs break-all">{config.dataDir}</span>
            </div>
            {config.lastStarted && (
              <div className="col-span-2">
                <span className="text-gray-600">Último inicio:</span>
                <span className="ml-2">{new Date(config.lastStarted).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nota informativa */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Acerca del modo offline</p>
            <p>
              PostgreSQL embebido permite que Monterrial POS funcione completamente sin conexión a internet.
              Los datos se almacenan localmente y se sincronizan con la nube cuando hay conexión disponible.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
