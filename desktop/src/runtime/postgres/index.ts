/**
 * D7.1 - Embedded PostgreSQL Module
 * Main exports for PostgreSQL management
 */

// Main entry point
export {
  ensurePostgres,
  shutdownPostgres,
  showPostgresErrorDialog,
  showDataCorruptionDialog,
  recreateDatabase,
  loadRuntimeConfig,
  saveRuntimeConfig,
  getDatabaseUrl,
  checkPostgresStatus,
  stopPostgres,
  stopPostgresWithRetry,
  startPostgres,
} from './ensurePostgres';

// Types
export type { EnsureResult } from './ensurePostgres';
export type { PgRuntimeConfig, PgRunMode } from './pgPaths';

// Utilities
export {
  getPgDataDir,
  getPgBinDir,
  getLogsDir,
  getConfigDir,
  getRuntimeConfigPath,
  getMarketPOSDir,
  ensureDirectories,
  checkPgBinaries,
  isDataDirInitialized,
} from './pgPaths';

export { findFreePort, isPortFree, isPortInUse, waitForPort } from './findFreePort';
export { generatePassword } from './generatePassword';
export { initializeCluster, createDatabase } from './initDb';

// D7.2 - Task Scheduler (no admin required)
export {
  registerTaskScheduler,
  removeTaskScheduler,
  getTaskStatus,
  runTaskNow,
  endTask,
  isRunningAsAdmin,
} from './registerTaskScheduler';
export type { TaskSchedulerResult, TaskStatus } from './registerTaskScheduler';

// D7.2 - Windows Service (requires admin)
export {
  installWindowsService,
  uninstallWindowsService,
  getServiceStatus,
  startService,
  stopService,
  isNssmAvailable,
  showAdminRequiredDialog,
} from './windowsService';
export type { ServiceResult, ServiceStatus } from './windowsService';
