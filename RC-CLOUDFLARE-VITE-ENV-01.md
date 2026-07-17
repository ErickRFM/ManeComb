# RC-CLOUDFLARE-VITE-ENV-01

## Resultado ejecutivo

La variable se pierde antes de que Vite comience a transformar el código de la aplicación. El deployment público actual de Cloudflare Pages fue construido con `VITE_MAPBOX_ACCESS_TOKEN` ausente o vacío en el entorno de build.

Vite no elimina ni ignora la variable. Un build controlado con un valor señuelo confirmó que `vite build` lo incorpora literalmente al chunk generado. El mismo build sin la variable produce `TOKEN_EMPTY` y un chunk sin el valor.

## Causa raíz

`VITE_MAPBOX_ACCESS_TOKEN` no fue entregada al proceso `vite build` que generó el deployment público actual. La frontera exacta de pérdida es la configuración de variables del entorno de Cloudflare Pages, antes de Vite.

No existe evidencia de un defecto en `vite.config.js`, en la carga de `.env` ni en el reemplazo de `import.meta.env`.

## Proyecto compilado

Sí, los artefactos públicos corresponden al proyecto `ventas`:

- `ventas/package.json` declara `build: vite build`.
- El HTML público carga `/assets/index-BMGOxJBl.js`.
- Ese bundle referencia `portal-dashboard-screen-Dv5nU34S.js`.
- El dashboard carga dinámicamente `operations-map-zAga362r.js`.
- El chunk contiene los textos y la implementación exclusivos de `ventas/features/portal/components/operations-map.tsx`.

Esto demuestra que el deployment público no proviene de `mobile`, `backend` ni otro paquete.

## Configuración auditada

### Vite

Archivo: `ventas/vite.config.js`

- Usa `loadEnv(mode, process.cwd(), '')`.
- Combina los valores cargados con `process.env`.
- Con Root Directory `ventas`, `process.cwd()` apunta correctamente a esa carpeta.
- No existe `envPrefix` personalizado que excluya `VITE_*`.
- No existe una transformación que borre `VITE_MAPBOX_ACCESS_TOKEN`.

Se añadió un diagnóstico de build que no imprime el secreto:

```js
console.log(mapboxAccessToken ? 'TOKEN_OK' : 'TOKEN_EMPTY');
```

`import.meta.env` es una sustitución aplicada al código cliente durante la transformación; no está disponible como objeto runtime en la ejecución de `vite.config.js`. Por ello, el diagnóstico equivalente y correcto en tiempo de build usa el mismo entorno que Vite cargará.

### package.json y comando

Archivo: `ventas/package.json`

```json
"build": "vite build"
```

Configuración documentada de Cloudflare:

- Root Directory: `ventas`
- Build Command: `npm install && npm run build`
- Build Output Directory: `dist`
- Preset: Vite o None

Esta combinación es coherente con los nombres y contenido de los artefactos publicados.

### Archivos de entorno

| Fuente | Resultado |
| --- | --- |
| `ventas/.env` | No define `VITE_MAPBOX_ACCESS_TOKEN` |
| `ventas/.env.local` | No define `VITE_MAPBOX_ACCESS_TOKEN` |
| `ventas/.env.production` | No existe |
| `ventas/.env.example` | La define como cadena vacía |
| `wrangler.toml` | No existe |
| Git | `.env` y `.env.local` están ignorados; solo `.env.example` está versionado |

Por tanto, ningún archivo versionado puede aportar el token al build remoto.

### Variables Cloudflare

La documentación operativa versionada enumera únicamente:

```env
VITE_API_URL=https://manecomb.onrender.com/api
VITE_SOCKET_URL=https://manecomb.onrender.com
```

No enumera `VITE_MAPBOX_ACCESS_TOKEN` para Production ni Preview.

- Production: el artefacto público demuestra que la variable estuvo ausente o vacía durante el build activo.
- Preview: no hay URL de preview ni credenciales/API de Cloudflare disponibles en el workspace para leer su configuración privada. Su presencia no puede afirmarse. Debe configurarse explícitamente también en ese scope.
- Local: ausente; `.env.example` la deja vacía.

## Evidencia del bundle público

Deployment inspeccionado:

```text
https://manecomb1.pages.dev/assets/operations-map-zAga362r.js
ETag: "9f6999f159e89d4cc5f762de381f879b"
```

Fragmento minificado real:

```js
const Ed="".trim();
Uo.accessToken=Ed;
```

Guard real del mismo bundle:

```js
!Ed||Vr
```

Resultado de inspección:

- Contiene el fallback: sí.
- Contiene un token público `pk.*`: no.
- Valor reemplazado: `""`.

Respuesta inequívoca: el token sigue siendo una cadena vacía en el deployment público actual.

## Prueba controlada de Vite

### Build sin variable

```text
TOKEN_EMPTY
ExitCode: 0
ContainsAuditValue: false
```

### Build con valor señuelo por entorno

```text
VITE_MAPBOX_ACCESS_TOKEN=RC_AUDIT_TOKEN_VALUE
TOKEN_OK
ExitCode: 0
ContainsAuditValue: true
```

El valor señuelo apareció en `operations-map-OdnREIab.js`. Esto demuestra que la cadena Cloudflare/Node → `loadEnv`/`process.env` → Vite → `import.meta.env` funciona cuando la variable existe.

## Deployment y momento de configuración

El deployment público actual no contiene la instrumentación más reciente y conserva el token vacío. No existe evidencia accesible de que se haya creado un deployment nuevo después de agregar la variable en el panel privado.

Si la variable ya fue añadida en Cloudflare después de generar el ETag citado, ese cambio no puede modificar un bundle existente: Vite sustituye variables en build time. Es obligatorio iniciar un deployment nuevo.

## Configuración incorrecta

La configuración incompleta está en las variables de build de Cloudflare Pages:

- `VITE_MAPBOX_ACCESS_TOKEN` no llegó al scope Production que creó el deployment activo.
- El scope Preview no está documentado ni verificable y debe configurarse por separado.
- Los archivos `.env` del repositorio no aportan un valor alternativo.

## Corrección exacta

En Cloudflare Pages, proyecto que publica `manecomb1.pages.dev`:

1. Abrir Settings → Environment variables.
2. Crear `VITE_MAPBOX_ACCESS_TOKEN` con el token público correspondiente.
3. Aplicarla al entorno **Production**.
4. Crear la misma variable en **Preview** si los previews deben mostrar el mapa.
5. Confirmar Root Directory `ventas`.
6. Confirmar Build Command `npm install && npm run build`.
7. Confirmar Build Output Directory `dist`.
8. Ejecutar un deployment nuevo; no reutilizar el artefacto anterior.
9. En el log del build exigir `TOKEN_OK`. El log nunca muestra el valor.

## Validación final requerida

El problema quedará cerrado solo cuando un deployment posterior cumpla simultáneamente:

- Log de Cloudflare: `TOKEN_OK`.
- El HTML público apunte a un chunk nuevo.
- El chunk nuevo no contenga `const <id>="".trim()` para el token.
- El chunk contenga el valor sustituido por Vite.
- Production y, si aplica, Preview hayan sido reconstruidos después de configurar sus variables.

Estado actual: **no corregido en el deployment público**. Vite funciona; el entorno de build activo de Cloudflare no le entregó la variable.
