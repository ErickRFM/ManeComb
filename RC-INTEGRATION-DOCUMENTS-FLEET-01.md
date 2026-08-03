# RC-INTEGRATION-DOCUMENTS-FLEET-01

## Veredicto

`RC_INTEGRATION_BLOCKED_TESTS`

La integración de Documentos y Fleet Lifecycle está consolidada y sus pruebas de backend, Mobile y Ventas pasan. La validación Android no concluyó: el primer intento falló por un bloqueo de archivos generados de Reanimated y los dos reintentos, después de detener Gradle, excedieron los límites de 120 y 300 segundos.

## Base e integración

- Rama: `codex/rc-integration-documents-fleet-01`
- Base inicial y `origin/main`: `e76965be89b175248ce87518ed07c44c95f304a7`
- Documentos original: `ddff314bb07f3429e25a5538cd7645945b2224c6`
- Documentos integrado: `484587b`
- Fleet original: `86a41843308d993ded0b76013d12e65f5cc53430`
- Fleet integrado: `cc205fa`
- Commit final de integración: commit que contiene este reporte y la prueba de convivencia, con mensaje `chore(integration): reconcile documents and fleet lifecycle`

Ambos RC eran commits autocontenidos cuyo padre directo era la base. Se aplicaron en orden con cherry-pick: Documentos primero y Fleet después. No hubo conflictos textuales; Git fusionó automáticamente los archivos compartidos. Se revisó la convivencia semántica y se añadió una prueba focalizada, sin cambiar contratos productivos.

## Archivos compartidos y resolución

- `backend/src/data/models.js`: conserva campos e índices documentales de versión, reemplazo y soft delete junto con estado de offboard, retiro y key histórica.
- `backend/src/data/store.js`: conserva todos los métodos documentales y agrega los contratos Fleet sin duplicados; los filtros `organizationId` sobreviven.
- `backend/src/data/mongo-store.js`: conserva paridad documental/Fleet, filtros tenant y transacciones Mongo del lifecycle.
- `mobile/App.tsx`, `mobile/src/api/client.ts`, `mobile/src/navigation/linking.ts`: conviven pantalla documental, descarga/reemplazo y pantalla/ruteo de cuenta suspendida.
- `ventas/src/lib/api.ts` y `ventas/src/types/app.ts`: conserva API/tipos documentales y agrega operaciones/tipos Fleet.
- `ventas/src/store/use-app-store.ts` y `mobile/src/store/root-store.ts`: incorpora lifecycle sin eliminar estado documental existente.
- `backend/package.json`: conserva suite documental y agrega pretest de lifecycle.

## Contratos conservados

Documentos mantiene carga JPG/PDF, descarga autenticada, reemplazo versionado, historial, aprobación/rechazo, soft delete, limpieza física segura y almacenamiento GridFS/Cloudinary/local. Fleet mantiene liberación sin recuperar cupo, cambio bilateral, conflictos 409, offboard idempotente, revocación de sesiones, suspensión/reactivación con capacidad, retiro histórico, eliminación de unidad nunca usada y keys históricas `used` enmascaradas. Ambos mantienen aislamiento tenant y paridad embedded/Mongo.

La prueba integrada demuestra que documentos y versiones sobreviven offboard, reactivación y baja lógica/segura del conductor; el documento de una unidad sobrevive su retiro; otro tenant no ve esos documentos; y una activation key usada permanece `used`.

## Auditoría

- `git grep` confirmó símbolos de offboard/reactivate/retiredAt/usedByDriverState y replaceDocument/listDocumentVersions/downloadDocument.
- Diff específico de modelos y stores revisado: no se observaron schemas, exports, métodos ni filtros tenant perdidos o duplicados.
- Rutas documentales y Fleet permanecen separadas, sin duplicación detectada.
- `git diff --check`: exit 0.
- `git diff --name-only origin/main...HEAD | findstr /I "vehicle-route-assignment"`: sin salida.
- No se modificó Multi-ruta, F3, `VehicleRouteAssignment`, `Route.revision` ni `activateVehicleRouteAssignment()`.

## Pruebas y builds (exit codes reales)

- Instalación backend/mobile/ventas: 0/0/0.
- `backend npm test`: 0; incluye lifecycle, assignment, documentos, tenant isolation y suite completa.
- `node --require ./test/setup-env.js test/driver-documents.test.js`: 0.
- `node --require ./test/setup-env.js test/driver-lifecycle.test.js`: 0.
- `node --require ./test/setup-env.js test/driver-unit-assignment.test.js`: 0.
- `node --require ./test/setup-env.js test/tenant-isolation.test.js`: 0.
- `node --check` de models/store/mongo-store: 0/0/0.
- Mobile `npm run typecheck`: 0.
- Mobile `npm test -- --runInBand`: 0; 26 suites y 139 pruebas.
- Ventas `npm run typecheck`: 0.
- Ventas `npm run build` con `VITE_API_URL=https://manecomb.onrender.com/api`: 0.
- Comando directo `node test/driver-unit-assignment.test.js`: 1 por ausencia de `JWT_SECRET`; el mismo archivo pasa dentro del runner oficial con `test/setup-env.js`.
- Android intento 1: 1, lock en `react-native-reanimated/.../prefab-headers`.
- Android intento 2 tras `gradlew --stop`: 124, timeout a 120 segundos.
- Android intento 3: 124, timeout a 300 segundos.

## Divergencia, archivos finales y limitaciones

La rama contiene los dos commits RC más el commit final de prueba/reporte. Los archivos finales son los 64 archivos combinados de ambos RC, `backend/test/driver-lifecycle.test.js` ampliado y este reporte. No hay divergencia funcional deliberada respecto a los RC fuente.

Limitación pendiente: completar `gradlew.bat assembleDebug --no-daemon --console=plain` en un entorno sin locks de Reanimated y con tiempo suficiente. Hasta obtener exit 0, la rama no debe promoverse a main.

## Publicación

Destino exclusivo: `origin/codex/rc-integration-documents-fleet-01`. No se hizo merge ni push a main.
