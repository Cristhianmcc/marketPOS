# 🚀 Despliegue Rápido en Render (5 minutos)

## Paso 1: Preparar repositorio
```bash
git add .
git commit -m "Add Render deployment config"
git push origin master
```

## Paso 2: Crear cuenta Render
1. Ir a https://render.com
2. Sign up (puedes usar GitHub)
3. Click **"New +"** → **"Blueprint"**

## Paso 3: Conectar repositorio
1. Autorizar acceso a GitHub/GitLab
2. Seleccionar repositorio `market`
3. Click **"Connect"**

## Paso 4: Aplicar Blueprint
1. Render detecta `render.yaml`
2. Muestra los servicios a crear:
   - ✅ PostgreSQL Database (market-pos-db)
   - ✅ Web Service (market-pos)
3. Click **"Apply"**

## Paso 5: Esperar despliegue (3-5 min)
- Base de datos se crea primero (~1 min)
- Servicio web compila y despliega (~3 min)
- Migraciones se aplican automáticamente

## Paso 6: Acceder a la app
1. En Dashboard, click en `market-pos`
2. Copiar URL: `https://market-pos-XXXX.onrender.com`
3. Abrir en navegador

## Paso 7: Login inicial
```
Email: owner@store.com
Password: owner123
```

## 🎉 ¡Listo! Tu app está en producción

---

## 🔧 Comandos útiles

### Ver logs
Dashboard → market-pos → Logs

### Ejecutar comandos
Dashboard → market-pos → Shell
```bash
# Ver migraciones
npx prisma migrate status

# Seed datos
npm run db:seed

# Reset DB (¡cuidado!)
npm run db:reset
```

### Actualizar app
```bash
git push origin master
# Render redespliega automáticamente
```

---

## ⚠️ Limitaciones Free Tier

- App se suspende tras 15 min inactividad
- Primer request tarda ~30s (cold start)
- Base de datos expira en 90 días
- 1 GB almacenamiento

**Para producción real:** Upgrade a plan Starter ($7/mes)

---

## 🐛 Problemas comunes

### App no inicia
```bash
# En Shell de Render
npx prisma generate
npx prisma migrate deploy
```

### Base de datos vacía
```bash
npm run db:seed
```

### Error de conexión
- Verificar `DATABASE_URL` en Environment Variables
- Debe ser la Internal Database URL

---

## 📞 Ayuda

- [Documentación Render](https://render.com/docs)
- [Guía completa](./DEPLOY.md)
