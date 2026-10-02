# Contexto del repositorio

Antes de realizar cambios, leer `agent.md`. Contiene el mapa del sistema, los flujos,
las comprobaciones y las restricciones conocidas. Para defectos pendientes y su
evidencia, consultar `docs/audits/2026-09-26-pos.md`.

Revisar después solamente los módulos afectados y sus dependencias; contrastar el
documento con el código actual y `git diff`, porque no reemplaza esa verificación.
Actualizar `agent.md` cuando cambien arquitectura, rutas, esquema o empaquetado.
No marcar hallazgos como corregidos sin verificar la corrección.

El repositorio tenía cambios locales extensos antes de la auditoría. Preservarlos.
No ejecutar scripts de reset, semillas, importación o migración contra una base
real para hacer pruebas. `npm run build` incluye `prisma db push`; para compilar
sin modificar el esquema existe `npm run build:only`.
No copiar valores de `.env`, certificados, credenciales o datos de clientes a
documentación, logs, commits ni respuestas.
