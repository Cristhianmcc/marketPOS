/**
 * PostgreSQL Embebido para MarketPOS Desktop
 * Maneja la inicialización y gestión de PostgreSQL local
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

class EmbeddedPostgres {
  constructor() {
    // Directorio de datos de la aplicación
    this.appDataPath = path.join(app.getPath('userData'), 'PostgreSQL');
    this.dataDir = path.join(this.appDataPath, 'data');
    this.logFile = path.join(this.appDataPath, 'postgresql.log');
    
    // Binarios de PostgreSQL (incluidos en resources)
    this.pgBinPath = app.isPackaged
      ? path.join(process.resourcesPath, 'pgsql', 'bin')
      : path.join(__dirname, '..', 'pgsql', 'bin');
    
    this.pgProcess = null;
    this.port = 5433; // Puerto diferente al default para evitar conflictos
    this.isInitialized = false;
  }

  /**
   * Verifica si PostgreSQL está instalado embebido
   */
  isInstalled() {
    const pgCtl = path.join(this.pgBinPath, 'pg_ctl.exe');
    return fs.existsSync(pgCtl);
  }

  /**
   * Inicializa el directorio de datos si no existe
   */
  async initializeDataDir() {
    if (fs.existsSync(path.join(this.dataDir, 'PG_VERSION'))) {
      console.log('[PostgreSQL] Directorio de datos ya existe');
      return true;
    }

    console.log('[PostgreSQL] Inicializando directorio de datos...');
    
    // Crear directorio si no existe
    if (!fs.existsSync(this.appDataPath)) {
      fs.mkdirSync(this.appDataPath, { recursive: true });
    }

    const initdb = path.join(this.pgBinPath, 'initdb.exe');
    
    return new Promise((resolve, reject) => {
      const proc = spawn(initdb, [
        '-D', this.dataDir,
        '-U', 'postgres',
        '-E', 'UTF8',
        '--locale=C'
      ], {
        stdio: 'pipe',
        env: { ...process.env, PGDATA: this.dataDir }
      });

      let output = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { output += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('[PostgreSQL] Directorio de datos inicializado');
          this.configurePostgres();
          resolve(true);
        } else {
          console.error('[PostgreSQL] Error inicializando:', output);
          reject(new Error(`initdb falló con código ${code}`));
        }
      });
    });
  }

  /**
   * Configura PostgreSQL para aceptar conexiones locales
   */
  configurePostgres() {
    const pgHbaPath = path.join(this.dataDir, 'pg_hba.conf');
    const pgConfPath = path.join(this.dataDir, 'postgresql.conf');

    // Configurar pg_hba.conf para conexiones locales sin contraseña
    const pgHba = `
# PostgreSQL Client Authentication Configuration File
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
`;
    fs.writeFileSync(pgHbaPath, pgHba);

    // Configurar postgresql.conf
    let pgConf = fs.readFileSync(pgConfPath, 'utf-8');
    
    // Cambiar puerto
    pgConf = pgConf.replace(/#?port\s*=\s*\d+/, `port = ${this.port}`);
    
    // Asegurar que escucha en localhost
    pgConf = pgConf.replace(/#?listen_addresses\s*=\s*'[^']*'/, "listen_addresses = 'localhost'");
    
    fs.writeFileSync(pgConfPath, pgConf);
    console.log('[PostgreSQL] Configuración actualizada');
  }

  /**
   * Inicia el servidor PostgreSQL
   */
  async start() {
    if (!this.isInstalled()) {
      console.error('[PostgreSQL] Binarios no encontrados en:', this.pgBinPath);
      return false;
    }

    // Inicializar datos si es necesario
    await this.initializeDataDir();

    // Verificar si ya está corriendo
    if (await this.isRunning()) {
      console.log('[PostgreSQL] Ya está corriendo');
      return true;
    }

    console.log('[PostgreSQL] Iniciando servidor...');
    
    const pgCtl = path.join(this.pgBinPath, 'pg_ctl.exe');
    
    return new Promise((resolve) => {
      this.pgProcess = spawn(pgCtl, [
        'start',
        '-D', this.dataDir,
        '-l', this.logFile,
        '-w', // Esperar a que inicie
        '-o', `-p ${this.port}`
      ], {
        stdio: 'pipe',
        detached: false,
        env: { ...process.env, PGDATA: this.dataDir }
      });

      this.pgProcess.on('close', async (code) => {
        if (code === 0) {
          console.log('[PostgreSQL] Servidor iniciado en puerto', this.port);
          await this.createDatabaseIfNotExists();
          this.isInitialized = true;
          resolve(true);
        } else {
          console.error('[PostgreSQL] Error al iniciar, código:', code);
          resolve(false);
        }
      });

      this.pgProcess.on('error', (err) => {
        console.error('[PostgreSQL] Error:', err);
        resolve(false);
      });
    });
  }

  /**
   * Verifica si PostgreSQL está corriendo
   */
  async isRunning() {
    const pgCtl = path.join(this.pgBinPath, 'pg_ctl.exe');
    
    return new Promise((resolve) => {
      const proc = spawn(pgCtl, ['status', '-D', this.dataDir], { stdio: 'pipe' });
      proc.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Crea la base de datos si no existe
   */
  async createDatabaseIfNotExists() {
    const psql = path.join(this.pgBinPath, 'psql.exe');
    const dbName = 'market_pos';

    return new Promise((resolve) => {
      // Verificar si la BD existe
      const checkProc = spawn(psql, [
        '-h', 'localhost',
        '-p', this.port.toString(),
        '-U', 'postgres',
        '-lqt'
      ], { stdio: 'pipe' });

      let output = '';
      checkProc.stdout.on('data', (data) => { output += data.toString(); });

      checkProc.on('close', async () => {
        if (output.includes(dbName)) {
          console.log('[PostgreSQL] Base de datos ya existe');
          resolve(true);
          return;
        }

        // Crear la base de datos
        console.log('[PostgreSQL] Creando base de datos...');
        const createProc = spawn(psql, [
          '-h', 'localhost',
          '-p', this.port.toString(),
          '-U', 'postgres',
          '-c', `CREATE DATABASE ${dbName};`
        ], { stdio: 'pipe' });

        createProc.on('close', async (code) => {
          if (code === 0) {
            console.log('[PostgreSQL] Base de datos creada');
            // Inicializar schema
            await this.initializeSchema();
          }
          resolve(true);
        });
      });
    });
  }

  /**
   * Inicializa el schema de la base de datos
   */
  async initializeSchema() {
    const psql = path.join(this.pgBinPath, 'psql.exe');
    
    // Buscar el archivo SQL del schema
    let schemaPath;
    if (app.isPackaged) {
      schemaPath = path.join(process.resourcesPath, 'app', 'prisma', 'schema.sql');
    } else {
      schemaPath = path.join(__dirname, '..', 'prisma', 'schema.sql');
    }
    
    if (!fs.existsSync(schemaPath)) {
      console.log('[PostgreSQL] No se encontró schema.sql, las tablas se crearán al iniciar Next.js');
      return;
    }
    
    console.log('[PostgreSQL] Inicializando schema desde:', schemaPath);
    
    return new Promise((resolve) => {
      const proc = spawn(psql, [
        '-h', 'localhost',
        '-p', this.port.toString(),
        '-U', 'postgres',
        '-d', 'market_pos',
        '-f', schemaPath
      ], { stdio: 'pipe' });
      
      let output = '';
      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { output += data.toString(); });
      
      proc.on('close', (code) => {
        if (code === 0) {
          console.log('[PostgreSQL] Schema inicializado correctamente');
        } else {
          console.error('[PostgreSQL] Error inicializando schema:', output);
        }
        resolve();
      });
    });
  }

  /**
   * Detiene el servidor PostgreSQL
   */
  async stop() {
    if (!await this.isRunning()) {
      return true;
    }

    console.log('[PostgreSQL] Deteniendo servidor...');
    
    const pgCtl = path.join(this.pgBinPath, 'pg_ctl.exe');
    
    return new Promise((resolve) => {
      const proc = spawn(pgCtl, [
        'stop',
        '-D', this.dataDir,
        '-m', 'fast',
        '-w'
      ], { stdio: 'pipe' });

      proc.on('close', (code) => {
        console.log('[PostgreSQL] Servidor detenido');
        resolve(code === 0);
      });
    });
  }

  /**
   * Obtiene la URL de conexión
   */
  getConnectionUrl() {
    return `postgresql://postgres@localhost:${this.port}/market_pos`;
  }
}

module.exports = EmbeddedPostgres;
