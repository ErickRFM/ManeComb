# RC-OPERATIONAL-CONTRACT-INTEGRATION-01

Corrección de integración del contrato compartido `@shared/operational-contract`.

---

## 1. Causa raíz

**El alias `@shared` sí estaba declarado en `metro.config.js`, pero era inerte.**

La hipótesis del ticket (alias ausente en Metro/Babel) queda **refutada**. El alias
estaba presente, vía `resolver.extraNodeModules`:

```js
extraNodeModules: {
  '@': projectRoot,
  '@shared': sharedRoot,   // nunca coincidía
},
```

Metro **no indexa `extraNodeModules` por prefijo, sino por nombre de paquete**.
Evidencia en el resolver instalado, `mobile/node_modules/metro-resolver/src/resolve.js:160`:

```js
if (extraNodeModules && extraNodeModules[parsedSpecifier.packageName]) {
```

Y en `parseBareSpecifier` (`resolve.js:199-243`), para un especificador que empieza
con `@` y tiene **un solo** `/`, el `packageName` es la cadena completa:

```js
if (normalized.startsWith("@") && firstSepIdx !== -1) {
  const secondSepIdx = normalized.indexOf("/", firstSepIdx + 1);
  if (secondSepIdx === -1) {
    return { ..., packageName: normalized, posixSubpath: "." };   // <-- este caso
  }
```

Es decir: `@shared/operational-contract` se interpreta como el paquete con scope
`@shared/operational-contract` completo, **no** como `@shared` + subpath. La clave
`'@shared'` de `extraNodeModules` no coincide con nada y el alias queda muerto.
De ahí `Unable to resolve module '@shared/operational-contract'`.

El mismo defecto afecta a la clave `'@'` (para `@/foo/bar`, `packageName` es `@/foo`),
que también era inerte — pero eso pasaba desapercibido porque `@` se resuelve **antes
de Metro**, en Babel (`babel.config.js`, `module-resolver`, `alias: { '@': './' }`).
`@shared` no tenía entrada en Babel, así que caía a Metro y fallaba.

### Por qué debug pasaba y release no

No es una diferencia entre resolución dev y release: **`assembleDebug` nunca invoca a Metro.**

```
$ ./gradlew assembleDebug --dry-run | grep -c createBundleDebugJsAndAssets
0
```

El grafo de tareas de debug no contiene ninguna tarea de bundling JS (en debug el JS
se sirve desde el Metro dev server en runtime). Solo `:app:createBundleReleaseJsAndAssets`
ejecuta el bundler. Por eso `tsc --noEmit` (que usa `tsconfig.paths`, correcto) y
`assembleDebug` (que no bundlea) pasaban sin tocar jamás el código de resolución roto.

---

## 2. Configuración encontrada — quién tenía el alias y quién no

| Superficie | Archivo | Alias `@shared` | Semántica | ¿Funcionaba? |
|---|---|---|---|---|
| TypeScript (mobile) | `mobile/tsconfig.json:15` | `"@shared/*": ["../shared/*"]` | prefijo | ✅ |
| TypeScript (portal) | `ventas/tsconfig.json:21` | `"@shared/*": ["../shared/*"]` | prefijo | ✅ |
| Vite (portal) | `ventas/vite.config.js:40` | `find: '@shared'` | prefijo | ✅ |
| Jest (mobile) | `mobile/jest.config.js:7` | `'^@shared/(.*)$'` | prefijo | ✅ |
| **Metro (mobile)** | `mobile/metro.config.js:23` | `extraNodeModules['@shared']` | **nombre de paquete** | ❌ **inerte** |
| Babel (mobile) | `mobile/babel.config.js` | — (solo `@`) | prefijo | n/a |

**Metro era el único outlier**: la única superficie que usaba un mecanismo indexado por
nombre de paquete, mientras las otras cuatro usan alias por prefijo. Esa es la causa raíz.

`watchFolders: [sharedRoot]` ya estaba correcto — no era el problema.

---

## 3. Arquitectura (FASE 3)

**Caso (A): carpeta `shared/` en la raíz del repo.** Verificado en disco:

```
C:\proyectos\combis-app\shared\operational-contract\
  index.ts   (export * from './types'; export * from './selectors';)
  selectors.ts
  types.ts
```

No hay `packages/`, no hay `libs/`, **no hay `package.json` en la raíz** y por tanto no
hay npm workspaces. `mobile/` y `ventas/` son proyectos npm independientes.

**Decisión: no migrar a workspaces.** Sería un cambio de instalación de dependencias
(el ticket pide reportarlo antes de aplicarlo) y alargaría rutas
(`node_modules/@shared/operational-contract/...`) contra el límite de 250 caracteres de
`CMAKE_OBJECT_PATH_MAX` ya advertido en el log. La carpeta `shared/` en la raíz es la
ruta **más corta posible** y ya funciona en 4 de 5 superficies. El defecto era de
configuración de un solo resolver, no de arquitectura.

---

## 4. Archivos modificados

**Uno solo: `mobile/metro.config.js`.**

Se sustituye `extraNodeModules` (indexado por paquete, inerte) por `resolveRequest`
(alias por prefijo real), alineando Metro con la semántica que ya usan tsconfig, Vite y Jest:

```js
resolveRequest: (context, moduleName, platform) => {
  if (moduleName === '@shared' || moduleName.startsWith('@shared/')) {
    const subpath = moduleName.slice('@shared'.length);
    return context.resolveRequest(context, path.join(sharedRoot, subpath), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
},
```

Por qué esta solución y no un parche:

- Es **prefijo**, igual que las otras cuatro superficies → una sola semántica en todo el repo.
- **Escala**: cualquier futuro `@shared/loquesea` resuelve sin tocar configuración.
- Se elimina la entrada `'@'` muerta, que aparentaba funcionar y era exactamente la trampa
  que produjo este bug.
- No se toca Babel ni Jest → no se altera el pipeline de transformación (menor riesgo de
  regresión sobre el trabajo reciente protegido por el candado).
- Sin rutas relativas, sin duplicación, sin copias, sin `any`, sin imports comentados.

---

## 5. Consumidores del contrato (FASE 1, 2, 8)

Once archivos, todos en `mobile/`, todos con el mismo alias:

| Archivo | Import |
|---|---|
| `mobile/src/store/root-store.ts:8` | `OperationalUnitSnapshot` |
| `mobile/src/api/client.ts:11` | `OperationalUnitSnapshot` |
| `mobile/src/screens/checklist-screen.tsx:31-32` | `OperationalUnitSnapshot`, `driverLabel`, `routeLabel` |
| `mobile/src/screens/checklist-screen.test.ts:4` | `OperationalUnitSnapshot` |
| `mobile/src/screens/incidents-screen.tsx:23` | `OperationalUnitSnapshot` |
| `mobile/src/screens/map-screen.native.tsx:35` | `OperationalUnitSnapshot` |
| `mobile/src/screens/map/utils/tracking.ts:1-2` | `OperationalUnitSnapshot`, `sortByCriticality` |
| `mobile/src/screens/map/hooks/use-tracking-data.ts:2` | `OperationalUnitSnapshot` |
| `mobile/src/screens/map/components/BottomTrackingPanel.tsx:16-17` | `OperationalUnitSnapshot`, `formatEta`, `formatFreshness`, `formatSpeed`, `routeLabel`, `stateLabel` |
| `mobile/src/screens/map/components/MapCanvas.tsx:5-6` | `OperationalUnitSnapshot`, `freshnessOpacity`, `stateColor` |

No existe ninguna definición duplicada de `OperationalUnitSnapshot`, `driverLabel` ni
`routeLabel` fuera de `shared/operational-contract/`. Una sola fuente de verdad. ✅

### Hallazgo — el Portal NO consume el contrato

**El checklist de la FASE 8 asume un estado que no se cumple.** `ventas/` tiene el alias
correctamente cableado (tsconfig + Vite, ambos verificados abajo) pero **cero imports** de
`@shared/operational-contract`:

```
$ grep -rn "operational-contract" ventas --include=*.ts --include=*.tsx
(sin resultados)
```

Las apariciones de `routeLabel` en `portal-units-screen.tsx:283` y
`portal-dashboard-screen.tsx:748` son **variables locales homónimas**, no el helper del
contrato; el Portal calcula sus etiquetas por su cuenta.

No se migró el Portal en este ticket: es un refactor de producto sustancial, fuera del
alcance declarado (arreglar la integración del build). **Se reporta como pendiente**, no
se resolvió en silencio. El alias ya está listo para cuando se haga.

`backend/src/domain/operational-unit-snapshot.js` es el **productor** en JS del snapshot;
no importa el contrato TS y no duplica los helpers de etiqueta (`driverLabel`/`routeLabel`
no aparecen en `backend/src`). Convivencia correcta productor/consumidor.

### Otros alias rotos

Ninguno. `@shared` era el único alias que cruzaba el límite de `projectRoot` hacia Metro.
El único warning de resolución que emite Metro es ajeno a este problema:

```
WARN Attempted to import "@noble/hashes/crypto.js" which is not listed in the "exports"...
Falling back to file-based resolution.
```

Es un warning de `exports` de una dependencia de terceros, resuelto por fallback. No
relacionado, no bloqueante.

---

## 6. Contrato — exports (FASE 7)

`shared/operational-contract/index.ts` reexporta `types.ts` + `selectors.ts`.

Tipos: `GpsFreshness`, `OperationalUnitStatus`, `OperationalState`, `DriverSource`,
`OperationalVisibility`, `OperationalGps`, `OperationalDriver`, `OperationalRoute`,
`OperationalSession`, `OperationalIncidents`, `OperationalUnitSnapshot`.

Selectores: `formatEta`, `formatFreshness`, `formatSpeed`, `stateLabel`, `stateColor`,
`freshnessOpacity`, `driverLabel`, `routeLabel`, `criticalityRank`, `sortByCriticality`,
`summarizeFleet`.

`driverLabel()` y `routeLabel()` presentes y correctos (`selectors.ts:86-92`).

**Exports huérfanos:** `summarizeFleet` no tiene consumidores (1 sola aparición: su propia
definición). `criticalityRank` solo se usa internamente desde `sortByCriticality`. No se
eliminan aquí — borrar API pública del contrato excede el alcance de un fix de build y
`summarizeFleet` es candidato natural del Portal cuando migre. Se deja anotado.

---

## 7. Evidencia de compilación

Toda la evidencia es de ejecución real, no inferida.

**Metro — el bundle que fallaba, ahora funciona:**
```
$ npx react-native bundle --platform android --dev false --entry-file index.js ...
LOG:Writing bundle output to: ...\test.bundle
LOG:Done writing bundle output
Copying 23 asset files / Done copying assets
```

**El contrato está realmente dentro del bundle** (no basta con "no falla"):
```
$ grep -c "Sin conductor asignado" test.bundle   -> 1
$ grep -c "Sin ruta asignada"      test.bundle   -> 2
```
Son los literales de `driverLabel()` y `routeLabel()`. El código del contrato se bundlea. ✅

**Android Release — criterio duro:**
```
$ ./gradlew assembleRelease
BUILD SUCCESSFUL in 1m 43s
789 actionable tasks: 50 executed, 739 up-to-date

app/build/outputs/apk/release/app-release.apk   158M
assets/index.android.bundle                     3351528 bytes
```

**La tarea exacta que fallaba, forzada a re-ejecutar** (`--dry-run` marca todo como SKIPPED,
así que no sirve como prueba; esto sí):
```
$ ./gradlew :app:createBundleReleaseJsAndAssets --rerun-tasks
> Task :app:createBundleReleaseJsAndAssets
LOG:Writing bundle output to: android\app\build\generated\assets\...\index.android.bundle
LOG:Writing sourcemap output to: ...\index.android.bundle.packager.map
BUILD SUCCESSFUL in 1m 32s
```

**Android Debug — no regresión (candado):**
```
$ ./gradlew assembleDebug
BUILD SUCCESSFUL in 20s
614 actionable tasks: 48 executed, 566 up-to-date
```

**TypeScript:**
```
$ cd mobile  && npx tsc --noEmit   -> exit 0, sin errores
$ cd ventas  && npx tsc --noEmit   -> exit 0, sin errores
```

**Lint:**
```
$ cd mobile && npm run lint   -> eslint . , sin hallazgos
```

**Tests (candado — integridad temporal, gpsFreshness, push, quick-reply, cache de planes):**
```
$ cd mobile && npx jest
Test Suites: 21 passed, 21 total
Tests:       106 passed, 106 total
```

**Portal — Vite (FASE 6):**
```
$ cd ventas && npm run build
✓ built in 9.47s
```
Como ningún archivo del Portal importa el contrato, el build no ejercita el alias. Se probó
el resolver de Vite directamente (script temporal, ya eliminado):
```
RESOLVED: C:/proyectos/combis-app/shared/operational-contract/index.ts
```
Vite y Metro resuelven **exactamente el mismo archivo**. Sin copia para el Portal. ✅

---

## 8. Riesgos remanentes

1. **Ruta larga (Windows) — no agravado.** La solución no mueve el contrato ni lo instala en
   `node_modules`; `shared/` sigue en la raíz, que es la ruta más corta disponible. El
   `assembleRelease` completo (parte nativa incluida, no solo el bundle JS) terminó bien, que
   es donde se manifestaría el problema. El aviso `has 180 characters ... maximum 250` sigue
   siendo un margen estrecho **preexistente**: cualquier futura migración a `packages/` o a
   workspaces debe reevaluarlo.

2. **El Portal no consume el contrato** (sección 5). Riesgo de divergencia: hoy calcula
   etiquetas por su cuenta mientras Mobile usa los helpers compartidos. Pendiente de migración.

3. **`summarizeFleet` sin consumidores** — API pública sin uso.

4. **Árbol de trabajo con cambios previos no commiteados.** El `git status` inicial de la
   sesión reportaba árbol limpio, pero hay 14 archivos modificados que **no son míos**
   (trabajo en curso de tracking/gpsFreshness: `shared/operational-contract/*`, backend,
   pantallas de mapa, `mobile/package.json`, más `tracking.test.ts` sin trackear). Mi único
   cambio es `mobile/metro.config.js`. Toda la evidencia de arriba se produjo contra ese
   árbol, no contra `HEAD` — es lo correcto para validar el estado actual, pero conviene
   saberlo: esos cambios ajenos entran en los mismos builds.

5. **`@noble/hashes` warning de `exports`** — preexistente, resuelto por fallback, ajeno.

---

## 9. Dictamen final

Causa raíz identificada con evidencia en el código fuente del resolver, no por conjetura:
el alias existía pero usaba el mecanismo equivocado (`extraNodeModules`, indexado por nombre
de paquete) para un especificador con scope. La hipótesis inicial del ticket queda refutada
y documentada.

La corrección es de una línea conceptual en un único archivo, alinea Metro con la semántica
de prefijo que ya usaban las otras cuatro superficies, y no introduce duplicación, rutas
relativas, copias ni `any`.

| Criterio de aceptación | Estado |
|---|---|
| `gradlew assembleRelease` termina bien | ✅ BUILD SUCCESSFUL, APK 158M con bundle de 3.35 MB |
| Metro resuelve el alias | ✅ bundle generado y contrato verificado dentro |
| Vite resuelve el alias | ✅ resuelve al mismo `index.ts` |
| TypeScript sin errores | ✅ mobile y ventas, exit 0 |
| Contrato no duplicado | ✅ definición única en `shared/operational-contract/` |
| Fuente única para `OperationalUnitSnapshot` y utilidades | ✅ |
| `assembleDebug` sigue funcionando | ✅ BUILD SUCCESSFUL + 106 tests en verde |
| Solución arquitectónica, no parche | ✅ alias por prefijo, escala a futuros `@shared/*` |

**Salvedad honesta:** la FASE 8 pedía confirmar que Portal y Dashboard consumieran el mismo
contrato. **No lo hacen** — nunca lo hicieron. El alias del Portal está correcto y verificado,
pero la migración de sus consumidores queda pendiente y se reporta en lugar de darse por hecha.
