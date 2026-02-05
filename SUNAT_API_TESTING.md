# Pruebas del API SUNAT

## 1. Crear documento de prueba (BOLETA)

**Endpoint:** `POST http://localhost:3000/api/sunat/test-draft`

**Headers:**
```
Content-Type: application/json
Cookie: market_pos_session=<tu-cookie-de-sesión>
```

**Body:**
```json
{
  "storeId": "cml6196gm00001734mluw5pkr",
  "docType": "BOLETA",
  "customer": {
    "docType": "DNI",
    "docNumber": "12345678",
    "name": "Juan Pérez García"
  },
  "totals": {
    "taxable": 84.75,
    "igv": 15.25,
    "total": 100.00
  }
}
```

**Respuesta esperada:**
```json
{
  "document": {
    "id": "cml...",
    "docType": "BOLETA",
    "fullNumber": "B001-00000001",
    "series": "B001",
    "number": 1,
    "status": "DRAFT",
    "customer": {
      "docType": "DNI",
      "docNumber": "12345678",
      "name": "Juan Pérez García"
    },
    "totals": {
      "taxable": 84.75,
      "igv": 15.25,
      "total": 100.00
    },
    "createdAt": "2026-02-02T..."
  }
}
```

---

## 2. Crear FACTURA de prueba

**Body:**
```json
{
  "storeId": "cml6196gm00001734mluw5pkr",
  "docType": "FACTURA",
  "customer": {
    "docType": "RUC",
    "docNumber": "20123456789",
    "name": "EMPRESA DE PRUEBA SAC",
    "address": "Av. Javier Prado 1234, San Isidro, Lima"
  },
  "totals": {
    "taxable": 423.73,
    "igv": 76.27,
    "total": 500.00
  }
}
```

---

## 3. Inicializar configuración SUNAT

**Endpoint:** `POST http://localhost:3000/api/sunat/initialize`

**Body:**
```json
{
  "storeId": "cml6196gm00001734mluw5pkr",
  "env": "BETA"
}
```

**Respuesta esperada:**
```json
{
  "settings": {
    "storeId": "cml6196gm00001734mluw5pkr",
    "env": "BETA",
    "enabled": false,
    "defaultFacturaSeries": "F001",
    "defaultBoletaSeries": "B001",
    "nextFacturaNumber": 1,
    "nextBoletaNumber": 1
  }
}
```

---

## Notas:

- **Requiere autenticación**: Debes estar logueado como usuario OWNER o SUPERADMIN
- **Ambiente BETA**: Para pruebas sin afectar SUNAT real
- **Correlativos automáticos**: Cada documento incrementa el correlativo automáticamente
- **Estado DRAFT**: Los documentos se crean en estado borrador (aún no se envían a SUNAT)

---

## Verificar resultados:

1. **Prisma Studio:**
   ```bash
   npx prisma studio
   ```
   Navega a: `electronic_documents`, `sunat_settings`, `audit_logs`

2. **Script de verificación:**
   ```bash
   node scripts/verify-sunat.js
   ```

3. **Check directo en DB:**
   ```sql
   SELECT * FROM electronic_documents ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM sunat_settings;
   SELECT * FROM audit_logs WHERE entity_type = 'SUNAT';
   ```
