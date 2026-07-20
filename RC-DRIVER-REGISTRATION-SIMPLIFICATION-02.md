# RC-DRIVER-REGISTRATION-SIMPLIFICATION-02 — Cierre de riesgos del selector de unidades

**Fecha:** 2026-07-19
**Continuación de:** `RC-DRIVER-REGISTRATION-SIMPLIFICATION-01.md` (certificado con observaciones)
**Alcance:** cerrar los 3 riesgos anotados. No se reabre el diseño del selector ni el flujo ya certificado.

---

## Estado de partida verificado

Antes de editar se confirmó que los tres archivos del ticket anterior seguían tal como los dejó RC-01 (cambios sin commitear sobre `main`, `7e68757`).

Observación no relacionada: el árbol de trabajo también tiene `mobile/package.json`, `mobile/package-lock.json` y `mobile/android/app/src/main/AndroidManifest.xml` modificados (alta de `react-native-webrtc` + permisos). Son del trabajo de WebRTC en curso, no de este ticket. **No se tocaron.**

---

## Riesgo 1 — Endpoint público `/driver/activation/validate` expone datos de flota

### 1.1 Rate limiting

**Verificado primero.** Ya existían dos capas:

| Capa | Dónde | Valor |
|---|---|---|
| Límite global de `/api` | `backend/src/app.js:181` (`express-rate-limit`) | 200 req / 15 min por IP |
| Middleware por ruta | `backend/src/middlewares/enterprise-rate-limit.js` | usado en auth (20/min), documents, locations |

El límite global **no estaba aplicado de forma específica** a las rutas anónimas de activación. Además, la barrera real contra enumeración es la entropía de la key: `generateSecureKeyValue()` (`activation-keys.js:214`) usa `randomBytes(3)` × 3 = **72 bits**, lo que hace inviable adivinar una key aunque el límite fuera generoso.

Aun así se agregó un limitador específico, más estrecho que el global, siguiendo el precedente de `auth`:

```js
// backend/src/modules/activation-keys/routes.js
const driverActivationLimiter = enterpriseRateLimit({
  scope: "driver-activation",
  max: 10,
  windowMs: 60 * 1000,
  message: "Demasiados intentos de activación. Intenta de nuevo en un minuto."
});
```

Aplicado a `/validate` y a `/register`. **No se duplicó** el límite global: este es un scope aparte, por minuto, para la superficie anónima.

Evidencia de que **dispara de verdad** (no solo que el middleware está montado):

```
[info] 13 intentos consecutivos -> 404,404,404,404,404,404,404,404,404,429,429,429,429
[ok] rate limit activo: 4 de 13 intentos bloqueados con 429
```

### 1.2 Ciclo de vida de la key

Comportamiento actual confirmado, sin necesidad de ajuste:

- **Expiración finita:** `DEFAULT_KEY_TTL_DAYS = 14` (`activation-keys.js:5`), aplicada en `getExpiration()`. Evidencia: `[ok] key emitida con expiración en ~14 días (2026-08-02T05:56:43.461Z)`.
- **Vencimiento efectivo:** `getEffectiveKeyStatus()` degrada a `expired` por fecha y `assertActivationKeyCanBeUsed()` la rechaza. Cubierto por `test/activation-keys.test.js` (key vencida → 409).
- **Un solo uso:** `markActivationKeyUsed()` hace update condicional (`status: "available"` en el filtro) y la key queda `used`. Reintentar da 409 "Esta key ya fue usada".

No hay ventana indefinida: una key filtrada muere en ≤14 días o al primer uso. **Sin cambios.**

### 1.3 Campos mínimos

Se redujo la respuesta anónima a lo estrictamente necesario para reconocer la unidad. Se eliminaron `routeName` y `status`:

```
[info] campos por unidad: code, id, plate
[ok] la respuesta anónima ya no incluye ruta ni estado
```

`status` era siempre `"available"` (solo se listan libres), y la ruta es información operativa que no ayuda a identificar la unidad. `mobile/src/types/app.ts` y el render del selector se ajustaron en consecuencia.

---

## Riesgo 2 — Condición de carrera entre `validate` y `register`

### La carrera era real y se reprodujo

Primer intento vía HTTP con dos registros simultáneos: **no** la reprodujo (1 ganador). Ese resultado era engañoso — el store embebido es síncrono, así que el primer request atraviesa toda su cadena de `await` (microtasks) antes de que el segundo empiece. **Eso no prueba seguridad en Mongo**, donde cada llamada es I/O real.

Envolviendo el store con latencia (5 ms por método, como una BD remota), la carrera apareció de inmediato contra el código de RC-01:

```
[info] A -> 201 OK
[info] B -> 201 OK
[info] registros exitosos: 2
[info] conductores que creen tener la unidad: 1 (Conductor B)
FALLO: se esperaba 1 registro exitoso, hubo 2
```

Los dos registros tuvieron éxito, ambos consumieron su key, y **el Conductor A fue desplazado en silencio**: quedó registrado, sin unidad y sin ningún error. Ese era exactamente el escenario anotado.

Causa: `resolveSelectedUnit()` leía disponibilidad y la escritura ocurría después, dentro de `syncDriverVehicleAssignment()`, que asigna incondicionalmente y expulsa al conductor anterior.

### Corrección: check-and-assign atómico

Se añadió a **ambos** stores, siguiendo el patrón que ya usaba `updateActivationKey`/`markActivationKeyUsed` (update condicional):

| Store | Método | Mecanismo |
|---|---|---|
| `data/store.js` | `claimVehicleForDriver` / `releaseVehicleFromDriver` | Comprobación y mutación **síncronas**, sin `await` intermedio → atómicas bajo el hilo único de Node |
| `data/mongo-store.js` | idem | `findOneAndUpdate` con `$or: [{driverId: null}, {driverId: {$exists:false}}, {driverId}]` → la condición viaja en el filtro; devuelve `null` si perdió la carrera |

En el servicio, `resolveSelectedUnit` fue sustituido por `claimSelectedUnit`, que reclama la unidad **antes** de consumir la key, y el resto del registro quedó envuelto en `try/catch` que **libera la unidad** si algo falla después (para no dejarla bloqueada por un conductor que nunca llegó a existir).

Orden deliberado: reclamar unidad → consumir key. Así el perdedor conserva su key intacta.

### Resultado tras la corrección

```
[info] A -> 201 OK
[info] B -> 409 Esta unidad ya no está disponible, elige otra.
[info] registros exitosos: 1
[info] conductores que creen tener la unidad: 1 (Conductor A)
[ok] key del perdedor sigue disponible (status=available)
[ok] el perdedor reintentó con éxito y tomó la unidad C-2
```

El perdedor recibe 409 con mensaje accionable, no truena, no desplaza a nadie, y puede reintentar con otra unidad.

### Prueba permanente en el repo

`backend/test/driver-unit-assignment.test.js`, registrada en la cadena de `npm test` del backend.

**Se comprobó que es una prueba de regresión real**, no decorativa: al revertir temporalmente el claim atómico a la comprobación no-atómica, la prueba falla con `AssertionError: solo un conductor debe obtener la unidad — 2 !== 1`. Restaurado el código, pasa. Se verificó por grep que no quedó código temporal en el árbol.

---

## Riesgo 3 — Consumidores huérfanos de `role: 'cliente'`

### Qué se buscó y dónde

| Búsqueda | Alcance | Resultado |
|---|---|---|
| `role: 'cliente'` / `"cliente"` / `'cliente'` | todo el repo | **0 coincidencias** |
| `cliente` (case-insensitive) | `ventas/` | 4 archivos: 3 son documentación (`RC-VENTAS-07.md`, `RC-02_EXPERIENCIA_COMERCIAL.md`, `QA_CHECKLIST.md`) y 1 es `portal-incidents-screen.tsx:33`, un regex de iconos de incidentes (`/cliente\|queja\|reclamo/`) sin relación con registro |
| `DriverActivation*` / `activation/validate` | `ventas/`, `shared/` | **0 coincidencias** — `ventas` no consume este endpoint ni duplica estos tipos |
| `accountType: 'operations'` | `backend/`, `ventas/`, `mobile/` | Solo seeds, tests y el propio servicio de activación |

### Conclusión con evidencia

**No existe consumidor huérfano.** El rol `'cliente'` nunca existió en el modelo de datos: el enum real es `accountType: ["operations", "company_owner"]` (`models.js`) y `normalizeRole()` (`store.js:448`) hace default a `"driver"`. La etiqueta "Cliente" era una ficción de UI sobre una cuenta `operations` genérica.

Dato que refuerza que quitarla fue correcto: esa rama llamaba a `/auth/register` **sin rol**, así que el backend creaba un usuario con `role: "driver"` pero **sin organización, sin key y sin unidad** — una cuenta que caía en `canAccessMobile === false` → `/plan-blocked`. Producía cuentas inservibles.

El registro de `ventas` es independiente y no se vio afectado: `ventas/screens/sales-auth-screen.tsx:190` llama a su propio `/auth/register` con `accountType: 'company_owner'`, vía `ventas/src/lib/api.ts:231`. Sigue verde en la suite del backend.

### Dos hallazgos que reporto aparte (NO corregidos en este ticket)

Ambos son decisiones sobre otros consumidores, no bugs mecánicos de este cambio:

1. **`register` quedó sin llamadores en `mobile`.** La acción del store `mobile/src/store/root-store.ts:2054` (`register`, tipada en `:225`) era invocada únicamente por la rama "Cliente" de `customer-auth-screen.tsx`. Tras RC-01 no la llama ninguna pantalla móvil — quedó código muerto junto con `registerRequest` (`mobile/src/api/client.ts:456`). No se eliminó: es superficie pública del store y su baja es una decisión de producto.

2. **Colisión de nombre `availableUnits`.** En `ventas/src/types/app.ts:406` y `ventas/features/commercial/types.ts:148`, `availableUnits` es un **número** (cupos de suscripción). En el payload de activación que introdujo RC-01 es un **arreglo de vehículos**. Son endpoints y tipos distintos, sin fuente compartida, así que hoy no hay conflicto real — pero el mismo nombre con dos significados invita a confusión. Renombrarlo implicaría tocar el diseño de RC-01, fuera del alcance de este ticket.

---

## Archivos modificados en este ticket

| Archivo | Cambio |
|---|---|
| `backend/src/services/activation-keys.js` | `claimSelectedUnit` atómico + rollback; campos mínimos en `listAvailableActivationUnits`; mensaje del perdedor |
| `backend/src/modules/activation-keys/routes.js` | `driverActivationLimiter` en `/validate` y `/register` |
| `backend/src/data/store.js` | `claimVehicleForDriver`, `releaseVehicleFromDriver` + exports |
| `backend/src/data/mongo-store.js` | idem con `findOneAndUpdate` condicional + exports |
| `backend/test/driver-unit-assignment.test.js` | **nuevo** — prueba de concurrencia |
| `backend/package.json` | registra la prueba en `npm test` |
| `mobile/src/types/app.ts` | `DriverActivationUnit` reducido a `id`/`code`/`plate` |
| `mobile/src/screens/customer-auth-screen.tsx` | el selector ya no muestra ruta |

No se tocó chat, `checklist-screen.tsx` ni el layout de pastillas.

---

## Validaciones

| Validación | Resultado |
|---|---|
| `npm test` backend (suite completa) | ✅ exit 0 — **60** suites `ok` (59 previas + la nueva) |
| `test/driver-unit-assignment.test.js` | ✅ pasa; ✅ **falla** al revertir el fix (regresión real) |
| Verificación e2e selector de unidad (RC-01) | ✅ sigue pasando |
| Verificación de carrera con latencia inyectada | ✅ 1 ganador, key del perdedor intacta |
| Verificación de rate limit / TTL / campos mínimos | ✅ 429 tras 9 intentos; TTL 14 días; 3 campos |
| `npx tsc --noEmit` (mobile) | ✅ sin errores |
| `npx eslint` archivos modificados (mobile) | ✅ exit 0 |
| `npm test` mobile (Jest) | ✅ 23 suites / 116 tests |
| Bundle Android (`--dev false`) | ✅ exit 0 |
| `git diff --check` | ✅ exit 0 |

Nota metodológica: `npm test` del backend devuelve *exit 255* si se ejecuta con `2>&1` desde PowerShell 5.1 — es un artefacto conocido de `NativeCommandError`, no un fallo. Ejecutado desde bash devuelve **exit 0**. Se verificó por ambas vías para no reportar un falso verde ni un falso rojo.

---

## Salvedades que quedan

1. **La rama Mongo del claim atómico no se ejercitó empíricamente.** No hay MongoDB en este entorno; toda la verificación corrió contra el store embebido. `findOneAndUpdate` con la condición en el filtro es el patrón estándar y replica el de `markActivationKeyUsed` (ya en producción), pero **no lo ejecuté**. Es la salvedad más importante de este ticket: la carrera que se corrigió es precisamente la que más se manifiesta en Mongo. Recomiendo correr la prueba de concurrencia contra un Mongo real antes de desplegar.
2. **Responsive sigue sin evidencia visual** (heredado de RC-01). La app no tiene target web y no se levantó emulador; la revisión fue de estilos.
3. **`claimVehicleForDriver` no se añadió a `FLEET_METHODS`** (`data/repositories/fleet-repository.js`). No hace falta: este flujo usa `app.locals.store` crudo (`app.js:58`) y `StoreDomainRepository` solo expone métodos existentes, así que no rompe nada. Se deja fuera para no ampliar el alcance a una fachada que este flujo no usa.
4. **El desplazamiento por reasignación sigue existiendo fuera de este flujo.** `syncDriverVehicleAssignment` mantiene su comportamiento de expulsar al conductor anterior cuando el Portal reasigna una unidad. Es el comportamiento vigente y deliberadamente no se tocó; el auto-registro ya no puede provocarlo.
5. Riesgo 1 queda mitigado, no eliminado: quien tenga una key válida sigue viendo las unidades libres de su organización. Es inherente a mostrar un selector antes de autenticar.

---

## Dictamen final

**Riesgo 1 — CERRADO** (con la salvedad 5, que es inherente al diseño aprobado).
**Riesgo 2 — CERRADO en la ruta verificada; pendiente de confirmar contra Mongo** (salvedad 1). Era un defecto real y confirmado, no teórico: dos conductores podían quedarse con la misma unidad y uno perdía la suya en silencio.
**Riesgo 3 — CERRADO.** No hay consumidor huérfano; se reportan aparte dos hallazgos que requieren decisión de producto.

**Veredicto: CERTIFICADO CON UNA SALVEDAD.**

No lo declaro limpio por la salvedad 1: el arreglo de concurrencia está verificado contra el store embebido y su implementación en Mongo quedó sin ejecutar. Todo lo demás — rate limit, ciclo de vida de la key, minimización de datos, ausencia de consumidores huérfanos y la prueba de regresión — está verificado con evidencia ejecutada, no inferida.
