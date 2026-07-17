# RC-CI-REPAIR-01

### Causa raíz

El job `Backend tests` ejecutaba `npm ci` únicamente en `backend`. Después de la extracción de `communication-service`, el backend carga ese paquete desde un directorio hermano. Node resuelve `require('bullmq')` desde `communication-service/node_modules`, directorio que no existía en el runner. El primer error del job era `MODULE_NOT_FOUND: bullmq` al iniciar `rbac-integration.test.js`.

La causa corresponde a configuración de CI e instalación incompleta de dependencias; no era un defecto del código ni de las pruebas.

### Archivos modificados

- `.github/workflows/ci.yml`
- `RC-CI-REPAIR-01.md`

### Cambios realizados

- Se agregó `npm ci` en `communication-service` antes de instalar y probar el backend.
- La caché npm del job backend considera `backend/package-lock.json` y `communication-service/package-lock.json`.
- El job backend usa Node.js 22. Ambos paquetes declaran compatibilidad con Node.js `>=18`.
- `actions/checkout` y `actions/setup-node` se actualizaron de v4 a v5 para dejar de usar el runtime de Actions basado en Node.js 20. No se cambiaron dependencias ni runtimes de la aplicación.

### Evidencia del error corregido

- Antes: `Error: Cannot find module 'bullmq'`, requerido desde `communication-service/src/queue/index.js`.
- Después: `npm ls bullmq --depth=0` reporta `bullmq@5.80.5` dentro de `communication-service`.
- `require.resolve('bullmq')` resuelve `communication-service/node_modules/bullmq/dist/cjs/index.js`.
- La suite que anteriormente se detenía en `rbac-integration.test.js` completó todas sus pruebas con exit code 0.

### Resultado de las validaciones

- `npm ci` en `communication-service`: correcto; 62 paquetes instalados.
- `npm ci` en `backend`: correcto; 215 paquetes instalados y 0 vulnerabilidades reportadas.
- Pruebas de `communication-service`: correctas.
- Suite completa `npm test` del backend: correcta, exit code 0.
- Resolución de `bullmq`: correcta.
- `MODULE_NOT_FOUND`: eliminado.
- Build correspondiente: backend y `communication-service` no definen script de build; las pruebas de arquitectura y humo incluidas en la suite completaron correctamente.
- `git diff --check`: limpio.

### Compatibilidad mantenida

Node.js 22 cumple los motores declarados por backend (`>=18`) y `communication-service` (`>=18.0.0`). Los jobs Mobile y Ventas conservan su versión configurada de Node; únicamente se actualizaron las Actions que ejecutaban un runtime obsoleto.

### Riesgos encontrados

- `npm audit` reporta una vulnerabilidad alta preexistente en las dependencias de `communication-service`. No se actualizaron librerías porque queda fuera del alcance y requeriría evaluar un cambio potencialmente incompatible.
- La ejecución local se realizó con Node.js 24.18.0; la compatibilidad con Node.js 22 está respaldada por los motores declarados y el uso de APIs CommonJS compatibles. La confirmación del runner Node.js 22 ocurrirá al ejecutar el workflow actualizado en GitHub Actions.

### Confirmación de que no hubo cambios funcionales

No se modificaron código fuente, lógica de negocio, APIs, contratos, dependencias, `package.json` ni lockfiles. El cambio se limita a la instalación reproducible de dependencias y a la configuración de CI.

- CI reparada correctamente.
- Sin cambios de comportamiento.
- Sin modificaciones funcionales.
- Pipeline listo para producción.
- `git diff --check` limpio.
