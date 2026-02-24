/**
 * D7.2 - Windows Service Management
 * Manages PostgreSQL as a Windows Service using NSSM
 * REQUIRES administrator privileges
 */

import { execSync, spawn } from 'child_process';
import { app, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// CONSTANTS
// ============================================================================

const SERVICE_NAME = 'MonterrialPOSPostgres';
const SERVICE_DISPLAY_NAME = 'Monterrial POS PostgreSQL';
const SERVICE_DESCRIPTION = 'Base de datos PostgreSQL embebida para Monterrial POS';

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceResult {
  success: boolean;
  message: string;
  error?: string;
  requiresAdmin?: boolean;
}

export interface ServiceStatus {
  installed: boolean;
  running: boolean;
  startType?: 'AUTO_START' | 'DEMAND_START' | 'DISABLED';
  pid?: number;
}

// ============================================================================
// NSSM PATH
// ============================================================================

/**
 * Get the path to NSSM executable
 * NSSM should be bundled in resources/nssm/
 */
function getNssmPath(): string {
  const isProd = app.isPackaged;
  
  if (isProd) {
    return path.join(process.resourcesPath, 'nssm', 'nssm.exe');
  }
  
  // Development: look for vendor folder
  return path.join(__dirname, '..', '..', '..', 'vendor', 'nssm', 'nssm.exe');
}

/**
 * Check if NSSM is available
 */
export function isNssmAvailable(): boolean {
  const nssmPath = getNssmPath();
  return fs.existsSync(nssmPath);
}

/**
 * Get the path to the MarketPOS executable
 */
function getExecutablePath(): string {
  return app.getPath('exe');
}

// ============================================================================
// ADMIN CHECK
// ============================================================================

/**
 * Check if running as administrator
 */
export function isRunningAsAdmin(): boolean {
  try {
    // Try to access a protected registry key
    execSync('reg query HKU\\S-1-5-19', {
      encoding: 'utf-8',
      windowsHide: true,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Show dialog requesting admin privileges
 */
export async function showAdminRequiredDialog(
  window: BrowserWindow | null
): Promise<boolean> {
  const result = await dialog.showMessageBox(window as BrowserWindow, {
    type: 'warning',
    title: 'Se requieren permisos de administrador',
    message: 'Para instalar el servicio Windows se necesitan permisos de administrador.',
    detail: 'Puede usar "Ejecutar al iniciar sesión" como alternativa sin admin.',
    buttons: ['Ejecutar como Admin', 'Usar alternativa', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
  });
  
  return result.response === 0;
}

// ============================================================================
// SERVICE OPERATIONS
// ============================================================================

/**
 * Install PostgreSQL as a Windows Service
 * REQUIRES administrator privileges
 */
export async function installWindowsService(): Promise<ServiceResult> {
  console.log('[WindowsService] Installing service...');
  
  // Check admin
  if (!isRunningAsAdmin()) {
    console.log('[WindowsService] Not running as admin');
    return {
      success: false,
      message: 'Se requieren permisos de administrador',
      error: 'Ejecute Monterrial POS como administrador para instalar el servicio',
      requiresAdmin: true,
    };
  }
  
  // Check NSSM
  const nssmPath = getNssmPath();
  if (!fs.existsSync(nssmPath)) {
    return {
      success: false,
      message: 'NSSM no encontrado',
      error: `No se encontró NSSM en: ${nssmPath}`,
    };
  }
  
  const exePath = getExecutablePath();
  
  try {
    // Remove existing service if any
    try {
      execSync(`"${nssmPath}" stop ${SERVICE_NAME}`, {
        encoding: 'utf-8',
        windowsHide: true,
        stdio: 'ignore',
        timeout: 30000,
      });
    } catch {
      // Service might not exist
    }
    
    try {
      execSync(`"${nssmPath}" remove ${SERVICE_NAME} confirm`, {
        encoding: 'utf-8',
        windowsHide: true,
        stdio: 'ignore',
        timeout: 30000,
      });
    } catch {
      // Service might not exist
    }
    
    // Install service
    console.log(`[WindowsService] Installing: ${exePath} --pg-daemon`);
    
    execSync(`"${nssmPath}" install ${SERVICE_NAME} "${exePath}" --pg-daemon`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
    });
    
    // Configure service
    execSync(`"${nssmPath}" set ${SERVICE_NAME} DisplayName "${SERVICE_DISPLAY_NAME}"`, {
      encoding: 'utf-8',
      windowsHide: true,
    });
    
    execSync(`"${nssmPath}" set ${SERVICE_NAME} Description "${SERVICE_DESCRIPTION}"`, {
      encoding: 'utf-8',
      windowsHide: true,
    });
    
    execSync(`"${nssmPath}" set ${SERVICE_NAME} Start SERVICE_AUTO_START`, {
      encoding: 'utf-8',
      windowsHide: true,
    });
    
    // Set app directory
    const appDir = path.dirname(exePath);
    execSync(`"${nssmPath}" set ${SERVICE_NAME} AppDirectory "${appDir}"`, {
      encoding: 'utf-8',
      windowsHide: true,
    });
    
    // Start service
    console.log('[WindowsService] Starting service...');
    execSync(`"${nssmPath}" start ${SERVICE_NAME}`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 60000,
    });
    
    console.log('[WindowsService] Service installed and started');
    
    return {
      success: true,
      message: 'Servicio Windows instalado correctamente',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[WindowsService] Install failed:', errorMsg);
    
    return {
      success: false,
      message: 'Error al instalar servicio',
      error: errorMsg,
    };
  }
}

/**
 * Uninstall the Windows Service
 * REQUIRES administrator privileges
 */
export async function uninstallWindowsService(): Promise<ServiceResult> {
  console.log('[WindowsService] Uninstalling service...');
  
  // Check admin
  if (!isRunningAsAdmin()) {
    return {
      success: false,
      message: 'Se requieren permisos de administrador',
      error: 'Ejecute Monterrial POS como administrador para desinstalar el servicio',
      requiresAdmin: true,
    };
  }
  
  const nssmPath = getNssmPath();
  if (!fs.existsSync(nssmPath)) {
    // Try with sc.exe as fallback
    return uninstallWithSc();
  }
  
  try {
    // Stop service
    try {
      execSync(`"${nssmPath}" stop ${SERVICE_NAME}`, {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 60000,
      });
    } catch {
      // Service might not be running
    }
    
    // Remove service
    execSync(`"${nssmPath}" remove ${SERVICE_NAME} confirm`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
    });
    
    console.log('[WindowsService] Service uninstalled');
    
    return {
      success: true,
      message: 'Servicio Windows desinstalado correctamente',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Check if service doesn't exist
    if (errorMsg.includes('does not exist') || errorMsg.includes('no existe')) {
      return {
        success: true,
        message: 'El servicio ya no existía',
      };
    }
    
    console.error('[WindowsService] Uninstall failed:', errorMsg);
    
    return {
      success: false,
      message: 'Error al desinstalar servicio',
      error: errorMsg,
    };
  }
}

/**
 * Fallback: uninstall using sc.exe
 */
async function uninstallWithSc(): Promise<ServiceResult> {
  try {
    execSync(`sc stop ${SERVICE_NAME}`, {
      encoding: 'utf-8',
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {
    // Ignore
  }
  
  try {
    execSync(`sc delete ${SERVICE_NAME}`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 30000,
    });
    
    return {
      success: true,
      message: 'Servicio eliminado',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error al eliminar servicio',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get service status
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  try {
    const output = execSync(`sc query ${SERVICE_NAME}`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 10000,
    });
    
    const running = output.includes('RUNNING');
    const stopped = output.includes('STOPPED');
    
    // Get PID if running
    let pid: number | undefined;
    const pidMatch = output.match(/PID\s*:\s*(\d+)/);
    if (pidMatch) {
      pid = parseInt(pidMatch[1], 10);
    }
    
    // Get start type
    let startType: 'AUTO_START' | 'DEMAND_START' | 'DISABLED' | undefined;
    try {
      const configOutput = execSync(`sc qc ${SERVICE_NAME}`, {
        encoding: 'utf-8',
        windowsHide: true,
      });
      
      if (configOutput.includes('AUTO_START')) {
        startType = 'AUTO_START';
      } else if (configOutput.includes('DEMAND_START')) {
        startType = 'DEMAND_START';
      } else if (configOutput.includes('DISABLED')) {
        startType = 'DISABLED';
      }
    } catch {
      // Ignore
    }
    
    return {
      installed: true,
      running,
      startType,
      pid,
    };
  } catch {
    return {
      installed: false,
      running: false,
    };
  }
}

/**
 * Start the Windows Service
 */
export async function startService(): Promise<ServiceResult> {
  if (!isRunningAsAdmin()) {
    return {
      success: false,
      message: 'Se requieren permisos de administrador',
      requiresAdmin: true,
    };
  }
  
  try {
    execSync(`sc start ${SERVICE_NAME}`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 60000,
    });
    
    return {
      success: true,
      message: 'Servicio iniciado',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error al iniciar servicio',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stop the Windows Service
 */
export async function stopService(): Promise<ServiceResult> {
  if (!isRunningAsAdmin()) {
    return {
      success: false,
      message: 'Se requieren permisos de administrador',
      requiresAdmin: true,
    };
  }
  
  try {
    execSync(`sc stop ${SERVICE_NAME}`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 60000,
    });
    
    return {
      success: true,
      message: 'Servicio detenido',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Error al detener servicio',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
