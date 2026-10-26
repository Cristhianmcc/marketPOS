# Entrega de Monterrial POS Desktop

Este es el procedimiento admitido para compilar y reconocer una entrega de la
aplicación de escritorio. La versión vigente de esta rama es **0.2.0**.

## Reglas de seguridad

- Ejecutar el flujo desde `feature/sunat-beta`.
- No usar `npm run build` para preparar el escritorio: ese comando incluye
  `prisma db push`. La compilación web segura es `npm run build:only`.
- No guardar certificados privados, contraseñas, archivos `.pfx`, `.p12`,
  `.pem` o `.key` en Git ni dentro del instalador.
- La preparación elimina cualquier `.env*` heredado del standalone. El paquete
  contiene un único `.env` público en la raíz de recursos y su única clave
  permitida es `CLOUD_URL`, validada como HTTPS y sin credenciales embebidas.
- La URL de actualizaciones no se puede cambiar desde la interfaz ni desde el
  renderer de Electron. Se fija durante la compilación y solo se acepta HTTPS.
- Sin una URL HTTPS configurada, el autoactualizador permanece deshabilitado.

## Preparar una versión

Actualizar los cuatro archivos de paquete con un único comando:

```powershell
npm run desktop:version -- 0.2.1
```

Comprobar la política de entrega antes de compilar:

```powershell
Set-Location desktop
npm run release:check
Set-Location ..
```

El control falla si las versiones no coinciden, existe una clave privada seguida
por Git, los alias antiguos no delegan al flujo desktop o la URL configurada no
es HTTPS.

Comprobar también de forma aislada la lista permitida del entorno empaquetado:

```powershell
npm run test:desktop-env:isolated
```

## Configurar el origen de actualizaciones

Solo cuando exista un servidor real que publique los artefactos compatibles con
`electron-updater`, definir la variable en la terminal que hará el build:

```powershell
$env:MONTERIAL_UPDATE_FEED_URL = 'https://updates.example.com/monterrial'
```

La variable se valida y se copia a `release-manifest.json`. No se consulta como
configuración de usuario durante la ejecución. Borrar la variable produce una
compilación válida con actualizaciones automáticas deshabilitadas.

## Compilar

Instalador NSIS:

```powershell
npm run desktop:build
```

Portable sin instalador:

```powershell
npm run desktop:portable
```

Ambos comandos ejecutan `npm run build:only`, preparan el servidor standalone,
compilan Electron y generan los artefactos. Los alias `electron:build` y
`electron:pack` delegan a estos mismos flujos.

## Identidad y verificación

Cada paquete incorpora:

- `build-id.txt`: versión, commit y fecha UTC del build.
- `release-manifest.json`: versión, commit completo, estado limpio/sucio,
  fecha UTC, identificador de aplicación y origen de updates.
- `artifact-manifest.json`: archivo externo junto a la distribución con tamaño
  y SHA-256 de cada instalador o ejecutable generado.

Antes de publicar, comprobar que:

1. `sourceDirty` sea `false` en `release-manifest.json`.
2. La versión coincida con la etiqueta de la entrega.
3. Los SHA-256 de `artifact-manifest.json` coincidan con los archivos que se
   enviarán al servidor.
4. El instalador se pruebe en una máquina limpia y sobre una copia de una versión
   anterior.
5. La aplicación muestre el mismo `buildId` que el manifiesto incluido.

## Certificados

El certificado fiscal de cada tienda se carga desde la configuración SUNAT y se
guarda mediante el mecanismo de la aplicación. No forma parte del código fuente.
El certificado de firma de Windows, cuando exista, debe inyectarse desde un
almacén seguro del proceso de publicación.

Si alguna clave privada estuvo alguna vez en Git, retirarla del árbol actual no
elimina sus copias del historial. Debe tratarse como expuesta y reemplazarse si
era real.

## Publicación y actualizaciones

No hay un proveedor ficticio dentro de `desktop/package.json`. Una entrega sin
`MONTERIAL_UPDATE_FEED_URL` no intenta conectarse a ningún servidor de updates.
Con un origen HTTPS configurado, Electron lee únicamente el valor incluido en el
manifiesto empaquetado, descarga la metadata de actualización, verifica las
firmas/hashes suministrados por `electron-updater` y permite instalar después
de completar la descarga.

Nunca publicar una carpeta `dist-electron*` usando solamente su fecha como
identidad. Conservar el instalador, su metadata de actualización y
`artifact-manifest.json` como un solo conjunto.
