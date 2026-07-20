# RC-DRIVER-REGISTRATION-SIMPLIFICATION-01 — Simplificación del Registro de Conductores

**Fecha:** 2026-07-18
**Rama:** `main`
**Alcance:** Registro público móvil (`/registro`) + soporte de unidades en el flujo de activación existente.

---

## 1. Auditoría del flujo actual (FASE 1)

### Pantallas y componentes

| Elemento | Archivo | Rol |
|---|---|---|
| Pantalla de auth (login + registro) | `mobile/src/screens/customer-auth-screen.tsx` | Única pantalla; `mode: 'login' \| 'register'` |
| Selector de rol | mismo archivo, `styles.registerTypeControl` + `SegmentButton` | Elegía `owner` ("Cliente") vs `driver` ("Soy conductor") |
| Campo de key | mismo archivo, `AuthField "Key de activación"` | Solo visible en modo driver |
| Campos de unidad | mismo archivo, `AuthField "Codigo de unidad"` / `"Placa"` | Texto libre, solo modo driver |
| Store | `mobile/src/store/root-store.ts:2079` | `activateDriverWithKey()` |
| API cliente | `mobile/src/api/client.ts:902,914` | `validateDriverActivationKeyRequest`, `registerDriverActivationRequest` |
| Tipos | `mobile/src/types/app.ts` | `DriverActivationValidation`, `DriverActivationRegisterPayload` |
| Rutas backend | `backend/src/modules/activation-keys/routes.js:261,288` | `POST /driver/activation/validate`, `POST /driver/activation/register` |
| Servicio backend | `backend/src/services/activation-keys.js` | `validateDriverActivationKey`, `registerDriverWithActivationKey` |

### Dónde se usaba la selección Cliente / Soy conductor

Estado `registerProfile` (`'owner' | 'driver'`) y derivado `isDriverRegister`. Impactaba en:

1. Render del bloque `registerTypeControl` (los dos botones).
2. Visibilidad de los campos Key y Nombre.
3. Visibilidad de los campos Código de unidad y Placa.
4. Validación previa al submit (`isDriverRegister && (!key || !name)`).
5. Bifurcación de `handleSubmit`: `activateDriverWithKey()` vs `register({ accountType: 'operations' })`.
6. Texto del botón primario: "Activar cuenta" vs "Registrarse".
7. Cadena de foco entre inputs (`returnKeyType` / `onSubmitEditing`).

### Hallazgo relevante de la auditoría

`POST /driver/activation/validate` **no devolvía unidades**, y `POST /driver/activation/register` **siempre creaba un vehículo nuevo** vía `buildVehiclePayload()` a partir del texto libre (`CB-XXXXX` / `PEND-XXXXX` cuando venía vacío). No existía forma de vincular al conductor con una unidad **ya creada por el Portal**, lo que era el requisito de las FASES 3–4.

---

## 2. Componentes modificados

| Archivo | Cambio |
|---|---|
| `mobile/src/screens/customer-auth-screen.tsx` | Elimina el selector de rol; el registro es siempre conductor; añade `UnitSelector`; valida la key al salir del campo; sustituye los campos de unidad por el selector |
| `mobile/src/types/app.ts` | Añade `DriverActivationUnit`, `availableUnits` en la validación y `unit.vehicleId` en el payload |
| `backend/src/services/activation-keys.js` | `listAvailableActivationUnits()` y `resolveSelectedUnit()`; `validate` devuelve `availableUnits`; `register` respeta la unidad seleccionada |

No se tocó: autenticación, login, Portal, generación de keys, permisos, RBAC, backend de usuarios, navegación ni el modelo de datos.

---

## 3. Flujo antes / después

### Antes

```
/registro
  └── [ Cliente | Soy conductor ]      ← decisión de rol
        ├── Cliente  → register({ accountType: 'operations' })
        └── Conductor→ Key + Nombre + Correo + Contraseña + Confirmación
                       + Código de unidad (texto libre)
                       + Placa (texto libre)
                       → validate(key) → register → crea SIEMPRE un vehículo nuevo
```

### Después

```
/registro  (solo conductores)
  └── Key de activación   ← al salir del campo se valida y se cargan las unidades
      Nombre
      Correo o teléfono
      Contraseña
      Confirmar contraseña
      Unidad asignada     ← selector con las unidades libres de la organización de la key
      → register({ unit: { vehicleId } }) → asocia la unidad existente
```

Los administradores y superadministradores solo usan **Iniciar sesión**; sus cuentas siguen creándose desde el Portal.

---

## 4. Evidencia — eliminación del selector de rol (FASE 2)

Búsqueda en todo el código móvil tras el cambio:

```
$ grep -rn "isDriverRegister|driverUnitCode|driverUnitPlate|registerProfile|registerTypeControl|Soy conductor" mobile/src
No matches found
```

El rol queda implícito: el backend fija `role: "driver"` en `registerDriverWithActivationKey()` (sin cambios), y la app solo llama a `activateDriverWithKey()`. La rama `register({ accountType: 'operations' })` dejó de invocarse desde esta pantalla; la acción del store permanece intacta para otros consumidores.

---

## 5. Evidencia — selector de unidad (FASES 3–5)

Verificación end-to-end contra el backend real (store embebido, servidor HTTP levantado, mismo arranque que `test/activation-keys.test.js`):

```
[ok] unidades creadas por el admin: C-1, C-2
[ok] availableUnits = [{"id":"cbf05fb8…","code":"C-2","plate":"XYZ-987-B","routeName":null,"status":"available"},
                       {"id":"f059b74c…","code":"C-1","plate":"ABC-123-A","routeName":null,"status":"available"}]
[ok] conductor asociado a la unidad seleccionada: C-2
[ok] unidad marcada como assigned con driverId correcto
[ok] la flota sigue teniendo 2 unidades (no se duplicó)
[ok] unidad ocupada excluida; disponibles = [ 'C-1' ]
[ok] unidad ocupada rechazada: La unidad seleccionada ya tiene un conductor asignado.
[ok] registro sin unidad -> 201
TODAS LAS VERIFICACIONES PASARON
```

La última línea confirma además que un intento rechazado por unidad ocupada **no consume la key**: la validación de unidad ocurre antes de `markActivationKeyUsed()`.

### Bug detectado y corregido por esta verificación

La primera implementación leía la flota con `store.getFleetSummary()`. Esa función existe en ambos stores pero **no está exportada**, por lo que el guard devolvía silenciosamente `availableUnits: []` y el selector nunca habría aparecido en producción. Se cambió a `store.getLiveLocations()`, que sí es parte de la API pública de ambos stores (`store.js:2881`, `mongo-store.js:3548`) y es la misma fuente que usa `GET /vehicles`.

### Estados cubiertos (FASE 5)

| Escenario | Comportamiento |
|---|---|
| Sin unidades disponibles | Mensaje informativo; el registro continúa y el backend mantiene su fallback de crear la unidad placeholder |
| Una sola unidad | Preseleccionada automáticamente (`setSelectedUnitId` cuando `units.length === 1`) y confirmada de nuevo en submit |
| Varias unidades | Selección obligatoria; sin selección → "Selecciona la unidad que te fue asignada." |
| Unidad ocupada | No se lista; si llega por payload, el backend responde 409 sin consumir la key |

### Asignación (FASE 4)

No se creó una segunda vía de asignación. Se establece `userPayload.vehicleId` y el store ejecuta `syncDriverVehicleAssignment()` (`store.js:973` en create, `:1109` en update) — exactamente el mismo mecanismo que usa el Portal.

---

## 6. Experiencia y responsive (FASES 6–7)

El formulario quedó en los seis campos pedidos: Key, Nombre, Correo o teléfono, Contraseña, Confirmación, Unidad. No hay pasos nuevos: la validación de la key ocurre al salir del campo, sin botón intermedio.

El selector reutiliza los tokens ya existentes de la pantalla (`DesignSystem.control.md`, `DesignSystem.radius.input`, `Typography.body`, acento `#EA1F23`) y el mismo `styles.field` / `fieldLabel` que los inputs, por lo que hereda el comportamiento responsive vigente: ancho fluido dentro de `panel` (`maxWidth: 420`), padding derivado de `isNarrow` (`width < 390`) y scroll con teclado vía `KeyboardSafeScrollView`. Las filas son verticales y el texto secundario hace wrap, así que no hay desbordamiento horizontal en pantallas chicas.

**Limitación honesta:** la verificación responsive fue por revisión de estilos, no visual. Esta app no tiene target web (`package.json` solo expone `start` de Metro y `android`), así que no hay preview de navegador para capturar pantallas en los tres tamaños. Requiere pasada visual en dispositivo/emulador.

---

## 7. Validaciones ejecutadas (FASE 8)

| Validación | Resultado |
|---|---|
| `npx tsc --noEmit` (mobile) | ✅ sin errores |
| `npx eslint` sobre archivos modificados (mobile) | ✅ sin hallazgos |
| ESLint backend | ⚠️ no aplica — el backend no tiene `eslint.config.js` |
| `npm test` (mobile, Jest) | ✅ 23 suites / 116 tests |
| `test/activation-keys.test.js` | ✅ ok |
| `test/tenant-isolation.test.js` | ✅ ok |
| `test/app-smoke.test.js` | ✅ ok |
| Verificación e2e del selector de unidad | ✅ todas las aserciones |
| Bundle Android (`react-native bundle --dev false`) | ✅ generado; solo warnings preexistentes de `@noble/hashes` y `event-target-shim` |
| `git diff --check` | ✅ limpio |

**Nota sobre "Build Android":** se ejecutó el empaquetado del bundle JS de release, no `gradlew assembleDebug` (compilación nativa completa). El bundle cubre la regresión de este cambio, que es 100% JS/TS; una APK completa no se compiló en este entorno.

---

## 8. Riesgos remanentes

1. **Exposición de unidades sin autenticar.** `POST /driver/activation/validate` es público; ahora devuelve número económico, placa y ruta de las unidades libres de esa organización. Requiere poseer una key válida, no usada y no vencida, y solo expone la organización de esa key. Aun así, es información que antes no salía por un endpoint anónimo — vale la pena confirmarlo con el dueño del producto.
2. **Unidades ocupadas ocultas por decisión de diseño.** El sistema permite reasignar una unidad (`syncDriverVehicleAssignment` desplaza al conductor anterior). En el auto-registro se optó por **no** ofrecer esa posibilidad: solo se listan unidades libres. Es una restricción, no una regla de negocio nueva, pero cambia lo que un conductor podría hacer respecto del Portal.
3. **Fallback de unidad placeholder.** Sin unidades disponibles, el backend sigue creando `CB-XXXXX` / `PEND-XXXXX` como antes. Se conservó a propósito para no romper el flujo de activación, pero convive con el modelo nuevo donde el Portal crea las unidades.
4. **Validación al perder foco.** Si el conductor pega la key y toca directamente "Activar cuenta" sin salir del campo, la validación corre en el submit; el selector no alcanza a mostrarse y, con varias unidades libres, verá "Selecciona la unidad que te fue asignada." y deberá elegir. Es un paso extra en ese camino concreto.
5. **Responsive sin evidencia visual** (ver punto 6).
6. `mongo-store.getLiveLocations()` no fue ejercitado en esta verificación (las pruebas usan el store embebido).

---

## 9. Dictamen final

**CERTIFICADO CON OBSERVACIONES.**

Se cumplen los criterios de certificación: el selector Cliente / Soy conductor desaparece por completo, el registro es exclusivamente de conductores, los administradores siguen entrando solo por Iniciar sesión, el conductor selecciona su unidad durante el registro y esa unidad queda asociada mediante el flujo de asignación existente. No se modificaron autenticación, RBAC ni permisos, y las pruebas de activación y aislamiento de tenant siguen en verde.

Las observaciones que impiden un "certificado limpio" son: la falta de evidencia visual responsive (punto 6) y el riesgo 1, que es una decisión de producto y no un defecto de implementación.
