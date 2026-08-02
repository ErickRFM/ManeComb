# RC-DOCUMENTS-DRIVER-ADMIN-02 — Afinación integral de documentos

**Estado:** Cerrado técnicamente — pendiente de validación física
**Base:** `e76965b` (`origin/main`)
**Rama:** `codex/rc-documents-driver-admin-02`
**Veredicto:** `RC_DOCUMENTS_CODE_READY_DEVICE_PENDING`

## Diagnóstico y reutilización

La RC conserva el único modelo `Document`, `DocumentRepository`, `DocumentService`, los stores Mongo/embedded, la autenticación, `requireOrganization`, `requireOperationalAccess`, `canManageDocuments` y los tres almacenamientos existentes: GridFS, Cloudinary y local. No se creó otra colección, servicio de archivos, sistema de permisos ni endpoints separados por cliente.

El catálogo real continúa limitado a `category=license` y `name=Licencia tipo C`. `MP-DOC-DRIVER-01.md` se conserva como evidencia histórica; no se reescribió.

| Área | Antes | Después | Evidencia |
| --- | --- | --- | --- |
| Consulta personal | Lista activa propia | Excluye eliminados y versiones sustituidas | Stores y prueba documental |
| Consulta administrativa | Lista por tenant | Activos y `includeDeleted=true` con permiso | Ruta `/documents/admin` |
| Carga | Propietario impuesto por backend | Igual, con compensación si falla el store | `POST /api/documents` |
| Actualización | No existía | Metadatos permitidos; reinicia revisión | `PATCH /api/documents/:documentId` |
| Reemplazo | Nueva carga sin vínculo | Versionado enlazado y reclamo atómico | `POST /api/documents/:documentId/replace` |
| Eliminación | No existía | Soft delete y limpieza física idempotente | `DELETE /api/documents/:documentId` |
| Historial | No existía | Grafo de versiones limitado al tenant | `GET /api/documents/:documentId/history` |
| Descarga | URL protegida abierta sin Bearer | Blob autenticado en web y caché privada Android | Helpers de Mobile/Portal |
| Revisión | Permitía volver a pendiente | Solo aprobar/rechazar; rechazo exige nota | Ruta y Portal |
| UX Mobile | Flujo largo dentro de Perfil | Resumen y pantalla `/mis-documentos` | `mobile/src/screens/documents/` |
| UX Portal | `ownerId` visible y solo revisión | Propietario/unidad hidratados, filtros, edición, historial y borrado | `portal-documents-admin.tsx` |

## Contratos REST

Se conservaron:

- `GET /api/documents`
- `GET /api/documents/admin`
- `POST /api/documents`
- `GET /api/documents/files/:storageKey`
- `PATCH /api/documents/:documentId/review`

Se agregaron:

- `PATCH /api/documents/:documentId`
- `POST /api/documents/:documentId/replace`
- `DELETE /api/documents/:documentId`
- `GET /api/documents/:documentId/history`

La actualización solo acepta `name`, `category` y `expiresAt`. Nunca acepta propietario, tenant, estado de revisión ni datos de almacenamiento desde el cliente. En reemplazo, la nueva versión hereda propietario, organización y categoría; queda `pending_review` y la versión anterior se conserva.

## Seguridad, tenant y permisos

- El conductor siempre queda forzado a `ownerType=driver`, `ownerId=req.user.id` y su organización autenticada.
- Las operaciones del store reciben `organizationId`; IDs de otro tenant se resuelven como no encontrados.
- Solo `canManageDocuments` habilita operaciones administrativas.
- Los eliminados no se listan ni descargan por las rutas normales.
- `includeDeleted=true` requiere permiso administrativo.
- MIME exactos permitidos: PDF, JPEG, PNG y WEBP; límite: 15 MB.
- `Content-Disposition` elimina controles, CR/LF, separadores y comillas.
- Ningún token viaja en query params ni se registra.
- La descarga Android usa Bearer en `HttpURLConnection`, caché privada y `FileProvider`; web usa Blob temporal y revoca el object URL.
- Los POST multipart documentales tienen `_allowRetry=false`, evitando duplicación automática del cliente.

## Versionado, atomicidad y borrado

`replacesDocumentId`, `supersededByDocumentId` y `version` viven en el modelo existente. Mongo reclama la versión anterior mediante actualización condicional y el índice/modelo impide mantener dos reemplazos activos por la misma transición. El store embedded aplica la misma regla de forma sincrónica.

El borrado registra `deletedAt`, `deletedBy` y `deleteReason` antes de limpiar el activo. GridFS, Cloudinary y local comparten `deleteDocumentAsset`; un fallo de proveedor mantiene el documento oculto, registra `cleanup_pending` sanitizado y permite reintento. Antes de borrar una clave se comprueba globalmente que ningún otro documento activo la comparta.

Si una carga inicial o de reemplazo termina con error de persistencia, el activo recién subido se elimina y la versión anterior permanece intacta. Dos reemplazos concurrentes producen una creación y un conflicto; el activo perdedor se limpia.

## Emails

Solo se reutilizan `DOCUMENT_UPLOADED`, `DOCUMENT_APPROVED` y `DOCUMENT_REJECTED`. El envío ocurre después de persistir, mediante el productor central existente. Una revisión sin cambio no emite un segundo evento. No se envía correo al borrar ni por una edición menor.

## UX Mobile

Perfil muestra el resumen de vigentes y pendientes y enlaza a `/mis-documentos`. La pantalla dedicada incluye carga, vacío, error/reintento, estado offline, tarjetas por estado, observaciones de rechazo, edición de metadatos, reemplazo confirmado, historial, eliminación confirmada y estado de apertura.

El selector se abre solo después de validar nombre y vigencia. `@react-native-documents/picker@11.0.4` fue la única dependencia agregada porque el selector de imagen existente no admite PDF. Su wrapper vuelve a validar MIME y tamaño aunque un proveedor Android ignore el filtro del sistema. El selector de avatar no cambió.

## UX Portal

El portal hidrata nombres de conductores y códigos de unidad desde los stores existentes; no presenta `ownerId` como dato principal. Incluye resumen de activos, pendientes, rechazados, vencidos y faltantes; búsqueda local por conductor, unidad y documento; filtros por estado; eliminados bajo solicitud; detalle; descarga autenticada; edición; revisión; historial y eliminación con motivo.

El filtrado permanece local porque el contrato actual entrega un volumen de cuenta controlado. Si el volumen creciera, el siguiente paso sería paginación y filtros backend, sin cambiar el contrato de seguridad.

## Pruebas y builds

| Validación | Resultado |
| --- | --- |
| Backend `npm test` | Aprobado; cadena completa de 31 scripts, 0 fallos |
| Backend documental dirigido | Aprobado; permisos, IDOR, tenant, concurrencia, versiones, soft delete y tres almacenamientos |
| Mobile `npm run typecheck` | Aprobado, 0 errores |
| Mobile `npm test` | 26 suites, 139 pruebas, todas aprobadas |
| Mobile dirigidas | 4 suites, 12 pruebas, todas aprobadas |
| Android `gradlew.bat assembleDebug` | `BUILD SUCCESSFUL`, 656 tareas; APK de 151,832,216 bytes |
| Ventas `npm run typecheck` | Aprobado, 0 errores |
| Ventas `npm run build` | Aprobado, 641 módulos; `VITE_API_URL` efímera |
| `git diff --check` | Limpio |

El primer intento de build web se detuvo por faltar `VITE_API_URL` en el worktree. Se repitió con `https://manecomb.onrender.com/api` solo en el proceso; no se creó ni modificó ningún `.env`.

## Validación manual pendiente

No se contó con credenciales de conductor/administrador ni con un teléfono conectado durante esta ejecución. Falta confirmar en dispositivo físico:

- selección y carga real de JPG y PDF;
- apertura mediante visor instalado y limpieza posterior del temporal;
- flujo autenticado completo conductor: editar, rechazo, reemplazo, historial y borrar;
- flujo autenticado completo administrador: propietario/unidad, revisar, editar, historial, borrar e incluir eliminados;
- usuario sin `canManageDocuments` y aislamiento entre dos tenants.

Por esta razón no se usa `RC_DOCUMENTS_READY`.

## Archivos afectados

### Backend

- `backend/src/data/models.js`
- `backend/src/data/mongo-store.js`
- `backend/src/data/repositories/document-repository.js`
- `backend/src/data/store.js`
- `backend/src/modules/documents/routes.js`
- `backend/src/services/storage.js`
- `backend/test/driver-documents.test.js`
- `backend/test/email-domain-events.test.js`

### Mobile y Android

- `mobile/App.tsx`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/android/app/src/main/java/com/anonymous/combiscontrol/MainApplication.kt`
- `mobile/android/app/src/main/java/com/anonymous/combiscontrol/documents/`
- `mobile/android/app/src/main/res/xml/document_file_paths.xml`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/api/client.ts`
- `mobile/src/navigation/linking.ts`
- `mobile/src/navigation/route-registry.ts`
- `mobile/src/navigation/route-registry.test.ts`
- `mobile/src/native/document-files.ts`
- `mobile/src/native/document-files.test.ts`
- `mobile/src/native/document-picker.ts`
- `mobile/src/native/document-picker.utils.ts`
- `mobile/src/native/document-picker.test.ts`
- `mobile/src/screens/documents/`
- `mobile/src/screens/profile-screen.tsx`
- `mobile/src/types/app.ts`

### Portal

- `ventas/features/portal/api.ts`
- `ventas/features/portal/documents/documents.styles.ts`
- `ventas/features/portal/documents/documents.utils.ts`
- `ventas/features/portal/documents/portal-documents-admin.tsx`
- `ventas/features/portal/screens/portal-documents-screen.tsx`
- `ventas/src/lib/api.ts`
- `ventas/src/types/app.ts`

### Documentación

- `RC-DOCUMENTS-DRIVER-ADMIN-02.md`

## Riesgos pendientes

- La validación real de visor, permisos URI y limpieza temporal depende de un dispositivo físico y una app capaz de abrir PDF/imagen.
- Cloudinary y GridFS se cubrieron mediante contrato y mocks; no se destruyeron activos reales durante pruebas.
- El APK debug se generó sin `.env`; esta advertencia no invalida compilación, pero una instalación operativa debe usar la configuración habitual del entorno.
- Las advertencias de chunks grandes de Vite son preexistentes y no bloquean esta RC.

## Commit y rollback

Mensaje previsto:

```text
feat(documents): complete driver and admin document lifecycle
```

El hash del commit se registra como evidencia externa después de crearlo. Rollback:

```text
git revert <HASH_REAL_RC_DOCUMENTS_DRIVER_ADMIN_02>
```

No ejecutar el rollback durante el cierre.
