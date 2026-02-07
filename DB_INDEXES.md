# MÓDULO S4 — DB INDEXES + OPTIMIZACIÓN PRISMA

## Resumen

**97 índices** configurados para optimizar queries frecuentes a medida que la base de datos crece.

## ¿Por qué índices?

| Sin índice | Con índice |
|------------|------------|
| Escanea 100,000 filas | Va directo a ~500 filas relevantes |
| Query: 2-5 segundos | Query: 10-50 ms |
| CPU alto | CPU mínimo |

---

## Índices por Tabla

### Sales (Ventas)
| Índice | Uso |
|--------|-----|
| `sales_store_id_created_at_idx` | Ventas por tienda y fecha (reportes diarios/mensuales) |
| `sales_customer_id_idx` | Ventas por cliente (historial de compras) |
| `sales_shift_id_idx` | Ventas por turno (cierre de caja) |
| `sales_store_id_sale_number_key` | Búsqueda por número de venta (único) |

### SaleItems (Detalle de venta)
| Índice | Uso |
|--------|-----|
| `sale_items_sale_id_idx` | Items de una venta específica |
| `sale_items_store_product_id_idx` | Historial de ventas de un producto |
| `sale_items_service_id_idx` | Historial de ventas de servicios |

### Movements (Movimientos de inventario)
| Índice | Uso |
|--------|-----|
| `movements_store_id_created_at_idx` | Movimientos por tienda y fecha |
| `movements_store_product_id_created_at_idx` | Kardex de un producto |

### StoreProducts (Productos de tienda)
| Índice | Uso |
|--------|-----|
| `store_products_store_id_idx` | Productos de una tienda |
| `store_products_product_id_idx` | Tiendas que tienen un producto |

### ProductMaster (Catálogo global)
| Índice | Uso |
|--------|-----|
| `products_master_barcode_idx` | Búsqueda por código de barras |
| `products_master_name_idx` | Búsqueda por nombre |
| `products_master_normalized_name_idx` | Búsqueda fuzzy |
| `products_master_fingerprint_idx` | Deduplicación |

### Customers (Clientes)
| Índice | Uso |
|--------|-----|
| `customers_store_id_name_idx` | Búsqueda de clientes por nombre |

### Receivables (Cuentas por cobrar)
| Índice | Uso |
|--------|-----|
| `receivables_store_id_status_idx` | Fiados pendientes/pagados |
| `receivables_customer_id_idx` | Deudas de un cliente |

### AuditLog (Auditoría)
| Índice | Uso |
|--------|-----|
| `audit_logs_store_id_created_at_idx` | Logs por tienda y fecha |
| `audit_logs_severity_idx` | Filtro por severidad |
| `audit_logs_severity_created_at_idx` | Alertas críticas recientes |
| `audit_logs_action_idx` | Filtro por tipo de acción |
| `audit_logs_entity_type_entity_id_idx` | Historial de una entidad |

### Shifts (Turnos)
| Índice | Uso |
|--------|-----|
| `shifts_store_id_opened_at_idx` | Turnos por tienda y fecha |

### Categories (Categorías)
| Índice | Uso |
|--------|-----|
| `categories_store_id_idx` | Categorías de una tienda |
| `categories_parent_id_idx` | Subcategorías |

### Promotions (Promociones)
| Índice | Uso |
|--------|-----|
| `promotions_store_id_active_idx` | Promociones activas |
| `category_promotions_store_id_active_idx` | Promos por categoría activas |
| `volume_promotions_store_id_active_idx` | Promos por volumen activas |
| `nth_promotions_store_id_active_idx` | Promos N-ésimo activas |
| `coupons_store_id_active_idx` | Cupones activos |

### ElectronicDocuments (SUNAT)
| Índice | Uso |
|--------|-----|
| `electronic_documents_store_id_status_idx` | Documentos por estado |
| `electronic_documents_store_id_issue_date_idx` | Documentos por fecha |
| `electronic_documents_store_id_doc_type_issue_date_idx` | Boletas/facturas del día |
| `electronic_documents_full_number_idx` | Búsqueda por número completo |

### Units (Unidades SUNAT)
| Índice | Uso |
|--------|-----|
| `units_code_idx` | Búsqueda por código |
| `units_sunat_code_idx` | Búsqueda por código SUNAT |
| `units_kind_idx` | Filtro por tipo (GOODS/SERVICES) |
| `units_active_idx` | Unidades activas |

### UnitConversions (Conversiones)
| Índice | Uso |
|--------|-----|
| `unit_conversions_store_id_product_master_id_idx` | Conversiones de un producto |

---

## Verificación

```sql
-- Contar índices
SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';

-- Listar índices de una tabla
SELECT indexname FROM pg_indexes WHERE tablename = 'sales';

-- Ver si un query usa índice
EXPLAIN ANALYZE SELECT * FROM sales WHERE store_id = 'xxx' ORDER BY created_at DESC LIMIT 10;
```

---

## Mantenimiento

Los índices se actualizan automáticamente con INSERT/UPDATE/DELETE. No requieren mantenimiento manual.

Para tablas muy grandes (>1M filas), considerar `REINDEX`:
```sql
REINDEX TABLE sales;
```

---

**Última actualización:** MÓDULO S4 - Febrero 2026
