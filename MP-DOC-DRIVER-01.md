# MP-DOC-DRIVER-01 — Integración documental del conductor

## Estado

```text
BLOCKED
```

## Commit inicial

```text
ef46af7
```

Rama: `main`.

## Diagnóstico encontrado

ManeComb ya contaba con un único módulo documental operativo:

- Modelo `Document` en MongoDB y equivalente embedded.
- Propiedad por `organizationId`, `ownerType` y `ownerId`.
- Estados de vigencia en `status`.
- Revisión en `reviewStatus`.
- Observaciones en `reviewNotes`.
- Fecha de carga, vencimiento, revisor y fecha de revisión.
- Almacenamiento local, GridFS o Cloudinary mediante el servicio existente.
- Validación Multer de tamaño y formato.
- Lectura personal en `GET /api/documents`.
- Lectura administrativa en `GET /api/documents/admin`.
- Carga en `POST /api/documents`.
- Descarga protegida en `GET /api/documents/files/:storageKey`.
- Revisión administrativa en `PATCH /api/documents/:documentId/review`.
- Perfil móvil con una sección documental, aunque renderizaba exclusivamente el listado administrativo.
- Portal administrativo con consulta, descarga, aprobación, rechazo y observaciones.

No existía un catálogo documental formal servido por API. El único documento personal de conductor contemplado actualmente por los datos y flujos existentes es:

```text
category: license
name: Licencia tipo C
```

No se agregaron INE, comprobantes ni otros tipos no presentes.

## Brecha real encontrada

1. El perfil del conductor reutilizaba la vista administrativa y mostraba “No hay conductores registrados en la empresa”.
2. No existía acción móvil de carga o reemplazo.
3. El cliente móvil solo consultaba documentos.
4. El endpoint de carga aceptaba `ownerType` y `ownerId` del cuerpo también para conductores. Aunque validaba acceso, no derivaba de forma estricta el propietario personal desde la identidad autenticada.
5. Los errores de Multer por formato se convertían en 500 genérico.
6. El perfil no refrescaba expresamente la consulta documental al entrar.

## Modelo y endpoints reutilizados

### Modelo

Se conserva el modelo `Document` actual con:

- `organizationId`.
- `ownerType`.
- `ownerId`.
- `name`.
- `category`.
- `status`.
- `expiresAt`.
- `fileUrl`.
- `storageType`.
- `mimeType`.
- `fileSize`.
- `uploadedAt`.
- `uploadedBy`.
- `originalFileName`.
- `storageKey`.
- `reviewStatus`.
- `reviewedAt`.
- `reviewedBy`.
- `reviewNotes`.

No se creó colección, tabla ni modelo alterno.

### Endpoints

Se conservan:

- `GET /api/documents`.
- `GET /api/documents/admin`.
- `POST /api/documents`.
- `GET /api/documents/files/:storageKey`.
- `PATCH /api/documents/:documentId/review`.

No se creó otro endpoint.

### Almacenamiento

Se reutiliza `uploadDocumentAsset`, incluyendo los drivers actuales:

- GridFS.
- Cloudinary.
- Local según configuración.

## Archivos modificados

| Archivo | Responsabilidad |
|---|---|
| `backend/src/modules/documents/routes.js` | Propiedad autenticada del conductor y errores 413/415 |
| `backend/test/driver-documents.test.js` | Integración, propiedad, tenant, revisión, reemplazo y fallo |
| `backend/package.json` | Incorpora la regresión documental a la suite |
| `mobile/src/api/client.ts` | Carga multipart reutilizando `POST /documents` |
| `mobile/src/screens/profile-screen.tsx` | Experiencia “Tus documentos”, consulta, carga, visualización y reemplazo |
| `mobile/src/screens/profile/profile-screen.styles.ts` | Estilos coherentes con el perfil existente |
| `mobile/src/screens/profile/profile.utils.ts` | Mapeo visual y reglas puras |
| `mobile/src/screens/profile/profile.utils.test.ts` | Mensajes, estados y reemplazo |
| `mobile/package.json` | Incorpora la regresión del perfil a la suite |
| `MP-DOC-DRIVER-01.md` | Cierre técnico |

## Cambios de frontend

Para `role === "driver"`:

- El título es “Tus documentos”.
- Nunca aparece el vacío administrativo.
- Sin documentos aparece “Aún no has cargado tus documentos”.
- Se muestra la acción “Subir documento”.
- Se reutiliza el selector de imágenes nativo.
- En web se aceptan PDF, JPG, PNG y WEBP.
- La vigencia se solicita con formato `AAAA-MM-DD`.
- La carga usa multipart y espera confirmación del servidor.
- Después de cargar se vuelve a consultar `GET /documents`.
- Al entrar al perfil se actualiza la consulta documental.
- Se muestran los estados reales:
  - En revisión.
  - Aprobado.
  - Rechazado.
  - Vencido.
- Las observaciones aparecen en documentos rechazados.
- “Ver archivo” utiliza la URL protegida actual.
- “Reemplazar” aparece únicamente para rechazados o vencidos.
- Pendientes y aprobados no pueden reemplazarse desde la interfaz.
- El conductor no puede seleccionar el estado.

Para roles administrativos se conserva la sección y comportamiento anterior.

## Cambios de backend

`POST /api/documents` ahora aplica:

```text
si role === driver:
  ownerType = driver
  ownerId = req.user.id
```

Los valores `ownerType` y `ownerId` enviados por un conductor se ignoran. Administradores y supervisores conservan el contrato anterior.

La validación de archivo devuelve:

- `413` cuando supera 15 MB.
- `415` cuando no es PDF, JPG, PNG o WEBP.

Un fallo ocurre antes de crear el documento y no elimina registros previos.

## Reglas de propiedad

- El conductor consulta solo documentos personales y de su unidad mediante el filtro existente.
- La carga personal se fuerza a `driver + req.user.id`.
- No puede cargar para otro conductor ni cambiar tenant.
- No puede aprobar, rechazar ni alterar observaciones.
- La descarga comprueba tenant y propietario.
- El administrador conserva `canManageDocuments`.
- La consulta administrativa continúa filtrada por `organizationId`.
- El reemplazo crea un registro nuevo; no elimina ni sobrescribe el documento rechazado o vencido.

## Reglas de reemplazo

| Estado | Acción |
|---|---|
| `rejected` | Puede reemplazarse |
| `vencido` | Puede renovarse |
| `pending_review` | No se reemplaza |
| `approved` | No se reemplaza |

El historial anterior permanece en la colección y en la consulta administrativa.

## Validación multi-tenant

Las pruebas demuestran:

- Un documento de otro `organizationId` no supera `canAccessDocument`.
- Un conductor no ve el documento de otro conductor.
- La carga usa el `organizationId` de la identidad autenticada.
- La lista administrativa usa el tenant del administrador.
- Un conductor que envía otro `ownerId` sigue creando el documento para sí mismo.

## Pruebas ejecutadas

### Mobile

```text
cd mobile
npm test
```

Resultado:

```text
26 suites aprobadas
134 pruebas aprobadas
0 fallos
```

Incluye:

- Selector existente.
- Título por rol.
- Vacío del conductor.
- Estados documentales.
- Reglas de reemplazo.
- Perfil, navegación, autenticación y módulos móviles existentes.

### TypeScript móvil

```text
cd mobile
npm run typecheck
```

Resultado: aprobado.

### Backend

```text
cd backend
$env:PLATFORM_JWT_SECRET=<secreto de prueba>
npm test
```

Resultado: suite completa aprobada.

La regresión nueva verificó:

1. Propietario forzado desde la identidad.
2. Consulta personal.
3. Bloqueo de documentos ajenos.
4. Bloqueo 403 de revisión para conductor.
5. Revisión y observación administrativa.
6. Aparición en consulta administrativa.
7. Reemplazo conservando documento anterior.
8. Formato inválido con 415.
9. Fallo sin pérdida del documento anterior.

### Portal de ventas

```text
cd ventas
npm run typecheck
npm run build
```

Resultado:

```text
Typecheck aprobado
Build aprobado
630 módulos transformados
```

### APK Android

La compilación APK fue solicitada, pero el entorno rechazó la autorización por límite de uso de la herramienta. No se atribuye como error del código. La verificación móvil disponible quedó cubierta por TypeScript y 134 pruebas.

## Regresión

Se verificó que:

- El administrador continúa consultando documentos.
- El administrador continúa aprobando y rechazando.
- Las observaciones se conservan.
- El contrato REST existente no cambia.
- La descarga protegida no cambia.
- El almacenamiento no cambia.
- La autenticación y navegación móvil pasan.
- La suite backend completa pasa.
- El portal administrativo compila sin cambios.

## Riesgos pendientes

1. No existe todavía un catálogo documental formal por organización servido desde backend.
2. La primera integración expone únicamente la licencia ya contemplada.
3. La versión documental se conserva como registros sucesivos, pero no existe un campo explícito `replacesDocumentId`.
4. El selector nativo existente admite imágenes; PDF está disponible en web y backend, pero requerirá un selector documental nativo si se desea PDF móvil.
5. La actualización del conductor ocurre al entrar al perfil o después de cargar; no se agregó un evento Socket.IO documental.

## Fuera de alcance

- Rediseño del perfil.
- Nuevo módulo documental.
- Nuevos tipos documentales.
- Nuevos estados.
- Nueva colección de versiones.
- Cambios de portal administrativo.
- Cambios de Socket.IO.
- GPS, seguimiento, mapas y sesiones de recorrido.
- Pagos, ventas, radio y chat.

## Commit final

Pendiente. El sandbox impidió crear `.git/index.lock` y la autorización para escribir el índice fue rechazada por el límite de uso de la herramienta. No se intentó eludir la restricción ni se incluyeron archivos ajenos.

Mensaje:

```text
feat(documents): enable drivers to manage their own documents
```

## Criterios de cierre

- [x] El conductor ve “Tus documentos”.
- [x] Puede subir un documento permitido.
- [x] Puede consultar su estado.
- [x] Puede reemplazar rechazados o vencidos.
- [x] No puede cambiar el estado.
- [x] No puede consultar documentos ajenos.
- [x] El administrador conserva su flujo.
- [x] El documento aparece en revisión administrativa.
- [x] El tenant permanece protegido.
- [x] No se creó un módulo paralelo.
- [x] Se conservó la lógica documental existente.
- [x] No se tocaron archivos GPS.
- [x] Pruebas y TypeScript aprobados.
- [ ] Commit aislado pendiente por restricción del entorno.

## Veredicto

```text
BLOCKED
```

La funcionalidad, pruebas, typecheck y build web están aprobados. El único bloqueo es materializar el commit aislado. Para cerrar, se deben agregar exclusivamente los diez archivos enumerados, crear el commit con el mensaje reservado, verificar el árbol y sustituir este estado por `CLOSED` antes de incorporar el documento al mismo commit.
