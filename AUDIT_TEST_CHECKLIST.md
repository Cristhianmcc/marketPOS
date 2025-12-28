# MÓDULO 15 - FASE 4: AUDITORÍA - CHECKLIST DE TESTING

## ✅ CHECKLIST OBLIGATORIO

### A) Logs de Operaciones Críticas

- [ ] 1. **Checkout Exitoso**
  - Realizar venta completa
  - Verificar que aparece en logs con severity INFO
  - Acción: `SALE_CHECKOUT_SUCCESS`
  - EntityType: `SALE`

- [ ] 2. **Checkout Fallido**
  - Intentar venta que falle (límite excedido, etc.)
  - Verificar que aparece con severity ERROR
  - Acción: `SALE_CHECKOUT_FAILED`
  - Debe incluir mensaje de error en metadata

- [ ] 3. **Anulación de Venta**
  - Anular una venta
  - Verificar que aparece con severity WARN
  - Acción: `SALE_VOIDED`
  - EntityType: `SALE`

- [ ] 4. **Cambio de Límites Operativos**
  - Modificar límites en `/settings/limits`
  - Verificar que aparece en logs
  - Acción: `LIMITS_UPDATED`
  - EntityType: `SYSTEM`
  - Severity: WARN

- [ ] 5. **Cambio de Feature Flag**
  - Activar/desactivar feature flag
  - Verificar que aparece en logs
  - Acción: `FEATURE_ENABLED` o `FEATURE_DISABLED`
  - EntityType: `SYSTEM`
  - Severity: INFO

- [ ] 6. **Operación de Restore**
  - Ejecutar restore de datos
  - Verificar que aparece en logs
  - Acción: `RESTORE_EXECUTED`
  - EntityType: `RESTORE`
  - Severity: WARN

### B) Control de Acceso

- [ ] 7. **OWNER Solo Ve Su Tienda**
  - Login como OWNER
  - Acceder a `/admin/audit`
  - Verificar que solo ve logs de su storeId
  - NO debe poder filtrar por otro storeId

- [ ] 8. **SUPERADMIN Ve Todas**
  - Login como SUPERADMIN
  - Acceder a `/admin/audit`
  - Verificar que ve logs de todas las tiendas
  - Puede filtrar por storeId específico

### C) Funcionalidad de Filtros

- [ ] 9. **Paginación Funciona**
  - Generar más de 25 logs
  - Verificar que aparece paginación
  - Probar botones Anterior/Siguiente
  - Verificar contador de registros correcto

- [ ] 10. **Filtro por Severidad**
  - Seleccionar INFO
  - Verificar que solo muestra logs INFO
  - Repetir con WARN y ERROR

- [ ] 11. **Filtro por Rango de Fechas**
  - Establecer fecha desde y hasta
  - Verificar que solo muestra logs en ese rango
  - Probar límites (inicio y fin del día)

- [ ] 12. **Filtro por Acción**
  - Buscar por texto (ej: "CHECKOUT")
  - Verificar que filtra correctamente
  - Es case-insensitive

- [ ] 13. **Filtro por Tipo de Entidad**
  - Seleccionar SALE
  - Verificar que solo muestra logs de ventas
  - Repetir con otros tipos

- [ ] 14. **Limpiar Filtros**
  - Aplicar varios filtros
  - Click en "Limpiar"
  - Verificar que resetea todos los filtros
  - Vuelve a página 1

### D) UI/UX

- [ ] 15. **Badges de Severidad**
  - INFO → Azul
  - WARN → Amarillo
  - ERROR → Rojo

- [ ] 16. **Detalle Expandible**
  - Click en fila
  - Se expande mostrando metadata
  - JSON formateado y legible
  - Scroll si es muy largo

- [ ] 17. **Loading State**
  - Al cargar página muestra "Cargando logs..."
  - Al aplicar filtros muestra loading

- [ ] 18. **No Hay Resultados**
  - Filtrar algo que no existe
  - Muestra mensaje "No se encontraron registros"

- [ ] 19. **Error Handling**
  - Simular error de backend
  - Muestra toast con mensaje claro
  - No rompe la UI

### E) Integridad del Sistema

- [ ] 20. **NO Afecta Checkout**
  - Realizar ventas normales
  - Sistema sigue funcionando igual
  - No hay errores en consola

- [ ] 21. **NO Afecta POS**
  - Usar POS normalmente
  - Agregar productos, descuentos, etc.
  - Todo funciona sin cambios

- [ ] 22. **NO Afecta Turnos**
  - Abrir y cerrar turno
  - Funciona igual que antes

- [ ] 23. **NO Afecta FIADO**
  - Crear venta FIADO
  - Registrar pago
  - Sin impacto en flujo

- [ ] 24. **NO Afecta Reportes**
  - Generar reportes
  - Datos correctos
  - Sin cambios en lógica

### F) Performance

- [ ] 25. **Carga Rápida**
  - Con 100+ logs la página carga en < 2 segundos
  - Paginación evita sobrecarga

- [ ] 26. **Filtros en DB**
  - Verificar que filtros se aplican en query
  - NO se filtran todos los logs en frontend

### G) Seguridad

- [ ] 27. **Sin Datos Sensibles**
  - Revisar metadata de logs
  - NO contiene passwords
  - NO contiene tokens
  - NO contiene datos de sesión

- [ ] 28. **Solo Lectura**
  - NO hay botón de eliminar
  - NO hay opción de editar
  - Solo visualización

## ✅ CONFIRMACIÓN FINAL

- [ ] **Sistema Completo Funciona**
  - Todos los módulos previos operativos
  - Sin errores en consola
  - Sin warnings críticos

- [ ] **Auditoría Lista para Producción**
  - API funcional
  - UI funcional
  - Performance aceptable
  - Seguridad validada

## 📝 NOTAS DE TESTING

### Logs Encontrados:
```
(Registrar aquí ejemplos de logs críticos encontrados durante testing)
```

### Problemas Detectados:
```
(Listar cualquier issue encontrado y su resolución)
```

### Tiempos de Respuesta:
```
- Carga inicial: ___ ms
- Aplicar filtros: ___ ms
- Cambiar página: ___ ms
```

---

**Estado Final:** ⏳ Pendiente de Testing

**Fecha de Validación:** ___________

**Aprobado por:** ___________
