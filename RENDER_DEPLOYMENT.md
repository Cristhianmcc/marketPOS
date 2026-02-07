# 🚀 CONFIGURACIÓN DE RENDER PARA PRODUCCIÓN

## 📋 Variables de Entorno en Render

Ve a tu proyecto en Render → **Environment** y configura estas variables:

### 1. DATABASE_URL (AWS RDS con Connection Pooling)
```
DATABASE_URL=postgresql://marketadmin:Kikomoreno1@market-pos-db.cbsuesi8i2vk.us-east-2.rds.amazonaws.com:5432/market_pos?connection_limit=10&pool_timeout=20&connect_timeout=10
```

### 2. SESSION_SECRET
```
SESSION_SECRET=f8e7d6c5b4a3928176e5d4c3b2a19807f6e5d4c3b2a1908
```

### 3. SUPERADMIN_EMAILS
```
SUPERADMIN_EMAILS=cristhianmc@monterrial.com,cleopatra@monterrial.com,owner@bodega.com
```

### 4. CLOUDINARY (para imágenes)
```
CLOUDINARY_CLOUD_NAME=dxhcv6buy
CLOUDINARY_API_KEY=162942145365156
CLOUDINARY_API_SECRET=I4N-Tqi4dYrlNcamvQmIFymk4l8
CLOUDINARY_FOLDER=productos
```

### 5. NODE_ENV
```
NODE_ENV=production
```

### 6. NEXT_PUBLIC_URL (tu dominio de Render)
```
NEXT_PUBLIC_URL=https://tu-app.onrender.com
```

### 7. SUNAT (si usas facturación)
```
ENABLE_SUNAT=true
NEXT_PUBLIC_ENABLE_SUNAT=true
```

---

## 🔧 Build Settings en Render

**Build Command:**
```bash
npm install && npx prisma generate && npm run build
```

**Start Command:**
```bash
npm start
```

**Node Version:** (en render.yaml o Environment)
```
NODE_VERSION=18
```

---

## 📊 Flujo de Trabajo

### Local (Desarrollo):
```
1. Docker PostgreSQL local (localhost:5432)
2. npm run dev
3. Pruebas y desarrollo
```

### Producción (Render):
```
1. Push a GitHub
2. Render detecta cambios
3. Ejecuta build con Prisma
4. Conecta a AWS RDS automáticamente
5. Deploy completo
```

---

## ✅ Checklist de Deploy

Antes de hacer deploy a Render:

- [ ] Verificar que `.env` local usa Docker (localhost)
- [ ] Verificar que `.env` NO está en el repositorio (debe estar en .gitignore)
- [ ] Configurar todas las variables en Render Environment
- [ ] Hacer push a GitHub
- [ ] Verificar logs de build en Render
- [ ] Probar conexión a RDS desde Render
- [ ] Verificar que la app carga correctamente

---

## 🔄 Sincronizar Schema entre Local y RDS

Cuando hagas cambios en tu schema local:

```bash
# 1. Actualiza schema local (Docker)
npx prisma db push

# 2. Genera migration
npx prisma migrate dev --name nombre_del_cambio

# 3. En Render, el build ejecutará automáticamente:
# npx prisma generate (incluido en build)
```

**IMPORTANTE:** Si cambias el schema local, también debes aplicarlo a RDS:

```bash
# Conectar temporalmente a RDS desde local
# Edita .env temporalmente para usar RDS, luego:
npx prisma db push --accept-data-loss

# Luego vuelve a cambiar .env a localhost
```

**O mejor:** Usa migrations automáticas en producción:

```bash
# En build command de Render, agrega:
npm install && npx prisma generate && npx prisma migrate deploy && npm run build
```

---

## 🚨 Troubleshooting

### Error: "Can't reach database server"
- Verifica que RDS tiene "Publicly accessible: YES"
- Verifica Security Group permite 0.0.0.0/0 en puerto 5432
- Verifica que DATABASE_URL está correcta en Render

### Error: "Too many connections"
- Verifica connection_limit en DATABASE_URL
- Considera usar PgBouncer si tienes múltiples servicios

### Error: "Database is empty" en Render
- Verifica que los datos están en RDS (no en Docker local)
- Conecta a RDS desde local y verifica tablas

---

## 📝 Archivo render.yaml (opcional)

Si prefieres usar archivo de configuración:

```yaml
services:
  - type: web
    name: market-pos
    env: node
    plan: free
    buildCommand: npm install && npx prisma generate && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        value: postgresql://marketadmin:Kikomoreno1@market-pos-db.cbsuesi8i2vk.us-east-2.rds.amazonaws.com:5432/market_pos?connection_limit=10&pool_timeout=20&connect_timeout=10
      - key: SESSION_SECRET
        sync: false  # Usar el valor en Render Environment
```

---

## 💰 Costos

- **Render Free Tier:** 750 horas/mes gratis
- **AWS RDS Free Tier:** 12 meses gratis, luego ~$15-20/mes
- **Total primeros 12 meses:** $0/mes
- **Después de 12 meses:** $15-20/mes (solo RDS)

---

## 🔐 Seguridad

**NUNCA subas a GitHub:**
- `.env` con credenciales
- `AWS_RDS_CREDENTIALS.md`
- Backups de base de datos

**Verifica .gitignore incluye:**
```
.env
.env.local
.env.production
.env.local.backup
*.backup
AWS_RDS_CREDENTIALS.md
```

---

**Última actualización:** Febrero 6, 2026
