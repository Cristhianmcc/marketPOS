# Evidencias de comprobación

Fecha: 26/09/2026. Ejecución local, sin migraciones ni pruebas sobre datos reales.

| Log | Comando | Resultado |
| --- | --- | --- |
| `audit-typescript.log` | `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | 349 errores TS |
| `audit-lint.log` | `node node_modules/next/dist/bin/next lint` | Errores de configuración de reglas y código; no aprobado |
| `audit-prisma.log` | `node node_modules/prisma/build/index.js validate` | Esquema válido |
| `audit-desktop-typescript.log` | `node node_modules/typescript/bin/tsc -p desktop/tsconfig.json --noEmit --incremental false --pretty false` | Sin diagnósticos; log vacío |
| `audit-print-typescript.log` | `node node_modules/typescript/bin/tsc -p print-service/tsconfig.json --noEmit --incremental false --pretty false` | Sin diagnósticos; log vacío |
| `audit-isolated.log` | `node scripts/audit-pos-isolated.cjs` | Salida 1; H01 y H09 reproducidos con dependencias simuladas |

`git diff --check` también identificó whitespace pendiente en cambios locales
preexistentes de reportes, POS y repositorio de turnos. No se reformatearon esos
archivos ni se alteraron los cambios del usuario.

No se ejecutó `next build`, instalador, restauración, impresión física, worker
SUNAT ni pruebas de integración contra bases reales. No confundir validación de
tipos/esquema con validación funcional integral.
