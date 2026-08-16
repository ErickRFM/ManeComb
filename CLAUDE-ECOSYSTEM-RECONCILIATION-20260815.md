# CLAUDE-ECOSYSTEM-RECONCILIATION-20260815

## Misión

Auditar, reconciliar y validar los trabajos abiertos de ManeComb sin romper autoridades existentes, sin duplicar servicios/stores/sockets, sin fusionar diagnósticos como si fueran features y sin saltarse gates físicos reales.

Trabaja **solo** sobre la rama:

```text
audit/claude-reconcile-20260815
```

Baseline al crearla:

```text
main = d8e0d9f56cd8a996b82df218ca7f5a47ef9ca701
```

Antes de escribir código haz `git fetch --all --prune`, confirma que `origin/main` no haya avanzado y, si avanzó, actualiza esta rama de auditoría de forma explícita y documentada antes de integrar nada.

## Principio rector

No se trata de "mergear todo". Se trata de construir un grafo de dependencias y autoridad y luego integrar únicamente lo que siga siendo correcto.

Para cada PR abierto debes clasificar:

1. objetivo real;
2. autoridad que modifica;
3. archivos compartidos con otros trabajos;
4. si es runtime, diagnóstico, documentación o sync branch;
5. estado CI actual, no el texto viejo del PR;
6. gate físico real;
7. si es integrable ahora, integrable solo en rama de auditoría, o bloqueado;
8. qué debe conservarse/eliminarse/reconciliarse.

## PRs que debes revisar como mínimo

### PR #196 — GPS / historial / jornada libre / aprendizaje V2

```text
head: fix/gps-route-history-learning-20260814
sha: 7ac8b94200b1f099a340ed1f7396e079e838f12c
base: main
```

Estado automatizado observado: CI, System Audit, Dependency Audit y Portal certification verdes.

Gate físico: `ACCEPTED_PENDING`.

Autoridades que debe conservar:

- `RouteSessionPosition` como única historia canónica de posiciones;
- frescura GPS semántica única;
- cola offline y reconciliación de jornada;
- `recording:*` como identidad técnica, no como ruta visible;
- aprendizaje V2 para jornadas libres/históricas.

No declares producción certificada sin prueba física de background/pantalla apagada/red intermitente/replay.

### PR #200 — Route Learning V3

```text
head: agent/route-learning-v3-20260815
sha: 2c8e5beb7f343cf1b9bfdd2a942b1cff50a7e736
base: fix/gps-route-history-learning-20260814 (#196)
```

Está apilado sobre #196: **no debe evaluarse como PR independiente de su base**.

Estado automatizado observado: Route Learning V3 gate, CI general, System Audit, Dependency Audit y Portal production certification verdes.

Arquitectura que debes verificar y preservar si es correcta:

- corredor tolerante con histéresis;
- hard deviation inmediata solo para separación extrema;
- `routeId + routeRevision + geometryHash` congelados al inicio de jornada oficial;
- aprendizaje exclusivamente del segmento entre salida y reincorporación;
- V2 y V3 separados semánticamente;
- V3 nunca crea una Route duplicada;
- apply in-place sobre la misma `Route`;
- `Route.revision` como token monotónico de concurrencia;
- `store.updateRouteIfRevision(...)` como frontera del CAS;
- Mongo CAS dentro de `FleetRepository`, no dentro del servicio de aprendizaje;
- refresh de `Vehicle.assignedRoute` mediante escritor canónico ya existente;
- flags V3 apagados por defecto;
- `portal-routes-screen.tsx` y `portal-layout.tsx` conservan sus autoridades; V3 está empotrado en `RouteCatalogPanel`.

Busca específicamente carreras de estado, stale candidates, doble incremento de revision, pérdida de tenant scope, mezcla V2/V3 y writers duplicados.

Gate físico: sigue pendiente la matriz GPS real multi-día/multi-unidad y review/apply controlado.

### PR #197 — Ventas / Portal comercial

```text
head: agent/ventas-product-maturity-20260815
sha: 2ad90902c3c9b9c439e5d31d1781ef5b36ddc53a
base: main
```

CI/Dependency/Portal/System tienen ejecuciones verdes en el HEAD, pero GitHub actualmente lo reporta **no mergeable**. No fuerces el merge.

Reconcílialo contra el main actual y contra #196/#200. El propio PR intentó evitar tocar archivos concurrentes de GPS/Rutas; valida que esa separación siga siendo cierta después de la evolución posterior.

Preserva:

- autoridad de capacidad real de unidades;
- downgrade protegido también en backend;
- funnel first-party sin PII;
- mejoras UX de Ventas/Portal sin rediseño total;
- contratos comerciales únicos;
- legales sin inventar razón social/domicilio.

Si el conflicto es solo lockfile/security o drift de main, resuélvelo de forma mínima. Si es semántico, documenta y prueba la reconciliación.

### PR #198 — autoridad operacional / presence / telemetría / ResourceState

```text
head: codex/operational-authority-audit-20260815
sha: 31bf4366e73d0bb204cdc22f25dbafd9e5b7f9e3
base: main
```

Estado automatizado observado actualmente: CI, Dependency Audit, System Audit y Portal production certification verdes. El texto del PR que menciona una vulnerabilidad `nanoid` pendiente puede estar obsoleto: verifica contra el estado real y el main actual antes de tomar decisiones.

Audita con especial cuidado overlaps con #196 y con comunicación:

- velocidad operacional;
- plausibilidad/calidad GPS;
- `presence:join` vs heartbeat;
- `x-trace-id`;
- telemetría Android captured/sent/confirmed/RTT;
- `ResourceState` por dominio;
- latest-wins y side effects obsoletos;
- full snapshot vs incremental event.

No crees otra autoridad de presencia, tracking, socket o estado de carga.

Gate físico: `ACCEPTED_PENDING` para GPS/background/batería/presencia multidispositivo.

### PR #187 — Comunicación Web

```text
head: feat/portal-communication-20260812
sha: 530c3f5c0392eff5b4013ab0e4843a2d1ebc3619
base: main histórico
```

Es un trabajo grande de Chat/RTC/Portal. Está muy detrás del main actual y GitHub no lo marca mergeable.

No lo mezcles ciegamente. Antes verifica:

- socket único compartido;
- backend único;
- conversaciones existentes;
- E2EE fail-closed;
- signaling RTC existente;
- permisos `communication.chat.access` / `communication.rtc.access`;
- CSP / Permissions-Policy actuales;
- compatibilidad con #198 presence/heartbeat/resource state;
- compatibilidad con realtime recovery ya presente en main.

Gate físico: Portal↔Android real pendiente.

### PR #195 — sync de main hacia Comunicación Web

```text
base: feat/portal-communication-20260812
head: main
```

Este PR es **de sincronización inversa hacia la rama de Comunicación**, no una feature para mergear a `main`.

No lo trates como candidato de producción. Úsalo solo como evidencia de cómo se intentó reconciliar Comunicación con main.

### PR #193 — instrumentación DEV realtime

```text
head: diag/realtime-instrumentation-20260812
sha: 6cbcff20b3411942f8670d53a601148c310f0336
base: main histórico
```

Es diagnóstico, no fix funcional. No lo fusiones a producción automáticamente.

Valida si sus señales `MC_REALTIME_DIAG` siguen aportando valor con #198/#187/main actual. Si la hipótesis ya quedó resuelta por trabajo posterior, propón cerrar/archivar el PR en vez de arrastrar instrumentación innecesaria.

## Grafo inicial esperado

No lo asumas como verdad; confírmalo con diff real:

```text
main
 ├─ #196 GPS/history/V2
 │    └─ #200 Route Learning V3
 ├─ #197 Ventas/Portal comercial
 ├─ #198 operational authority/presence/telemetry
 ├─ #193 realtime diagnostics (diagnóstico)
 └─ #187 communication web
       └─ #195 sync main -> communication branch (no merge to main)
```

La integración final puede requerir otro orden por overlaps semánticos; decide con evidencia.

## Reglas de arquitectura obligatorias

1. Una sola ingesta GPS canónica.
2. Una sola historia de posiciones (`RouteSessionPosition`).
3. Una sola entidad `Route` oficial; no `RouteV2`, `RouteNew`, etc.
4. Una sola revisión monotónica de Route.
5. Un solo socket compartido por cliente cuando el diseño actual así lo establece.
6. No crear `Service2`, `ManagerNew`, `StoreV2`, timers paralelos o fallbacks silenciosos para evitar entender el código actual.
7. Backend es autoridad de seguridad/tenant/permisos; frontend no sustituye esos gates.
8. Los flags OFF deben conservar comportamiento legacy sin efectos laterales.
9. Diagnóstico no equivale a comportamiento productivo.
10. Gate físico pendiente no se convierte en PASS por tener CI verde.

## Proceso de trabajo obligatorio

### Fase 0 — inventario

- fetch de todos los refs;
- `git status` limpio;
- confirmar `origin/main` actual;
- listar PRs abiertos y sus HEAD actuales;
- consultar checks actuales;
- construir matriz de changed files y overlaps;
- revisar documentos RC existentes.

No escribir código antes de terminar esta fase.

### Fase 1 — matriz de autoridad

Para GPS, Tracking, Route, Route Learning, Ventas, Portal, Presence, Socket, Chat, RTC, ResourceState y persistencia, identifica:

```text
autoridad actual en main
autoridad propuesta por PR
consumidores
writers
read models / projections
feature flags
riesgo de duplicidad
```

### Fase 2 — auditoría lógica

Busca al menos:

- carreras de estado;
- stale writes;
- revisiones dobles;
- tenant leakage;
- fallbacks silenciosos;
- reglas duplicadas frontend/backend;
- listeners/socket duplicados;
- retry loops paralelos;
- estados `loading/error/stale` contradictorios;
- datos históricos reinterpretados por código nuevo;
- contratos HTTP incompatibles;
- flags que no sean realmente side-effect-free;
- UI que pueda activar accidentalmente el flujo legacy equivocado;
- side effects no idempotentes.

### Fase 3 — integración en esta rama

Integra solamente lo aprobado en la rama `audit/claude-reconcile-20260815`.

No reescribas las ramas originales salvo necesidad explícita. Conserva los PRs originales como evidencia/revisión.

Haz commits pequeños por reconciliación semántica. No un mega commit.

Si #196 y #200 se incorporan para una prueba combinada, conserva su dependencia y deja sus flags apagados.

Si un PR está bloqueado por gate físico, puede integrarse en la rama de auditoría para validar compatibilidad, pero no marques eso como autorización de producción.

### Fase 4 — pruebas por corte

Después de cada integración relevante ejecuta el gate específico del módulo y al final la matriz completa disponible:

Backend:
```bash
cd backend
npm ci
npm test
```

Communication:
```bash
cd communication-service
npm ci
npm test
```

Mobile:
```bash
cd mobile
npm ci
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

Ventas/Portal:
```bash
cd ventas
npm ci
npx tsc --noEmit
VITE_API_URL=https://api.example.com npm run build
```

Además ejecuta/verifica los workflows/repositorio existentes de System Audit, Dependency Audit, Portal production certification, Route Learning V3 y Android/APK cuando apliquen.

No elimines pruebas para conseguir verde. Si un contrato debe cambiar por diseño nuevo, explica por qué y añade regresión equivalente.

### Fase 5 — cierre Git

Al finalizar entrega:

1. SHA de `main` utilizado;
2. SHA final de la rama de auditoría;
3. PRs integrados totalmente;
4. PRs integrados parcialmente y por qué;
5. PRs que deben cerrarse/sustituirse;
6. PRs bloqueados por prueba física;
7. conflictos resueltos y autoridad elegida;
8. archivos/servicios duplicados eliminados o deliberadamente conservados;
9. matriz de tests con PASS/FAIL;
10. gates físicos todavía pendientes;
11. orden exacto recomendado de merge a `main`;
12. lista de flags/deployment vars que deben seguir OFF;
13. riesgos residuales reales.

Si el resultado es coherente, abre **un Draft PR** desde `audit/claude-reconcile-20260815` hacia `main` para revisión final. No lo auto-mergees mientras existan gates físicos pendientes que afecten runtime.

## Criterio de éxito

El resultado correcto no es "todos los PRs mergeados". El resultado correcto es:

- una arquitectura coherente;
- una sola autoridad por concepto;
- ninguna regresión demostrable;
- CI verde;
- dependencias reconciliadas;
- branches diagnósticas clasificadas correctamente;
- cambios productivos listos y aislados;
- gates físicos honestamente pendientes donde correspondan;
- un camino de merge claro y seguro.
