# 📘 SUNAT OPERATIONS GUIDE

## Guía de Operaciones SUNAT - Sistema Market

Documentación operativa para facturación electrónica SUNAT en el sistema Market POS.

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (POS)                           │
│  • Checkout → crea Sale → opcionalmente llama /api/sunat/emit   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                         │
│  /api/sunat/emit → Crea ElectronicDocument + Job                │
│  /api/sunat/summary/run → Resumen Diario / Baja                 │
│  /api/sunat/admin/* → Endpoints administrativos                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WORKER ASÍNCRONO                             │
│  processSunatJob → firma XML → envía SOAP → procesa CDR         │
│                                                                 │
│  ⚠️ IMPORTANTE: NO bloquea el checkout                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUNAT SOAP SERVICES                          │
│  • BETA: https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta       │
│  • PROD: https://e-factura.sunat.gob.pe/ol-ti-itcpfegem         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Entornos SUNAT

### BETA (Homologación)
- **URL Base**: `https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService`
- **Propósito**: Pruebas y desarrollo
- **Credenciales**: Usuario SOL de prueba
- **Documentos**: No tienen validez tributaria

### PROD (Producción)
- **URL Base**: `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService`
- **Propósito**: Documentos reales con validez tributaria
- **Credenciales**: Usuario SOL de producción
- **⚠️ IRREVERSIBLE**: Documentos emitidos afectan declaraciones

---

## 🔐 Seguridad y Credenciales

### Prioridad de Credenciales

El sistema carga credenciales con esta prioridad:

1. **Variables de Entorno** (recomendado para PROD)
   ```env
   SUNAT_SOL_USER=20123456789USUARIO1
   SUNAT_SOL_PASS=contraseña_segura
   SUNAT_CERT_PFX=base64_del_certificado
   SUNAT_CERT_PASSWORD=password_certificado
   ```

2. **SunatSettings en DB** (para desarrollo/múltiples tiendas)

### Datos que NUNCA se Loguean/Exponen
- ❌ `solPass` - Contraseña SOL
- ❌ `certPassword` - Contraseña del certificado
- ❌ `certPfxBase64` - Certificado digital
- ❌ XML completo firmado

### Auditoría Segura
Todos los eventos se registran en `AuditLog` SIN datos sensibles:
- ✅ RUC (público)
- ✅ Series y correlativos
- ✅ Estados y errores
- ✅ IPs y User-Agents

---

## 🔄 Estados de Documentos

```
DRAFT → SIGNED → SENT → ACCEPTED
                     ↘ REJECTED
                     ↘ ERROR (retry)
```

| Estado | Descripción | Acción |
|--------|-------------|--------|
| `DRAFT` | Creado, sin firmar | Worker procesa |
| `SIGNED` | Firmado, pendiente envío | Worker envía |
| `SENT` | Enviado, esperando respuesta | Poll ticket |
| `ACCEPTED` | SUNAT aceptó | ✅ Completado |
| `REJECTED` | SUNAT rechazó | ❌ Ver error |
| `ERROR` | Error técnico | Reintentar |

---

## 🛠️ Operaciones Comunes

### 1. Activar Entorno PRODUCCIÓN

```bash
# Verificar requisitos
GET /api/sunat/settings/environment

# Respuesta:
{
  "currentEnv": "BETA",
  "prodRequirements": {
    "hasValidRuc": true,
    "hasSolCredentials": true,
    "hasCertificate": true,
    "hasRazonSocial": true
  },
  "canActivateProd": true
}

# Activar PROD (SUPERADMIN only)
POST /api/sunat/settings/environment
{
  "env": "PROD",
  "confirmText": "ACTIVAR PRODUCCION"
}
```

### 2. Re-encolar Documentos Fallidos

```bash
# Ver estado
GET /api/sunat/admin/requeue

# Re-encolar todos los ERROR
POST /api/sunat/admin/requeue
{
  "status": "ERROR"
}

# Re-encolar documento específico
POST /api/sunat/admin/requeue
{
  "documentId": "clxxxxx"
}
```

### 3. Ejecutar Resumen Diario Manualmente

```bash
POST /api/sunat/summary/run
{
  "date": "2024-01-15",  # Opcional, default: ayer
  "type": "SUMMARY"      # SUMMARY o VOIDED
}
```

### 4. Verificar Estado de Configuración

```bash
GET /api/sunat/settings/status

# Respuesta (sin secretos):
{
  "enabled": true,
  "env": "BETA",
  "configured": true,
  "ruc": "20123456789",
  "hasSolCredentials": true,
  "hasCertificate": true
}
```

---

## ⚠️ Manejo de Errores

### Errores Comunes SUNAT

| Código | Descripción | Solución |
|--------|-------------|----------|
| `0100` | Firma digital inválida | Verificar certificado |
| `0101` | Usuario SOL inválido | Verificar credenciales |
| `1033` | Documento duplicado | Ya fue enviado |
| `2017` | RUC inválido | Verificar cliente |
| `2800` | Error de formato XML | Revisar generación |

### Estrategia de Reintentos

```
Intento 1: Inmediato
Intento 2: +1 minuto
Intento 3: +5 minutos
Intento 4: +15 minutos
Intento 5: +60 minutos
Máximo: 5 intentos
```

Si falla después de 5 intentos → `ERROR` → Intervención manual

---

## 📊 Monitoreo

### Métricas Clave

```sql
-- Documentos por estado (últimas 24h)
SELECT status, COUNT(*) 
FROM electronic_documents 
WHERE created_at > NOW() - INTERVAL 24 HOUR
GROUP BY status;

-- Jobs fallidos
SELECT * FROM sunat_jobs 
WHERE status = 'FAILED' 
ORDER BY updated_at DESC;

-- Tasa de éxito
SELECT 
  COUNT(CASE WHEN status = 'ACCEPTED' THEN 1 END) as accepted,
  COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected,
  COUNT(*) as total
FROM electronic_documents
WHERE created_at > NOW() - INTERVAL 7 DAY;
```

### Alertas Recomendadas

1. **Jobs FAILED > 10 en 1 hora** → Posible problema de conectividad
2. **Documentos SIGNED sin procesar > 1 hora** → Worker caído
3. **Documentos SENT sin respuesta > 4 horas** → Problema polling

---

## 🚀 Checklist Pre-Producción

### Configuración
- [ ] RUC configurado (11 dígitos válidos)
- [ ] Razón social configurada
- [ ] Credenciales SOL de producción
- [ ] Certificado digital válido (.pfx)
- [ ] Series configuradas (F001, B001, etc.)

### Validaciones
- [ ] Prueba de firma digital exitosa
- [ ] Prueba de envío BETA exitosa
- [ ] Prueba de recepción CDR
- [ ] Prueba de Resumen Diario

### Seguridad
- [ ] Credenciales en ENV (no en DB para PROD)
- [ ] Backup de certificado digital
- [ ] Auditoría habilitada
- [ ] Logs sin datos sensibles

### Operaciones
- [ ] Worker configurado y activo
- [ ] Cron de Resumen Diario (01:00 AM)
- [ ] Alertas de monitoreo configuradas
- [ ] Procedimiento de rollback documentado

---

## 📞 Soporte SUNAT

- **Mesa de Ayuda**: 0-801-12-100
- **Portal CPE**: https://cpe.sunat.gob.pe
- **Documentación**: https://cpe.sunat.gob.pe/manuales

---

## 📝 Historial de Versiones

| Módulo | Fecha | Descripción |
|--------|-------|-------------|
| 18.1 | - | Setup inicial, modelos Prisma |
| 18.2 | - | Generación XML UBL 2.1 |
| 18.3 | - | Firma digital XAdES-BES |
| 18.4 | - | Cliente SOAP, worker |
| 18.5 | - | API /emit, configuración |
| 18.6 | - | Resumen Diario, Comunicación Baja |
| 18.7 | - | PROD hardening, validaciones, operaciones |

---

*Última actualización: Módulo 18.7*
