# 🚀 Despliegue en Render

## Requisitos previos
- Cuenta en [Render.com](https://render.com)
- Repositorio Git con el código (GitHub, GitLab, etc.)

## Pasos de despliegue

### 1. Crear cuenta en Render
1. Ir a https://render.com
2. Crear cuenta o iniciar sesión
3. Conectar tu repositorio de GitHub/GitLab

### 2. Desplegar desde Dashboard

#### Opción A: Blueprint (Automático) ✨
1. En Render Dashboard, click **"New +"** → **"Blueprint"**
2. Seleccionar tu repositorio `market`
3. Render detectará `render.yaml` automáticamente
4. Click **"Apply"**
5. Esperar a que se creen:
   - Base de datos PostgreSQL (market-pos-db)
   - Servicio web Next.js (market-pos)

#### Opción B: Manual
Si prefieres configurar manualmente:

**Base de datos:**
1. New + → PostgreSQL
2. Name: `market-pos-db`
3. Plan: Free
4. Region: Oregon (us-west)
5. Click **Create Database**
6. Copiar la **Internal Database URL**

**Servicio Web:**
1. New + → Web Service
2. Seleccionar repositorio
3. Configuración:
   - **Name:** `market-pos`
   - **Environment:** Node
   - **Region:** Oregon (us-west)
   - **Branch:** `master` (o `main`)
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free

4. **Environment Variables:**
   - `DATABASE_URL`: Pegar Internal Database URL de PostgreSQL
   - `SESSION_SECRET`: Generar string aleatorio de 32+ caracteres
   - `NODE_ENV`: `production`

5. Click **Create Web Service**

### 3. Ejecutar migraciones

Una vez desplegado el servicio:

1. Ir a tu servicio web en Render Dashboard
2. Click pestaña **"Shell"**
3. Ejecutar:
```bash
npx prisma migrate deploy
```

4. (Opcional) Seed inicial:
```bash
npm run db:seed
```

### 4. Verificar despliegue

1. Render te dará una URL: `https://market-pos.onrender.com`
2. Abrir en navegador
3. Login con credenciales del seed:
   - Email: `owner@store.com`
   - Password: `owner123`

---

## 🔧 Comandos útiles en Shell de Render

```bash
# Ver estado de migraciones
npx prisma migrate status

# Aplicar migraciones pendientes
npx prisma migrate deploy

# Generar Prisma Client
npx prisma generate

# Ver logs
tail -f /var/log/render.log

# Reiniciar base de datos (¡CUIDADO!)
npx prisma migrate reset --force
```

---

## ⚙️ Variables de entorno requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Secret para iron-session (32+ chars) | `min-32-character-random-string-here` |
| `NODE_ENV` | Entorno de ejecución | `production` |

---

## 🐛 Troubleshooting

### Error: "Cannot find module @prisma/client"
```bash
npx prisma generate
```

### Error de migraciones
```bash
npx prisma migrate status
npx prisma migrate deploy
```

### Base de datos vacía
```bash
npm run db:seed
```

### Servicio no inicia
1. Verificar logs en Dashboard → Logs
2. Verificar variables de entorno
3. Verificar que Build Command ejecutó correctamente

---

## 📊 Planes y limitaciones

### Free Tier (Render)
- **Web Service:** 
  - 512 MB RAM
  - 0.1 CPU
  - Se suspende después de 15 min inactividad
  - Primer request tarda ~30s (cold start)
  
- **PostgreSQL:**
  - 256 MB RAM
  - 1 GB almacenamiento
  - Expira después de 90 días
  - Backups: No incluidos

### Recomendaciones para producción
- Upgrade a plan **Starter** ($7/mes web + $7/mes DB)
- Habilitar **Auto-Deploy** desde GitHub
- Configurar **Health Checks**
- Agregar dominio personalizado

---

## 🔄 Actualizaciones automáticas

Si usaste Blueprint o configuraste Auto-Deploy:

1. Hacer push a `master`/`main`:
```bash
git add .
git commit -m "Update feature"
git push origin master
```

2. Render detecta cambios y redespliega automáticamente
3. Migraciones se aplican en Build Command

---

## 🔐 Seguridad

**Antes de producción:**

1. ✅ Cambiar `SESSION_SECRET` por valor seguro
2. ✅ Crear usuario OWNER con email/password real
3. ✅ Eliminar usuario de prueba del seed
4. ✅ Configurar CORS si usas dominios externos
5. ✅ Habilitar HTTPS (Render lo hace automáticamente)
6. ✅ Configurar backups de base de datos

---

## 📞 Soporte

- Documentación Render: https://render.com/docs
- Documentación Prisma: https://www.prisma.io/docs
- Documentación Next.js: https://nextjs.org/docs

---

**Estado del despliegue:** ✅ Configurado y listo para deploy
