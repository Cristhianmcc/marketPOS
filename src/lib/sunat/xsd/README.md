# Esquemas XSD usados por SUNAT

Esta carpeta permite validar los XML sin conexión antes de encolarlos para envío.

- `2.1`: esquemas normativos UBL 2.1 de OASIS para factura, boleta, nota de
  crédito y nota de débito, obtenidos del paquete oficial UBL 2.1.
- `2.0`: esquemas peruanos `SummaryDocuments` y `VoidedDocuments`, junto con
  sus dependencias UBL 2.0, tomados del espejo público del proyecto openUBL.

Fuentes públicas:

- https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip
- https://cpe.sunat.gob.pe/guias-y-manuales
- https://github.com/darvin2c/openUBL

Al actualizar estos archivos se debe ejecutar `npm run sunat:test:local` y
verificar también que `desktop/scripts/prepare-build.js` los incluya en el
servidor standalone del paquete de escritorio.
