const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Determinar si estamos en desarrollo o producción
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// PostgreSQL embebido (solo en producción/desktop)
let embeddedPg = null;
if (!isDev) {
  const EmbeddedPostgres = require('./embedded-postgres');
  embeddedPg = new EmbeddedPostgres();
}

// Cargar variables de entorno desde .env empaquetado
function loadEnvFile() {
  let envPath;
  
  if (isDev) {
    // En desarrollo, .env está en la raíz del proyecto
    envPath = path.join(__dirname, '..', '.env');
  } else {
    // En producción, .env está en extraResources
    envPath = path.join(process.resourcesPath, '.env');
  }
  
  console.log('Cargando .env desde:', envPath);
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      // Ignorar comentarios y líneas vacías
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key) {
          let value = valueParts.join('=').trim();
          // Remover comillas si existen
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          envVars[key.trim()] = value;
          process.env[key.trim()] = value;
        }
      }
    });
    
    console.log('Variables de entorno cargadas:', Object.keys(envVars).length);
    return envVars;
  } else {
    console.error('Archivo .env no encontrado en:', envPath);
    return {};
  }
}

// Cargar env al inicio (pero en producción usaremos PostgreSQL local)
const envVars = loadEnvFile();

// En producción, sobrescribir DATABASE_URL con PostgreSQL local
if (!isDev && embeddedPg) {
  process.env.DATABASE_URL = embeddedPg.getConnectionUrl();
  console.log('DATABASE_URL configurada para PostgreSQL local:', process.env.DATABASE_URL);
}

let mainWindow;
let nextServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, '../public/icons/icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Estilo de ventana
    frame: true,
    autoHideMenuBar: true, // Oculta menú pero accesible con Alt
    title: 'Monterrial POS - Sistema de Ventas',
  });

  // URL a cargar
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : 'http://localhost:3000'; // En producción también usa el server local

  // Esperar a que Next.js esté listo
  const loadApp = async () => {
    let retries = 0;
    const maxRetries = 30; // 30 segundos máximo

    const tryLoad = () => {
      mainWindow.loadURL(startUrl).catch(() => {
        retries++;
        if (retries < maxRetries) {
          console.log(`Esperando servidor Next.js... (${retries}/${maxRetries})`);
          setTimeout(tryLoad, 1000);
        } else {
          console.error('No se pudo conectar al servidor Next.js');
          mainWindow.loadFile(path.join(__dirname, 'error.html'));
        }
      });
    };

    tryLoad();
  };

  loadApp();

  // Abrir enlaces externos en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // DevTools solo en desarrollo
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Iniciar servidor Next.js en producción
function startNextServer() {
  if (!isDev) {
    // La app standalone está en resources/app
    const appPath = path.join(process.resourcesPath, 'app');
    const serverPath = path.join(appPath, 'server.js');
    
    console.log('Iniciando servidor Next.js standalone...');
    console.log('App path:', appPath);
    console.log('Server path:', serverPath);
    console.log('DATABASE_URL configurada:', process.env.DATABASE_URL ? 'Sí' : 'No');
    
    // Verificar que el servidor existe
    if (!fs.existsSync(serverPath)) {
      console.error('ERROR: server.js no encontrado en:', serverPath);
      return;
    }
    
    // Variables de entorno para Next.js standalone
    const childEnv = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: 'localhost',
    };
    
    // Ejecutar el servidor standalone de Next.js
    nextServer = spawn('node', ['server.js'], {
      cwd: appPath,
      shell: false,
      stdio: 'pipe',
      env: childEnv,
    });
    
    nextServer.stdout?.on('data', (data) => {
      console.log('[Next.js]:', data.toString().trim());
    });
    
    nextServer.stderr?.on('data', (data) => {
      console.error('[Next.js Error]:', data.toString().trim());
    });

    nextServer.on('error', (err) => {
      console.error('Error al iniciar Next.js:', err);
    });
    
    nextServer.on('close', (code) => {
      console.log('Next.js terminó con código:', code);
    });
  }
}

app.whenReady().then(async () => {
  // En producción, iniciar PostgreSQL embebido primero
  if (!isDev && embeddedPg) {
    console.log('Iniciando PostgreSQL embebido...');
    const pgStarted = await embeddedPg.start();
    if (!pgStarted) {
      console.error('No se pudo iniciar PostgreSQL embebido');
      // Continuar de todos modos, podría usar BD remota como fallback
    }
  }
  
  startNextServer();
  
  // Dar tiempo al servidor para iniciar
  setTimeout(createWindow, isDev ? 0 : 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Cerrar servidor Next.js
  if (nextServer) {
    nextServer.kill();
  }
  
  // Detener PostgreSQL embebido
  if (!isDev && embeddedPg) {
    console.log('Deteniendo PostgreSQL embebido...');
    await embeddedPg.stop();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});
