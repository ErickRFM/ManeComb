# RC-ENTERPRISE-TENANT-BOUNDARY-01

## Estado

**Implementado — pendiente únicamente de certificación del SHA final en CI.**

Esta fase elimina un bypass legacy que permitía tratar a un administrador empresarial como actor global dentro de los stores de ManeComb.

## Base de la fase

- PR padre: `#67` — `agent/app-release-persistence-20260809`.
- Rama: `agent/enterprise-tenant-boundary-20260809`.
- PR: `#68`.
- La fase permanece apilada y draft; no debe avanzar antes de su padre.

## Hallazgo confirmado

Tanto `backend/src/data/store.js` como `backend/src/data/mongo-store.js` contenían:

```js
canAccessAllOrganizations(user)
```

con una regla equivalente a:

```text
role = admin AND accountType != company_owner => acceso a todas las organizaciones
```

Ese concepto pertenecía a una arquitectura anterior donde el rol `admin` podía actuar como administrador global.

Después de la separación formal de Platform, esa semántica ya no es válida: un usuario empresarial siempre pertenece a un tenant, independientemente de que su rol sea `admin`.

## Impacto real

La deuda no era únicamente nominal.

### Documents

`GET /api/documents` llama `store.getDocumentsForUser(req.user)`.

`DocumentRepository` heredaba ese método del store sin volver a filtrar por organización. En embedded y Mongo, el bypass legacy podía permitir que un admin operativo recibiera documentos de otros tenants.

### Otras áreas

Users, Fleet, Incidents y Notifications ya poseían repositories que re-filtraban varios resultados a nivel de tenant, por lo que parte del riesgo quedaba neutralizado en la salida final.

Sin embargo, mantener el bypass en el store seguía siendo incorrecto porque:

- Documents sí dependía de él directamente;
- operaciones internas podían usar `canAccessOrganizationResource` como decisión de autorización;
- Mongo podía construir queries globales antes del filtrado de repository;
- un nuevo caller futuro podía volver a exponer datos globales sin darse cuenta.

La solución correcta era retirar la autoridad global del store empresarial, no añadir filtros aislados a cada endpoint.

## Corrección — embedded

Se eliminó `canAccessAllOrganizations`.

### Recursos empresariales

`canAccessOrganizationResource(user, resource)` ahora exige siempre:

- actor con organización resoluble;
- recurso con `organizationId`;
- igualdad exacta entre ambas organizaciones.

El rol `admin` ya no altera esa decisión.

### Inventario de usuarios

`listUsers(currentUser)` conserva dos modos explícitos:

- `currentUser === null` -> inventario interno/global;
- actor empresarial -> únicamente su organización.

Un actor empresarial sin organización no recibe inventario global.

### Documentos

`getDocumentsForUser(user)` exige organización de actor y documento coincidentes antes de aplicar las reglas por rol/owner.

Un admin empresarial ya no puede saltar ese filtro.

## Corrección — Mongo

Se eliminó `canAccessAllOrganizations`.

### `getOrganizationQuery(user)`

- caller `null` -> `{}` para operaciones internas explícitamente globales;
- actor empresarial con organización -> `{ organizationId }`;
- actor empresarial sin organización -> `{ organizationId: "__missing__" }`.

No existe una rama basada en `role` o `accountType` que produzca query global.

### Inventario de usuarios

`listUsers(null)` sigue siendo global para Platform/callers internos.

Cualquier objeto de usuario empresarial queda scoped por organización o por un scope imposible si no tiene tenant.

### Notificaciones

La audiencia por rol vuelve a incluir siempre `organizationId`; un rol `admin` ya no convierte `{ targetRoles: "admin" }` en audiencia cross-tenant.

## Platform sigue siendo la única autoridad global

Esta fase no elimina capacidades globales legítimas.

El patrón existente de `UserRepository` ya documenta la separación:

- Platform puede solicitar inventario global explícitamente con `listUsers(null)`;
- cualquier actor empresarial debe permanecer dentro de su organización.

La diferencia importante es que la globalidad ahora depende de un **caller interno explícito**, no de reciclar un rol empresarial.

## Regresión permanente

Se añadió `backend/test/enterprise-tenant-boundary.test.js` al `npm test` normal.

La prueba:

1. falla si `canAccessAllOrganizations` reaparece en `store.js` o `mongo-store.js`;
2. usa el admin operativo seed de `manecomb-demo`;
3. crea un usuario y documento privados en un tenant extranjero;
4. verifica que `store.getDocumentsForUser(admin)` no devuelve el documento extranjero;
5. verifica que `GET /api/documents` no devuelve el documento extranjero;
6. exige que todos los documentos HTTP visibles pertenezcan a `manecomb-demo`;
7. verifica que `GET /api/users` tampoco devuelve usuarios del tenant extranjero.

La regresión targeted se ejecutó dentro del codemod antes de publicar el cambio y pasó correctamente.

## Infraestructura temporal

Los cambios quirúrgicos en `store.js` y `mongo-store.js` se aplicaron mediante un workflow de codemod de una sola ejecución con paths limitados a sí mismo.

El workflow:

- validó que cada snippet esperado existiera exactamente una vez;
- abortaba si quedaba algún literal `canAccessAllOrganizations`;
- instaló dependencias Backend;
- ejecutó la nueva regresión tenant;
- solo hizo commit después de que la prueba pasara.

Después se eliminó el workflow. No forma parte del diff funcional final.

## Compatibilidad

La fase no modifica:

- roles ni permisos empresariales;
- permisos Platform;
- UI;
- contratos REST exitosos dentro del mismo tenant;
- GPS;
- jornadas;
- pagos;
- suscripción;
- RTC;
- chat/radio;
- persistencia app-release de `#67`.

Un admin empresarial conserva todas sus capacidades administrativas **dentro de su propia organización**.

## Veredicto de arquitectura

Después de esta fase:

- `admin` significa administrador de una empresa, no de ManeComb completo;
- `accountType: operations` no concede globalidad;
- el store empresarial no posee un bypass por rol;
- Platform/callers internos explícitos conservan inventario global cuando usan APIs diseñadas para ello;
- Documents queda alineado con el mismo aislamiento tenant que Users/Fleet/Incidents/Notifications;
- CI impide reintroducir el helper legacy.

**El tenant se decide por organización; la globalidad se decide por Platform, nunca por un rol empresarial.**
