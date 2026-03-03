'use client';

import { useState, useEffect } from 'react';
import { Printer, Wifi, Usb, Check, X, AlertCircle, TestTube, Save, Bluetooth, RefreshCw, Bug } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { toast } from 'sonner';

type PrinterMode = 'HTML' | 'ESCPOS_USB' | 'ESCPOS_NET' | 'ESCPOS_RASTER' | 'ESCPOS_BT';

interface EscposConfig {
  mode: PrinterMode;
  vendorId: number | null;
  productId: number | null;
  netHost: string | null;
  netPort: number;
  netTimeout: number;
  btPort: string | null;
  btBaud: number;
  charsPerLine: 32 | 42 | 48;
  autoCut: boolean;
  openCashDrawer: boolean;
  encoding: string;
  ticketWebsite: string;
  ticketSlogan: string;
  ticketShowQr: boolean;
}

interface UsbDevice {
  vendorId: number;
  productId: number;
  name: string;
  manufacturer?: string;
}

interface BtPortInfo {
  path: string;
  friendlyName: string;
  isBluetooth: boolean;
}

interface PingResult {
  ok: boolean;
  reason?: string;
  latencyMs?: number;
}

// Check if we're in desktop environment
function useDesktopEscpos() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [api, setApi] = useState<{
    getConfig: () => Promise<EscposConfig>;
    updateConfig: (config: Partial<EscposConfig>) => Promise<EscposConfig>;
    testPrint: (full?: boolean) => Promise<{ success: boolean; error?: string }>;
    listUsb: () => Promise<UsbDevice[]>;
    listBt: () => Promise<BtPortInfo[]>;
    netPing: (host?: string, port?: number) => Promise<PingResult>;
    diagnose: () => Promise<string>;
  } | null>(null);

  useEffect(() => {
    const desktop = (window as unknown as { 
      desktop?: { 
        isDesktop: boolean;
        escpos?: typeof api;
      } 
    })?.desktop;
    
    if (desktop?.isDesktop && desktop?.escpos) {
      setIsDesktop(true);
      setApi(desktop.escpos);
    }
  }, []);

  return { isDesktop, api };
}

export default function PrinterSettingsPage() {
  const { isDesktop, api } = useDesktopEscpos();
  const [config, setConfig] = useState<EscposConfig | null>(null);
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [loadingUsb, setLoadingUsb] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseReport, setDiagnoseReport] = useState<string | null>(null);

  // Bluetooth state
  const [btPorts, setBtPorts] = useState<BtPortInfo[]>([]);
  const [selectedBt, setSelectedBt] = useState<string>('');
  const [loadingBt, setLoadingBt] = useState(false);

  // Form state
  const [mode, setMode] = useState<PrinterMode>('HTML');
  const [netHost, setNetHost] = useState('127.0.0.1');
  const [netPort, setNetPort] = useState(9100);
  const [selectedUsb, setSelectedUsb] = useState<string>('');
  const [manualVid, setManualVid] = useState('');
  const [manualPid, setManualPid] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [autoCut, setAutoCut] = useState(true);
  const [openCashDrawer, setOpenCashDrawer] = useState(false);
  const [charsPerLine, setCharsPerLine] = useState<32 | 42 | 48>(42);
  const [ticketWebsite, setTicketWebsite] = useState('');
  const [ticketSlogan, setTicketSlogan] = useState('Gracias por su compra!');
  const [ticketShowQr, setTicketShowQr] = useState(false);

  const refreshUsbDevices = async () => {
    if (!api) return;
    setLoadingUsb(true);
    try {
      const devices = await api.listUsb().catch(() => [] as UsbDevice[]);
      setUsbDevices(devices);
    } finally {
      setLoadingUsb(false);
    }
  };

  const refreshBtPorts = async () => {
    if (!api) return;
    setLoadingBt(true);
    try {
      const ports = await api.listBt().catch(() => [] as BtPortInfo[]);
      setBtPorts(ports);
    } finally {
      setLoadingBt(false);
    }
  };

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      if (!api) {
        setLoading(false);
        return;
      }

      try {
        const [cfg, devices] = await Promise.all([
          api.getConfig(),
          api.listUsb().catch(() => [] as UsbDevice[])
        ]);
        
        setConfig(cfg);
        setUsbDevices(devices);
        
        // Set form values
        setMode(cfg.mode);
        setNetHost(cfg.netHost || '127.0.0.1');
        setNetPort(cfg.netPort || 9100);
        setAutoCut(cfg.autoCut);
        setOpenCashDrawer(cfg.openCashDrawer);
        setCharsPerLine((cfg.charsPerLine as 32 | 42 | 48) || 42);
        setTicketWebsite(cfg.ticketWebsite || '');
        setTicketSlogan(cfg.ticketSlogan || 'Gracias por su compra!');
        setTicketShowQr(cfg.ticketShowQr ?? false);
        
        if (cfg.vendorId && cfg.productId) {
          setSelectedUsb(`${cfg.vendorId}:${cfg.productId}`);
        }

        if (cfg.btPort) {
          setSelectedBt(cfg.btPort);
        }

        // Pre-load BT ports if already in BT mode
        if (cfg.mode === 'ESCPOS_BT') {
          const ports = await api.listBt().catch(() => [] as BtPortInfo[]);
          setBtPorts(ports);
        }
      } catch (err) {
        console.error('Error loading printer config:', err);
        toast.error('Error al cargar configuración');
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [api]);

  const handleSave = async () => {
    if (!api) return;
    
    setSaving(true);
    try {
      const updates: Partial<EscposConfig> = {
        mode,
        autoCut,
        openCashDrawer,
        charsPerLine,
        ticketWebsite,
        ticketSlogan,
        ticketShowQr,
      };

      if (mode === 'ESCPOS_NET') {
        updates.netHost = netHost;
        updates.netPort = netPort;
      } else if (mode === 'ESCPOS_USB' && selectedUsb) {
        const [vid, pid] = selectedUsb.split(':').map(Number);
        updates.vendorId = vid;
        updates.productId = pid;
      } else if (mode === 'ESCPOS_BT' && selectedBt) {
        updates.btPort = selectedBt;
      }

      const newConfig = await api.updateConfig(updates);
      console.log('[Printer Settings] Config saved:', newConfig);
      toast.success(`Configuración guardada (modo: ${newConfig.mode})`);
    } catch (err) {
      console.error('Error saving config:', err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async () => {
    if (!api) return;
    
    setTesting(true);
    try {
      const result = await api.testPrint(true);
      if (result.success) {
        toast.success('Impresión de prueba enviada');
      } else {
        toast.error(result.error || 'Error en impresión de prueba');
      }
    } catch (err) {
      console.error('Test print error:', err);
      toast.error('Error al imprimir');
    } finally {
      setTesting(false);
    }
  };

  const handleDiagnose = async () => {
    if (!api) return;
    setDiagnosing(true);
    setDiagnoseReport(null);
    try {
      const report = await api.diagnose();
      setDiagnoseReport(report);
    } catch (err) {
      setDiagnoseReport(`Error al ejecutar diagnóstico: ${err}`);
    } finally {
      setDiagnosing(false);
    }
  };

  const handlePing = async () => {
    if (!api) return;
    
    setPinging(true);
    setPingResult(null);
    try {
      const result = await api.netPing(netHost, netPort);
      setPingResult(result);
      if (result.ok) {
        toast.success(`Conexión exitosa (${result.latencyMs}ms)`);
      } else {
        toast.error(result.reason || 'Error de conexión');
      }
    } catch (err) {
      console.error('Ping error:', err);
      setPingResult({ ok: false, reason: 'Error de conexión' });
    } finally {
      setPinging(false);
    }
  };

  // Show message if not in desktop
  if (!isDesktop) {
    return (
      <AuthLayout>
        <div className="max-w-2xl mx-auto p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-yellow-800 mb-2">
              Solo disponible en versión Desktop
            </h2>
            <p className="text-yellow-700">
              La configuración de impresoras térmicas ESC/POS solo está disponible
              en la aplicación de escritorio.
            </p>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (loading) {
    return (
      <AuthLayout>
        <div className="max-w-2xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-40 bg-gray-200 rounded"></div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Printer className="w-8 h-8 text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold">Impresora Térmica</h1>
            <p className="text-gray-500">Configuración de impresión ESC/POS</p>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="font-semibold text-lg">Modo de Impresión</h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setMode('HTML')}
              className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                mode === 'HTML' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Printer className="w-6 h-6" />
              <span className="font-medium">Sistema</span>
              <span className="text-xs text-gray-500">Windows Print</span>
            </button>

            <button
              onClick={() => setMode('ESCPOS_NET')}
              className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                mode === 'ESCPOS_NET' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Wifi className="w-6 h-6" />
              <span className="font-medium">Red/TCP</span>
              <span className="text-xs text-gray-500">Puerto 9100</span>
            </button>

            <button
              onClick={() => setMode('ESCPOS_USB')}
              className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                mode === 'ESCPOS_USB' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Usb className="w-6 h-6" />
              <span className="font-medium">USB</span>
              <span className="text-xs text-gray-500">Directo</span>
            </button>

            <button
              onClick={() => { setMode('ESCPOS_BT'); if (btPorts.length === 0) refreshBtPorts(); }}
              className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors ${
                mode === 'ESCPOS_BT' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Bluetooth className="w-6 h-6" />
              <span className="font-medium">Bluetooth</span>
              <span className="text-xs text-gray-500">COM serial</span>
            </button>
          </div>
        </div>

        {/* Network Settings */}
        {mode === 'ESCPOS_NET' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Wifi className="w-5 h-5" />
              Configuración de Red
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirección IP
                </label>
                <input
                  type="text"
                  value={netHost}
                  onChange={(e) => setNetHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Puerto
                </label>
                <input
                  type="number"
                  value={netPort}
                  onChange={(e) => setNetPort(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handlePing}
                disabled={pinging || !netHost}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                {pinging ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <span>📡</span>
                )}
                Probar Conexión
              </button>
              
              {pingResult && (
                <div className={`flex items-center gap-2 ${pingResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {pingResult.ok ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                  <span className="text-sm">{pingResult.ok ? `Conectado (${pingResult.latencyMs}ms)` : pingResult.reason}</span>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>Tip:</strong> Para emuladores como escpos_emulator, usa IP 127.0.0.1 y puerto 9100.
            </div>
          </div>
        )}

        {/* USB Settings */}
        {mode === 'ESCPOS_USB' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Usb className="w-5 h-5" />
              Impresora USB
            </h2>
            
            {/* Refresh button */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Dispositivos detectados: {usbDevices.length}</span>
              <button
                onClick={refreshUsbDevices}
                disabled={loadingUsb}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingUsb ? (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Usb className="w-4 h-4" />
                )}
                Buscar impresoras
              </button>
            </div>

            {usbDevices.length > 0 ? (
              <div className="space-y-2">
                {usbDevices.map((device) => (
                  <label
                    key={`${device.vendorId}:${device.productId}`}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      selectedUsb === `${device.vendorId}:${device.productId}`
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="usbDevice"
                      value={`${device.vendorId}:${device.productId}`}
                      checked={selectedUsb === `${device.vendorId}:${device.productId}`}
                      onChange={(e) => setSelectedUsb(e.target.value)}
                      className="text-blue-600"
                    />
                    <div>
                      <div className="font-medium">{device.name}</div>
                      <div className="text-xs text-gray-500">
                        VID: 0x{device.vendorId.toString(16).toUpperCase().padStart(4,'0')} |
                        PID: 0x{device.productId.toString(16).toUpperCase().padStart(4,'0')}
                        {device.manufacturer && ` | ${device.manufacturer}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Usb className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium">No se detectaron impresoras USB</p>
                <p className="text-sm mt-1">Asegúrate de que la impresora esté encendida y conectada,<br/>luego presiona <strong>Buscar impresoras</strong>.</p>
              </div>
            )}

            {/* Manual VID/PID fallback */}
            <div className="border-t pt-3">
              <button
                onClick={() => setShowManual(!showManual)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showManual ? '▲ Ocultar' : '▼ Mi impresora no aparece — ingresar ID manualmente'}
              </button>
              {showManual && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg space-y-3">
                  <p className="text-xs text-gray-500">Puedes encontrar el VID y PID en el Administrador de dispositivos de Windows (propiedades del dispositivo → Detalles → IDs de hardware). Formato hexadecimal, ej: 28E9</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-600">Vendor ID (VID)</label>
                      <input
                        type="text"
                        placeholder="ej: 28E9"
                        value={manualVid}
                        onChange={e => setManualVid(e.target.value.toUpperCase().replace(/[^0-9A-F]/g,''))}
                        maxLength={4}
                        className="mt-1 w-full px-3 py-2 border rounded-lg text-sm font-mono"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-gray-600">Product ID (PID)</label>
                      <input
                        type="text"
                        placeholder="ej: 0289"
                        value={manualPid}
                        onChange={e => setManualPid(e.target.value.toUpperCase().replace(/[^0-9A-F]/g,''))}
                        maxLength={4}
                        className="mt-1 w-full px-3 py-2 border rounded-lg text-sm font-mono"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        disabled={manualVid.length < 1 || manualPid.length < 1}
                        onClick={() => {
                          const vid = parseInt(manualVid, 16);
                          const pid = parseInt(manualPid, 16);
                          if (!isNaN(vid) && !isNaN(pid)) {
                            const key = `${vid}:${pid}`;
                            if (!usbDevices.find(d => d.vendorId === vid && d.productId === pid)) {
                              setUsbDevices(prev => [...prev, { vendorId: vid, productId: pid, name: `Manual (${manualVid}:${manualPid})` }]);
                            }
                            setSelectedUsb(key);
                            setShowManual(false);
                          }
                        }}
                        className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
                      >
                        Usar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bluetooth Settings */}
        {mode === 'ESCPOS_BT' && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Bluetooth className="w-5 h-5 text-blue-600" />
              Impresora Bluetooth
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 space-y-1">
              <p><strong>¿Cómo conectar?</strong></p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Enciende la impresora y activa Bluetooth en tu PC.</li>
                <li>Ve a <em>Configuración → Bluetooth y otros dispositivos</em> y empareja la impresora.</li>
                <li>Windows creará automáticamente un puerto COM (ej: COM4).</li>
                <li>Haz clic en <strong>Buscar puertos</strong>, selecciona el COM de tu impresora y guarda.</li>
              </ol>
            </div>

            {/* Refresh button */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Puertos disponibles: {btPorts.length}
                {btPorts.filter(p => p.isBluetooth).length > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    ({btPorts.filter(p => p.isBluetooth).length} Bluetooth)
                  </span>
                )}
              </span>
              <button
                onClick={refreshBtPorts}
                disabled={loadingBt}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingBt ? (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Buscar puertos
              </button>
            </div>

            {btPorts.length > 0 ? (
              <div className="space-y-2">
                {/* Show Bluetooth ports first, then others */}
                {[...btPorts].sort((a, b) => (b.isBluetooth ? 1 : 0) - (a.isBluetooth ? 1 : 0)).map((port) => (
                  <label
                    key={port.path}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                      selectedBt === port.path
                        ? 'border-blue-500 bg-blue-50'
                        : port.isBluetooth
                          ? 'border-blue-200 hover:bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="btPort"
                      value={port.path}
                      checked={selectedBt === port.path}
                      onChange={(e) => setSelectedBt(e.target.value)}
                      className="text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{port.path}</span>
                        {port.isBluetooth && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Bluetooth className="w-3 h-3" /> Bluetooth
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{port.friendlyName}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Bluetooth className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium">No se encontraron puertos COM</p>
                <p className="text-sm mt-1">Empareja la impresora en Windows Bluetooth<br/>y luego presiona <strong>Buscar puertos</strong>.</p>
              </div>
            )}
          </div>
        )}

        {/* Print Options */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="font-semibold text-lg">Opciones de Impresión</h2>
          
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span>Corte automático de papel</span>
              <input
                type="checkbox"
                checked={autoCut}
                onChange={(e) => setAutoCut(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between">
              <span>Abrir cajón de dinero</span>
              <input
                type="checkbox"
                checked={openCashDrawer}
                onChange={(e) => setOpenCashDrawer(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded"
              />
            </label>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span>Ancho de papel</span>
                <select
                  value={charsPerLine}
                  onChange={(e) => setCharsPerLine(Number(e.target.value) as 32 | 42 | 48)}
                  className="px-3 py-2 border rounded-lg"
                >
                  <option value={32}>58mm — Papel estrecho (32 col.)</option>
                  <option value={42}>80mm — Papel ancho, Font A (42 col.)</option>
                  <option value={48}>80mm — Papel ancho, Font B (48 col.)</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">
                Epson TM-T20II en 80mm usa <strong>Font A = 42 columnas</strong>. Si el precio sale en línea separada, selecciona 42.
              </p>
            </div>
          </div>
        </div>

        {/* Ticket Customization */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="font-semibold text-lg">Personalización del Ticket</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sitio web / URL
              </label>
              <input
                type="text"
                value={ticketWebsite}
                onChange={(e) => setTicketWebsite(e.target.value)}
                placeholder="www.mitienda.com"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Se imprime al final del ticket. Si activas el QR, también genera un QR con esta URL.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje de despedida / slogan
              </label>
              <input
                type="text"
                value={ticketSlogan}
                onChange={(e) => setTicketSlogan(e.target.value)}
                placeholder="Gracias por su compra!"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>

            <label className="flex items-center justify-between">
              <div>
                <span className="font-medium">Imprimir código QR</span>
                <p className="text-xs text-gray-500">Genera un QR con la URL del sitio web al final del ticket</p>
              </div>
              <input
                type="checkbox"
                checked={ticketShowQr}
                onChange={(e) => setTicketShowQr(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded"
              />
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {saving ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <Save className="w-5 h-5" />
            )}
            Guardar Configuración
          </button>

          <button
            onClick={handleTestPrint}
            disabled={testing || mode === 'HTML'}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {testing ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <TestTube className="w-5 h-5" />
            )}
            Imprimir Prueba
          </button>

          {mode === 'ESCPOS_USB' && isDesktop && (
            <button
              onClick={handleDiagnose}
              disabled={diagnosing}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium"
              title="Muestra qué impresoras ve Windows y por qué falla la conexión"
            >
              {diagnosing ? <span className="animate-spin">⏳</span> : <Bug className="w-5 h-5" />}
              Diagnóstico
            </button>
          )}
        </div>

        {/* Diagnose Report Modal */}
        {diagnoseReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDiagnoseReport(null)}>
            <div
              className="bg-gray-900 text-green-300 rounded-xl shadow-2xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Bug className="w-5 h-5 text-orange-400" /> Diagnóstico USB
                </h3>
                <button onClick={() => setDiagnoseReport(null)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
              </div>
              <pre className="overflow-auto text-xs font-mono whitespace-pre-wrap flex-1 leading-relaxed">{diagnoseReport}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(diagnoseReport); toast.success('Copiado al portapapeles'); }}
                className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm self-end"
              >
                Copiar
              </button>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
