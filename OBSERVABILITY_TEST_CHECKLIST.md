# ✅ MÓDULO 16.2: OBSERVABILIDAD LIGERA - Checklist de Pruebas

## 📋 Contexto
Este checklist valida la implementación del sistema de observabilidad, que permite monitorear el estado del sistema en tiempo real sin complejidad.

**Roles:**
- OWNER: Acceso completo al panel de observabilidad
- CASHIER: Sin acceso (se bloquea en middleware)

---

## 🧪 Pruebas del Sistema

### 1️⃣ Health Check - Estado del Sistema

**Objetivo:** Verificar que el endpoint de salud reporta correctamente el estado del sistema.

**Pasos:**
1. Hacer login como OWNER
2. Abrir Postman o navegador
3. GET `/api/system/health`
4. Verificar respuesta:
   - `status`: "OK" o "DEGRADED"
   - `database.status`: "OK" si DB funciona
   - `database.latencyMs`: número en milisegundos (típicamente < 50ms)
   - `uptime`: tiempo en segundos desde inicio
   - `appVersion`: versión del app
5. Verificar headers de caché:
   - `Cache-Control: no-store, no-cache, must-revalidate`
6. **Simular DB down:** Detener PostgreSQL y verificar que status = "DEGRADED"

**Resultado esperado:**
- ✅ Responde en < 100ms
- ✅ Incluye latencia de DB en ms
- ✅ Audit log con acción "HEALTH_CHECK_ACCESSED"

---

### 2️⃣ Store Status - Estado Operativo

**Objetivo:** Verificar que el endpoint reporta el estado operativo de la tienda.

**Pasos:**
1. Login como OWNER
2. **Con turno abierto:**
   - Abrir turno desde POS
   - GET `/api/system/store-status`
   - Verificar que `currentShift.open = true`
   - Verificar que se muestra el nombre del cajero
3. **Sin turno abierto:**
   - Cerrar turno
   - GET `/api/system/store-status`
   - Verificar que `currentShift.open = false`
4. **Con ventas del día:**
   - Realizar 2 ventas (1 efectivo, 1 tarjeta)
   - GET `/api/system/store-status`
   - Verificar que `today.salesCount = 2`
   - Verificar que `today.salesTotal` coincide con la suma
5. **Sin ventas:**
   - GET `/api/system/store-status` (sin ventas del día)
   - Verificar que `today.salesCount = 0`

**Resultado esperado:**
- ✅ Solo OWNER tiene acceso
- ✅ CASHIER recibe HTTP 403
- ✅ Datos en tiempo real (ventas del día actual)
- ✅ Audit log con acción "STORE_STATUS_ACCESSED"

---

### 3️⃣ Config Snapshot - Flags y Límites

**Objetivo:** Verificar que el endpoint exporta correctamente la configuración activa.

**Pasos:**
1. Login como OWNER
2. GET `/api/system/config-snapshot`
3. Verificar estructura:
   - `featureFlags`: objeto con keys y valores booleanos
   - `operationalLimits.maxDiscountPercent`: número o null
   - `operationalLimits.maxSaleTotal`: número o null
   - `operationalLimits.maxItemsPerSale`: número o null
4. **Validar valores:**
   - Ir a Admin Panel → Feature Flags
   - Cambiar un flag (ej: habilitar "ENABLE_PROMOTIONS")
   - GET `/api/system/config-snapshot` nuevamente
   - Verificar que el cambio se refleja
5. **Validar límites:**
   - Verificar que los límites coinciden con los configurados en Admin Panel

**Resultado esperado:**
- ✅ Solo OWNER tiene acceso
- ✅ Valores numéricos (no objetos Decimal)
- ✅ Flags actualizados en tiempo real
- ✅ Audit log con acción "CONFIG_SNAPSHOT_ACCESSED"

---

### 4️⃣ Backups Status - Estado de Respaldos

**Objetivo:** Verificar que el endpoint reporta el estado de los backups.

**Pasos:**
1. Login como OWNER
2. **Con backups existentes:**
   - Verificar que existe directorio `backups/` con archivos
   - GET `/api/system/backups/status`
   - Verificar:
     - `totalBackups`: número de archivos
     - `lastBackup.timestamp`: fecha del último backup
     - `restoreAllowed`: true (solo para OWNER)
3. **Sin backups:**
   - Eliminar contenido de `backups/`
   - GET `/api/system/backups/status`
   - Verificar que `totalBackups = 0` y `lastBackup.timestamp = null`
4. **Validar permisos de restauración:**
   - Verificar que `restoreAllowed = true` para OWNER

**Resultado esperado:**
- ✅ Solo OWNER tiene acceso
- ✅ Cuenta archivos correctamente
- ✅ Timestamp del último backup es válido
- ✅ Audit log con acción "BACKUPS_STATUS_ACCESSED"

---

### 5️⃣ Diagnostic Export - Exportar Diagnóstico

**Objetivo:** Verificar que el endpoint genera un ZIP con toda la información de diagnóstico.

**Pasos:**
1. Login como OWNER
2. GET `/api/system/diagnostic/export`
3. Verificar headers de respuesta:
   - `Content-Type: application/zip`
   - `Content-Disposition: attachment; filename="diagnostic-...zip"`
4. Descargar archivo ZIP
5. Extraer contenido y verificar archivos:
   - `health.json`: estado del sistema
   - `store-status.json`: estado operativo
   - `config-snapshot.json`: configuración
   - `last-50-audit-logs.json`: últimos 50 logs de auditoría
   - `app-version.txt`: versión del app
6. **Validar sanitización:**
   - Abrir `last-50-audit-logs.json`
   - Verificar que NO contiene:
     - Contraseñas
     - Tokens
     - Emails completos
     - API keys
   - Campos sensibles deben mostrar "[REDACTED]"
7. **Validar permisos:**
   - Login como CASHIER
   - GET `/api/system/diagnostic/export`
   - Verificar HTTP 403

**Resultado esperado:**
- ✅ Solo OWNER tiene acceso
- ✅ ZIP descarga correctamente
- ✅ 5 archivos dentro del ZIP
- ✅ NO contiene datos sensibles
- ✅ Audit log con acción "DIAGNOSTIC_EXPORT" y severity "WARN"

---

### 6️⃣ UI - Panel de Observabilidad

**Objetivo:** Verificar que el panel de admin muestra correctamente la información del sistema.

**Pasos:**
1. Login como OWNER
2. Navegar a `/admin/system`
3. Verificar que se cargan todas las secciones:
   - **Estado del Sistema**: indicador verde/amarillo/rojo
   - **Estado de la Tienda**: nombre, turno, ventas hoy
   - **Configuración Activa**: flags y límites
   - **Estado de Backups**: total, último backup
4. **Validar auto-refresh:**
   - Dejar la página abierta 30 segundos
   - Verificar que el indicador de salud se actualiza automáticamente
5. **Validar botón de exportación:**
   - Click en "📦 Exportar Diagnóstico"
   - Verificar que descarga archivo ZIP
   - Verificar que el botón muestra "Exportando..." mientras procesa
6. **Validar botón de refrescar:**
   - Click en "🔄 Refrescar"
   - Verificar que recarga todos los datos
7. **Validar colores de estado:**
   - Estado "OK": indicador verde
   - DB latency < 50ms: normal
   - DB latency > 200ms: amarillo (degradado)

**Resultado esperado:**
- ✅ Panel carga en < 2 segundos
- ✅ Datos en tiempo real
- ✅ Auto-refresh cada 30 segundos
- ✅ Exportación funciona correctamente
- ✅ Indicadores visuales claros (colores)

---

### 7️⃣ Seguridad y Permisos

**Objetivo:** Verificar que los endpoints están correctamente protegidos.

**Pasos:**
1. **Sin autenticación:**
   - GET `/api/system/health` (sin cookie de sesión)
   - Verificar HTTP 401
2. **Como CASHIER:**
   - Login como CASHIER
   - GET `/api/system/store-status`
   - Verificar HTTP 403
   - Intentar acceder a `/admin/system`
   - Verificar que el middleware bloquea (redirect o 403)
3. **Como OWNER:**
   - Login como OWNER
   - GET `/api/system/health`
   - Verificar HTTP 200
4. **Validar no-cache:**
   - GET `/api/system/store-status`
   - Verificar headers:
     - `Cache-Control: no-store, no-cache, must-revalidate`
     - `Pragma: no-cache`

**Resultado esperado:**
- ✅ Sin sesión: HTTP 401
- ✅ CASHIER: HTTP 403 en todos los endpoints
- ✅ OWNER: HTTP 200
- ✅ Respuestas no se cachean
- ✅ Audit logs para todos los accesos

---

### 8️⃣ Performance y Estabilidad

**Objetivo:** Verificar que los endpoints no afectan el performance del sistema.

**Pasos:**
1. **Carga de salud:**
   - Hacer 10 requests consecutivos a `/api/system/health`
   - Verificar que todos responden en < 100ms
2. **Carga del panel UI:**
   - Refrescar `/admin/system` 5 veces
   - Verificar que carga en < 2 segundos cada vez
3. **Exportación concurrente:**
   - Abrir 2 tabs
   - Click "Exportar Diagnóstico" en ambas simultáneamente
   - Verificar que ambas descargas completan correctamente
4. **Monitoreo sin impacto:**
   - Realizar 20 ventas consecutivas
   - Verificar que el sistema responde igual de rápido
   - Verificar que no hay errores en logs

**Resultado esperado:**
- ✅ Health check: < 100ms
- ✅ Store status: < 500ms
- ✅ UI panel: < 2 segundos
- ✅ Exportación: < 3 segundos
- ✅ No afecta performance de operaciones normales

---

### 9️⃣ Audit Logs - Trazabilidad

**Objetivo:** Verificar que todos los accesos se registran en audit logs.

**Pasos:**
1. Hacer las siguientes acciones:
   - GET `/api/system/health`
   - GET `/api/system/store-status`
   - GET `/api/system/config-snapshot`
   - GET `/api/system/backups/status`
   - GET `/api/system/diagnostic/export`
2. Verificar en base de datos (tabla `audit_logs`):
   - Cada acción tiene un registro
   - Actions:
     - `HEALTH_CHECK_ACCESSED`
     - `STORE_STATUS_ACCESSED`
     - `CONFIG_SNAPSHOT_ACCESSED`
     - `BACKUPS_STATUS_ACCESSED`
     - `DIAGNOSTIC_EXPORT`
   - Severity:
     - Health: INFO
     - Store/Config/Backups: INFO
     - Diagnostic Export: WARN (porque es crítico)
   - Metadata incluye IP y User-Agent

**Resultado esperado:**
- ✅ Todos los accesos registrados
- ✅ Severity correcta
- ✅ IP y User-Agent presentes
- ✅ Fire-and-forget (no afecta respuesta)

---

## 🎯 Criterio de Éxito

✅ **9/9 pruebas pasadas**: El módulo de observabilidad está completamente funcional.

---

## 🔧 Troubleshooting

### Problema: Health check reporta DEGRADED
- **Causa:** Base de datos no responde o latencia alta
- **Solución:** Verificar PostgreSQL, revisar logs

### Problema: Store status no muestra ventas del día
- **Causa:** Timestamp del query no coincide con zona horaria
- **Solución:** Verificar que `startOfDay` usa hora local correcta

### Problema: Exportación falla con error 500
- **Causa:** Falta dependencia `adm-zip` o permisos de escritura
- **Solución:** `npm install adm-zip`, verificar permisos

### Problema: UI no carga datos
- **Causa:** Endpoints devuelven 403 o 500
- **Solución:** Verificar sesión, revisar logs de backend

### Problema: Auto-refresh no funciona
- **Causa:** Tab en background (browser throttling)
- **Solución:** Es comportamiento normal del navegador

---

## 📊 Métricas de Observabilidad

**Endpoints funcionando:** 5/5
- ✅ `/api/system/health`
- ✅ `/api/system/store-status`
- ✅ `/api/system/config-snapshot`
- ✅ `/api/system/backups/status`
- ✅ `/api/system/diagnostic/export`

**UI Panel:** 1/1
- ✅ `/admin/system`

**Performance:**
- Health check: < 100ms
- Store status: < 500ms
- Config snapshot: < 300ms
- Backups status: < 200ms
- Diagnostic export: < 3s
- UI load: < 2s

**Seguridad:**
- ✅ Solo OWNER tiene acceso
- ✅ Sin caché de datos sensibles
- ✅ Sanitización de datos en exportación
- ✅ Audit logging completo

---

## ✨ Conclusión

El módulo de observabilidad proporciona visibilidad práctica y suficiente para un POS real, sin agregar complejidad innecesaria. Permite detectar problemas rápidamente y exportar diagnósticos para soporte técnico.
