# Nube para la app móvil (Monterrial POS móvil)

Rama `feature/movil-nube`, creada desde `origin/master` (lo que despliega Render).
Solo agrega archivos nuevos; no cambia el esquema de Prisma ni rutas existentes.

## Rutas nuevas

| Ruta | Quién | Qué hace |
| --- | --- | --- |
| `POST /api/mobile/register` | Cualquiera (5 por hora por IP) | Crea tienda + dueño (OWNER) + `StoreSettings` + suscripción `TRIAL` de 30 días (plan STARTER). Deja la sesión iniciada. Rechaza correos repetidos y correos de `SUPERADMIN_EMAILS` |
| `GET /api/mobile/backups` | Dueño | Lista los respaldos de **su** tienda y si el almacenamiento está activo |
| `POST /api/mobile/backups/request-upload` | Dueño | URL firmada para subir un ZIP; reutiliza intentos fallidos con el mismo SHA-256 |
| `POST /api/mobile/backups/confirm-upload` | Dueño | Confirma la subida (verifica que el archivo exista en el bucket) |
| `POST /api/mobile/backups/request-download` | Dueño | URL firmada del respaldo más reciente (o el indicado) |

En todas las rutas de respaldos el `storeId` sale de la sesión, nunca del cuerpo, y se
comprueba que el usuario y la tienda sigan activos. Las tiendas registradas aparecen en
el panel SUPERADMIN (`/admin/stores`), donde se les cambia el plan como a las del desktop.
La app lee la licencia con `GET /api/settings/billing`: cuando el periodo vence sin
gracia, el estado efectivo pasa a `SUSPENDED` y la app se bloquea hasta renovar.

## Publicar

1. Revisar y unir esta rama a `master`, luego `git push`. Render despliega solo.
   El build ejecuta `prisma db push`, pero esta rama no cambia el esquema.
2. **Respaldos en la nube:** requieren en Render las variables `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` y, si no es AWS, `S3_ENDPOINT` y `S3_REGION`
   (sirve Cloudflare R2). Sin ellas las rutas responden 503 `S3_NOT_CONFIGURED` y la app
   guarda los respaldos solo en el celular.
3. Comprobar: `GET /api/mobile/backups` sin sesión debe responder 401 (no 404).
