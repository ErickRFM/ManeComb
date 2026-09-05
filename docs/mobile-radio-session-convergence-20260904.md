# Radio: convergencia de sesión y separación inferior

## Autoridad y alcance

- Base: `origin/main` = `b56e13e0eba0018ffe53f0f3145100666e2e5355`.
- Rama: `codex/radio-session-convergence`; integración por PR con gates verdes, autorizada por el propietario antes de probar físicamente el main consolidado.
- No se modificaron Release, assets, tag, manifest certificado ni AppConfig.
- `1.3.0 / build 22 / v1.3.0-build.22` queda como evidencia histórica del fallo físico. No sirve para certificar este fix.
- Próxima identidad mínima propuesta: `1.3.0 / build 23 / v1.3.0-build.23`, sólo tras merge, SHA final, pruebas y reproducción física aprobada. No se ha incrementado la versión ni se ha creado esa identidad.

## Causa demostrable y límite de la evidencia

La descripción física identifica qué UI presentó cada estado, pero no incluye una traza de ambos sockets ni del refresh de esa ejecución. Por ello no es posible afirmar si el disparador exacto del teléfono fue expiración de access token, revocación o caída de red. Sí se identificaron y reprodujeron automáticamente defectos de convergencia en el código de main:

1. **Global JS**: `ConnectionBanner` consume `socketStatus`/heartbeat/network de `root-store`. Un `connect_error` de auth inicia `refreshRealtimeAuth`. La transición terminal sólo cambiaba `socketStatus`: healthcheck, NetInfo, foreground y el transporte seguían pudiendo intentar reconectar. Podían sustituir `unauthorized` por `connecting/reconnecting` usando las mismas credenciales.
2. **Radio nativo**: `SocketIoRadioTransport` clasifica el rechazo de handshake como `UNAUTHORIZED`. `RadioSessionController` lo convertía inmediatamente en `RadioPhase.UNAUTHORIZED`, sin consultar si el refresh era recuperable y sin notificar una solicitud de renovación al root-store. Ese estado alimentaba «Sesión expirada / Sin sesión» y la notificación nativa.
3. `RadioLiveOverlay` **ya dependía de `token`**: no faltaba esa dependencia. Faltaba enlazar el rechazo nativo con la autoridad de refresh; además, `RadioEvent.Activate` del mismo canal preservaba la fase anterior al cambiar credenciales. Una publicación nativa vieja podía llegar durante la rotación.
4. HTTP y realtime disponían de entradas distintas para `/auth/refresh`. Ahora ambos entran por el `refreshAccessToken` single-flight existente, que publica a través de `applyRefreshedSession` una sola vez.
5. Los datos ya cargados permanecían en los stores; no prueban que la sesión o alguno de los transportes siguiera sano.

## Corrección

- Root-store mantiene el estado de recuperación compartido: `ready / recovering / unauthorized`. Todo productor global de reconexión lo respeta.
- Un rechazo de access token nativo aparca socket/audio en `RECONNECTING` con código no sensible `radio_auth_refresh_required`. No hay refresh ni nuevo transporte Radio en JS.
- El overlay entrega esa solicitud al root-store. Una sola renovación actualiza el token global; el overlay lo entrega al adaptador, bridge, servicio y controlador nativo.
- La revisión numérica `authRevision` no contiene credenciales: permite descartar snapshots de activaciones anteriores y evita que un efecto React atrasado rechace el token nuevo.
- La activación de credenciales nuevas reinicia el estado del mismo canal y sólo confirma LISTENING con ACK de join. No restaura un PTT perdido.
- La revocación/rechazo terminal invalida el epoch, retira listeners y timers globales, detiene el runtime GPS y ordena el bloqueo nativo. El nativo cancela su timer, desconecta y libera audio. Foreground, cambio de canal, llamada y callbacks tardíos no pueden reabrirlo.
- Un segundo rechazo del token renovado antes de la aceptación de ambos transportes termina la recuperación. El simple connect del socket JS ya no reinicia por sí solo el presupuesto de auth Android.
- Revisión de integración: tampoco lo reinicia el connect nativo durante JOINING. La regresión reprodujo dos refresh antes del ajuste y uno después; sólo LISTENING/RECEIVING/TRANSMITTING confirma aceptación del canal.
- Fallos de red, 429 y 5xx conservan recuperación, sin «Sesión expirada». Se respeta un cooldown de al menos 30 s y `Retry-After` si es mayor.
- Foreground vuelve a leer el snapshot real del servicio, incluyendo rechazos ocurridos mientras JS estaba suspendido.
- `forbidden` del canal no se interpreta como revocación de toda la cuenta: queda como error de permisos, sin renovar credenciales ni reintentar el permiso.
- Un estado terminal tiene prioridad sobre offline/pendientes; una reconexión transitoria activa puede seguir esperando Internet sin convertirse en sesión expirada.

## UI

Únicamente `radio-screen.styles.ts`: `pageIndicators.paddingBottom` pasa de 2 dp en teléfono / 0 en el resto a `AppTheme.spacing.sm` = **10 dp**. `pageIndicatorText` recibe `flexShrink: 1` y `minWidth: 0`.

Se conservan `flex: 1` y el máximo de ancho común de los tres pills, minHeight 44, roles tab/tablist, nombres, estado seleccionado, `goToPage`, ajuste tipográfico existente, consola/PTT/altavoz/último audio y la SafeArea existente. No se añadió un ScrollView ni otra SafeAreaView.

Los tests de estilos cubren configuraciones cortas/altas y fontScale 1/1.3/2 como contratos; **no son una medición visual Android**. Espaciado real, recortes, altura útil y scroll con navegación por gestos/botones quedan pendientes de dispositivo.

## Evidencia automatizada

| Escenario controlado | Evidencia |
| --- | --- |
| Token válido | Global conectado y Radio LISTENING; cero refresh y una activación |
| Access expirado + refresh válido | `connect_error → refreshAccessToken → applyRefreshedSession → token nuevo → RadioLiveOverlay → activate`; una renovación y nuevo token en ambos transportes |
| Rechazo sólo nativo | Radio solicita la misma recuperación aunque JS hubiera conectado |
| Refresh rechazado o ausente | Global UNAUTHORIZED y Radio UNAUTHORIZED; timers/callbacks/NetInfo/foreground no crean nuevas conexiones |
| Token renovado rechazado | Una renovación total; no ciclo reiniciado por connect JS |
| Pérdida temporal de Internet | Snapshot offline, transporte cerrado, reconexión y recuperación; no se renueva por fallo de transporte |
| Wi-Fi → datos | Evento de cierre + snapshot cellular + reconexión; identidad nativa conservada |
| Background → foreground | Recuperación del JS obsoleto y lectura del snapshot nativo; sin rotación espuria |
| Backend/socket no disponible | Error de transporte transitorio; 429/503/ausencia de respuesta al refresh conservan recuperación y cooldown |
| Evento viejo tras rotación | Snapshot con revisión anterior descartado; no invalida el token nuevo |
| HTTP 401 simultáneo con ambos sockets | Un POST refresh y una publicación del token |

Comandos de gates:

```text
cd mobile
npm run typecheck
npm run lint
npm test -- --silent
npx jest --runInBand src/store/radio-session-convergence.test.tsx src/features/radio-live src/screens/radio src/utils/realtime-state.test.ts src/store/realtime-diagnostics-log.test.ts src/api/realtime-refresh-single-flight.test.ts --silent
cd android
gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain --quiet
```

También se ejecutaron `validate-system-audit-gates.mjs`, `validate-system-authorities.mjs`, `validate-environment-contract.mjs`, `app-version.js check` y `git diff --check`.

Resultado final local: **typecheck PASS; lint PASS; Mobile 120 suites / 669 tests PASS, además del runner punto-a-punto; JVM Android 83 tests PASS; assembleDebug PASS; tres validadores de arquitectura PASS; versión 1.3.0 (22) sin cambio; diff check PASS**. No se ejecutó CI remoto porque no se creó PR ni commit.

El APK debug local es `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. No se instaló, no es candidato certificado y no debe confundirse con el APK público build 22.

## Gate físico pendiente

En la primera ejecución `adb devices` no encontró dispositivos. Al reanclar la integración apareció un Android modelo 2412DPC0AG. Todavía no se afirma reproducción ni PASS físico, ni se cierran #108, #89 o #29. El propietario autorizó instalar/probar debug después de los merges y antes de preparar build 23.

En teléfono deben registrarse sólo estados/códigos/revisión/booleanos de cambio con `MC_REALTIME_DIAG` y `ManeCombRadio`; nunca credenciales, cabeceras de autorización, payloads de audio o datos personales. Correlacionar las siete situaciones de la matriz, asegurar que un PTT cortado nunca se reanuda solo y repetir UI en teléfono corto/alto, fontScale elevado, gestos y tres botones. No simular éxito cambiando AppConfig.

## Archivos de implementación modificados

```text
mobile/src/api/client.ts
mobile/src/store/root-store.ts
mobile/src/utils/realtime-state.ts
mobile/src/components/connection-banner.tsx
mobile/src/features/radio-live/radio-live-overlay.tsx
mobile/src/features/radio-live/radio-live-runtime.ts
mobile/src/features/radio-live/radio-live-store.ts
mobile/src/features/radio-live/radio-live-types.ts
mobile/src/native/audio.ts
mobile/src/screens/radio/radio-screen.styles.ts
mobile/android/app/src/main/java/com/anonymous/combiscontrol/audio/ManeCombAudioModule.kt
mobile/android/app/src/main/java/com/anonymous/combiscontrol/audio/ManeCombRadioService.kt
mobile/android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioCredentials.kt
mobile/android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioSessionController.kt
mobile/android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioSessionState.kt
mobile/android/app/src/main/java/com/anonymous/combiscontrol/audio/SocketIoRadioTransport.kt
```

Tests añadidos/modificados:

```text
mobile/src/api/realtime-refresh-single-flight.test.ts
mobile/src/store/radio-session-convergence.test.tsx
mobile/src/store/realtime-diagnostics-log.test.ts
mobile/src/utils/realtime-state.test.ts
mobile/src/features/radio-live/radio-live-store.test.ts
mobile/src/features/radio-live/radio-live-runtime.test.ts
mobile/src/screens/radio/radio-bottom-spacing.test.ts
mobile/android/app/src/test/java/com/anonymous/combiscontrol/audio/RadioSessionControllerTest.kt
```

## Reconciliación semántica de baseline

Se revisaron los cinco commits de main desde `3786a744` hasta `b56e13e0`: cierre certificable #254, dependencias #256, procedencia limpia #255, lookup de Draft por ID #257 y URL canónica #258. Se mantiene backend como autoridad de identidad/AppConfig, app.json como versión compilada y workflow como certificador del artefacto. No cambian owners, límites de drift, divergencias pendientes ni gates físicos. El baseline documental se reancla al main observado e incluye los consumidores de la recuperación compartida; no constituye una certificación física ni autorización para publicar AppConfig.

## Matriz de trabajo vigente e histórico

| Work item | Rama / PR | Archivos | Propósito / pruebas | Solapamiento | Acción |
| --- | --- | --- | --- | --- | --- |
| Convergencia Radio | codex/radio-session-convergence | root-store, api/client, radio-live, bridge/controlador/transporte Kotlin, realtime-state/banner y tests listados | Un refresh compartido, rotación nativa, terminal sin productores; Jest/JVM/debug | API auth consumida por Chat | PR propio; merge sólo verde; físico pendiente aceptado explícitamente |
| Spacing Radio | misma rama | radio-screen.styles + radio-bottom-spacing.test | 10 dp token sm, pills equilibrados y >=44; contrato sin doble SafeArea | No cambia navegación | Integrar con Radio; medir en teléfono |
| Media Chat | fix/chat-authenticated-media-retry / #259 | message-media.tsx | Recuperar Image por apiClient y audio con headers vigentes | Refresh HTTP/Radio; estados 401/403/404/5xx/network | Reanclar después de Radio, añadir regresiones de integración, gates y merge |
| Release/AppConfig 22 | #254–#258 | workflow, verificadores manifest/Draft, repositorio AppConfig, locks | Procedencia, digest, attestation y publicación fail-closed | Ninguna mutación necesaria para Radio/Chat | Ya integrado; preservar Release y no aplicar backendPatch 22 |
| Backups y RC antiguos | backup/*, rc-mobile-call-ring-01, rc-mobile-socketauth-01, rc-ventas-* | sockets/RTC/Portal y reportes históricos | Antecesores de autoridades actuales; no son trabajo nuevo | Reintroducirían implementaciones anteriores | Conservar como históricos; no mergear ni borrar |
| OLA comercial / plataforma | chore/manecomb-stabilization*, codex/audit-platform-model-import* | journeys, pagos, modelo Platform, test comercial suelto | Sustituidos por main, #211/#213 y hotfix Platform | El test suelto usa POST obsoleto; main usa PATCH y primitivo atómico | Conservar; no rescatar el test obsoleto |
| Variantes UI/arranque/auditoría | mobile-m0/m1, cold-start/startup, panel-no-bounce, routes-workspace, system-authorities, adm-global-p2-p5 | Tests, navegación, paneles y reportes | Autoridades consolidadas presentes en main | Variantes históricas, no nuevo candidato | Conservar sin revivir experimentos |
| Parches equivalentes | profile-avatar-persistence{,-v3,-v4}, radio-history-429-cache-current, integration/panel-scroll-hardening-final, integration/physical-gate-main | Avatar, playback, panel, política física | git cherry sin patches exclusivos | Ya presentes aunque SHA difiera | Clasificar integrados por equivalencia; no duplicar |
| PRs históricos cerrados | familias communications/chat clean, #221/#218 y otras | Backend/Portal/infra | Cierres/sucesores y main consolidados | No hay otro PR abierto vigente | Preservar referencias; no reabrir automáticamente |

Inventario inicial completo local: 389 refs (241 integradas por ascendencia, 76 asociadas a PRs mergeados, 36 PRs históricos cerrados, 34 refs históricas sin PR y los dos trabajos vigentes). Los 15 worktrees secundarios fueron inspeccionados sin modificaciones: sólo el test comercial histórico citado quedó sin tracking. `origin` se actualizó; el remoto local `rcgeo` referencia una carpeta inexistente y se conservó intacto.
