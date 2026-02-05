# ✅ SUNAT PROD TEST CHECKLIST

## Checklist de Verificación para Producción SUNAT

Este checklist debe completarse antes de activar el entorno PRODUCCIÓN.

---

## 📋 1. Configuración Básica

### 1.1 Datos del Emisor
- [ ] **RUC**: 11 dígitos válidos configurados
- [ ] **Razón Social**: Coincide con registro SUNAT
- [ ] **Dirección Fiscal**: Configurada correctamente
- [ ] **Ubigeo**: Código de 6 dígitos correcto

### 1.2 Credenciales SOL
- [ ] **Usuario SOL**: Formato correcto (RUC + usuario)
- [ ] **Contraseña SOL**: Configurada (preferir ENV)
- [ ] **Test Login**: Verificar en portal SUNAT

### 1.3 Certificado Digital
- [ ] **Archivo PFX**: Cargado correctamente
- [ ] **Password**: Configurado (preferir ENV)
- [ ] **Vigencia**: Certificado no vencido
- [ ] **Test Firma**: Firma exitosa en BETA

### 1.4 Series
- [ ] **FACTURA**: F001 (o serie autorizada)
- [ ] **BOLETA**: B001 (o serie autorizada)
- [ ] **NC**: FC01 (para NC de facturas)
- [ ] **ND**: FD01 (para ND de facturas)
- [ ] **Summary**: RC01 (resúmenes diarios)
- [ ] **Voided**: RA01 (comunicaciones de baja)

---

## 📋 2. Pruebas Funcionales BETA

### 2.1 Emisión Individual
```
Ejecutar en BETA antes de pasar a PROD:
```

- [ ] **Test 1**: Emitir BOLETA con DNI → Status ACCEPTED
- [ ] **Test 2**: Emitir BOLETA sin documento → Status ACCEPTED
- [ ] **Test 3**: Emitir FACTURA con RUC válido → Status ACCEPTED
- [ ] **Test 4**: Intentar FACTURA con DNI → Error 400 (bloqueado)
- [ ] **Test 5**: Intentar FACTURA con RUC inválido → Error 400

### 2.2 Idempotencia
- [ ] **Test 6**: Doble POST mismo saleId → Retorna doc existente
- [ ] **Test 7**: Mismo saleId, diferente docType → Nuevo doc

### 2.3 Resumen Diario
- [ ] **Test 8**: Ejecutar RC manual → Ticket recibido
- [ ] **Test 9**: Polling de ticket → Status 0 (aceptado)
- [ ] **Test 10**: Boletas incluidas en RC → reportedInSummary=true

### 2.4 Comunicación de Baja
- [ ] **Test 11**: Ejecutar RA manual → Ticket recibido
- [ ] **Test 12**: Documento anulado → Status actualizado

---

## 📋 3. Pruebas de Seguridad

### 3.1 Protección de Credenciales
- [ ] **Test 13**: GET /api/sunat/settings/status NO devuelve passwords
- [ ] **Test 14**: Audit logs NO contienen solPass, certPassword
- [ ] **Test 15**: Console.log NO imprime credenciales

### 3.2 Control de Acceso
- [ ] **Test 16**: Solo SUPERADMIN puede cambiar a PROD
- [ ] **Test 17**: Requiere confirmText = "ACTIVAR PRODUCCION"
- [ ] **Test 18**: Validaciones previas antes de permitir PROD

---

## 📋 4. Pruebas de Resiliencia

### 4.1 Reintentos
- [ ] **Test 19**: Error de red → Job reintenta automáticamente
- [ ] **Test 20**: Después de 5 intentos → Status ERROR
- [ ] **Test 21**: Admin requeue funciona correctamente

### 4.2 Independencia del Checkout
- [ ] **Test 22**: Venta se guarda aunque SUNAT falle
- [ ] **Test 23**: POS funciona si SUNAT está caído
- [ ] **Test 24**: Jobs se procesan asíncronamente

---

## 📋 5. Verificación API Endpoints

### 5.1 Endpoints Principales
```bash
# Ejecutar cada uno y verificar respuesta correcta:
```

- [ ] `GET /api/sunat/settings/status` → 200 OK
- [ ] `GET /api/sunat/settings/environment` → 200 OK
- [ ] `POST /api/sunat/emit` (con datos válidos) → 200 OK
- [ ] `POST /api/sunat/summary/run` → 200 OK
- [ ] `GET /api/sunat/admin/requeue` → 200 OK

### 5.2 Validaciones de Error
- [ ] Sin auth → 401
- [ ] Sin permisos → 403
- [ ] Datos inválidos → 400
- [ ] Recurso no encontrado → 404

---

## 📋 6. Pre-Activación PROD

### 6.1 Verificación Final
```bash
# Ejecutar antes de activar PROD:
GET /api/sunat/settings/environment
```

Debe mostrar:
```json
{
  "canActivateProd": true,
  "prodRequirements": {
    "hasValidRuc": true,
    "hasSolCredentials": true,
    "hasCertificate": true,
    "hasRazonSocial": true
  }
}
```

### 6.2 Activación
```bash
POST /api/sunat/settings/environment
{
  "env": "PROD",
  "confirmText": "ACTIVAR PRODUCCION"
}
```

### 6.3 Verificación Post-Activación
- [ ] `env` en respuesta es `PROD`
- [ ] Audit log registró `SUNAT_ENV_SWITCHED`
- [ ] Console log muestra cambio

---

## 📋 7. Primer Documento en PROD

### 7.1 Prueba Controlada
- [ ] Emitir primera BOLETA de prueba (monto bajo)
- [ ] Verificar en portal SUNAT que aparece
- [ ] Verificar CDR recibido
- [ ] Verificar status ACCEPTED

### 7.2 Validación Cruzada
- [ ] Consultar en https://cpe.sunat.gob.pe/consulta
- [ ] Datos coinciden con lo enviado
- [ ] QR funcional

---

## 📋 8. Monitoreo Post-Lanzamiento

### 8.1 Primera Hora
- [ ] Revisar logs cada 15 minutos
- [ ] Verificar no hay ERROR acumulados
- [ ] Confirmar jobs se procesan normalmente

### 8.2 Primer Día
- [ ] Ejecutar Resumen Diario manual o esperar cron
- [ ] Verificar todas las boletas incluidas
- [ ] Revisar métricas de éxito

### 8.3 Primera Semana
- [ ] Revisar reportes de errores
- [ ] Ajustar alertas si es necesario
- [ ] Documentar cualquier issue encontrado

---

## 🚨 Rollback de Emergencia

Si algo sale mal en PROD:

```bash
# 1. Cambiar a BETA inmediatamente
POST /api/sunat/settings/environment
{
  "env": "BETA"
}

# 2. Pausar worker (si es posible)
# 3. Revisar logs y diagnosticar
# 4. Contactar mesa de ayuda SUNAT si es necesario
```

⚠️ **NOTA**: Documentos ya enviados a PROD no se pueden revertir.
Deben anularse mediante Comunicación de Baja.

---

## ✅ Aprobación Final

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| Desarrollador | | | |
| QA | | | |
| Contador | | | |
| Gerente | | | |

---

*Checklist Módulo 18.7 - Sistema Market*
