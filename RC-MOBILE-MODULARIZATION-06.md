# RC-MOBILE-MODULARIZATION-06 — Modularización de `radio-screen-view`, solo capa segura (Fase 2.2 móvil — cierre de Fase 2)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (Fase 1 commiteada; Fase 2.1 —RC-05, checklist— en el árbol sin commit, verificada en verde)
>
> **Estado Git inicial:** sin revert, rebase, merge ni cherry-pick en curso.

## 1. Objetivo y resultado

Se extrajo **únicamente presentación pura del JSX** de `mobile/src/screens/radio/radio-screen-view.tsx` (1,970 líneas; los estilos ya vivían fuera en `radio-screen.styles.ts`). Salieron dos páginas del pager como componentes puros; **toda la máquina PTT, el reducer, los timers, `RadioRealtimeService`, el servicio nativo, el envío de frames y las ramas web permanecieron byte a byte** en el contenedor.

El contenedor pasó de **1,970 a 1,824 líneas físicas** (−146, −7.4 %). La reducción es deliberadamente modesta: del bloque JSX (~392 líneas), la mitad es la consola PTT en vivo y las superficies web, que por regla de la fase se quedan. Diff del contenedor: 175 eliminaciones + 29 inserciones, y la auditoría del diff confirma que **las únicas inserciones no-import son las dos invocaciones** `<RadioDirectoryPage …/>` y `<RadioAudiosPage …/>`.

## 2. Inventario verificado y plan reportado antes de ejecutar

Rangos de auditoría confirmados leyendo el archivo completo:

| Elemento | Auditoría | Real | Veredicto |
|---|---|---|---|
| Bloque presentacional JSX | ~1578–1970 | 1578–1970 | ✓ |
| Timers de grabación/PTT/metering | ~154–175 (refs) | refs 154–175; `setInterval` grabación en 805, `setTimeout` press-to-talk en 1307, metering frames en 649–660/835–879 | ✓ |
| `RadioRealtimeService` en socket compartido | ~511–513 | efecto constructor 366–495 + connect 511–513 | ✓ |
| Servicio nativo foreground | ~516–522 | 516–522 | ✓ |
| Frames de audio 640 bytes | ~524+ | 524–538 (guard `frame.bytes !== 640`) | ✓ |
| Ramas web | `webRecorderRef`, dispositivos | recorder web 1074–1209, dispositivos 662–721 y 1211–1230, sink de salida 703–721 | ✓ |
| `radio-status.test.ts` | referenciado en `package.json`, inexistente | **Confirmado**: el patrón está en el script `test` y el archivo no existe (jest lo trata como patrón sin match). **No se creó ni se tocó** | ✓ |
| Anclas de test por nombre | verificar | Ninguna: consumo vía `radio-screen.tsx` → `App.tsx:21`; `radio-reducer.test.ts` ejercita reducer/servicios, no la vista | ✓ |

**Plan reportado y ejecutado — qué salió:**

1. **Página 1 del pager, "Directorio"** (JSX 1656–1766) → `RadioDirectoryPage`: buscador, tarjeta "Abrir radio general", lista de canales y contactos directos. Presentación pura sobre datos ya derivados.
2. **Página 3, "Audios"** (JSX 1891–1947) → `RadioAudiosPage`: encabezado, chips de filtro y `FlatList` de `VoiceTransmissionCard` (**reutilizado sin modificarlo**) con estado vacío.

**Qué se quedó y por qué (declarado):**

- **Toda la página 2 (consola PTT, 1770–1888):** es exactamente el caso "estado en vivo" de la regla — animaciones reanimated (`pttAnimatedStyle`/`haloAnimatedStyle`), `PttAudioWave` alimentado por el shared value `waveformLevels` del metering, `Pressable` con `handlePttPress/In/Out` (timers press-to-talk) y textos derivados fase a fase del reducer. Inseparable del timer/metering sin riesgo.
- El **header** del `AppShell` (chips de micrófono/salida y botón de ajustes) y el **`audioSettingsPanel`**: superficies de las ramas web (estado `showSettings`, enumeración de dispositivos) — intocables por regla.
- Los **indicadores de página** (15 líneas atadas al estado del pager) y el **shell del pager** (`handlePagerLayout`/`handlePagerMomentumEnd`): extraerlos añadía sustituciones sin beneficio.
- Todas las derivaciones (`liveStatus`, `pttStateStyle`, `pttButtonTitle/Subtitle`, `filteredChannels`, `filteredContacts`, `availableAudioFilters`, `filteredVoiceNotes`…) se calculan en el contenedor y las dos páginas las reciben **por props**, como exige el punto 4 del encargo.

## 3. Decisiones declaradas

- **Convención local respetada:** archivos kebab-case en `radio/components/` (como `radio-transmission-card.tsx`, `ptt-audio-wave.tsx`) y **tipado estricto** de props (a diferencia del `styles: any` de alerts): `theme: ReturnType<typeof useAppTheme>['theme']` y `styles: ReturnType<typeof createStyles>` como tipos-solo, espejo exacto de `VoiceTransmissionCard`.
- **Mapeo mecánico de identificadores en el JSX movido (única transformación, declarada):** `filteredChannels→channels`, `filteredContacts→contacts`, `user.id→currentUserId`, `activeChannel?.id→activeChannelId`, `hoveredRadioItemId→hoveredItemId`, `setHoveredRadioItemId→onHoverItem`, `setSearch→onSearchChange`, `handleSelectChannel→onSelectChannel`, `handleOpenGeneralRadio→onOpenGeneralRadio`, `handleOpenDirectRadio→onOpenDirectContact`, `filteredVoiceNotes→voiceNotes`, `availableAudioFilters→filters`, `audioFilter→activeFilter`, `setAudioFilter→onFilterChange`. Los envoltorios `() => { …(); }` que descartan promesas se conservaron dentro del componente, idénticos al original.
- Los componentes importan solo utilidades puras (`getConversationContact`, `formatRole`, `getPresenceStatus`, `getTextInputProps`) y compartidos de presentación (`StatusPill`, `UserAvatar`, `VoiceTransmissionCard`): **cero store, API, sesión, socket, reducer o servicios de audio/realtime**.
- **La hoja de estilos `radio-screen.styles.ts` no se tocó** (0 modificaciones).
- Imports del contenedor recortados a lo que su cuerpo usa tras la extracción: pierde `FlatList`, `TextInput`, `UserAvatar`, `formatRole`, `getTextInputProps`, `getPresenceStatus`, `VoiceTransmissionCard`; todo lo demás intacto.

## 4. Arquitectura final

```
mobile/src/screens/radio/
├── radio-screen-view.tsx           (contenedor, 1,824 líneas — máquina PTT completa, reducer, timers,
│                                    realtime, foreground, ramas web, consola PTT, pager)
├── radio-screen.styles.ts          (721 líneas — SIN CAMBIOS)
├── components/
│   ├── ptt-audio-wave.tsx          (existente, sin cambios)
│   ├── radio-audios-page.tsx       (nuevo, 89 líneas)
│   ├── radio-directory-page.tsx    (nuevo, 157 líneas)
│   ├── radio-transmission-card.tsx (existente, sin cambios — reutilizado por la página de audios)
│   └── radio-waveform.tsx          (existente, sin cambios)
├── constants.ts / hooks/ / reducers/ / services/ / types/ / utils/  (sin cambios)
```

## 5. Componentes extraídos

| Pieza | Archivo | Props | Estado interno | Hooks | Imports de store/socket/reducer/servicios |
|---|---|---|---|---|---|
| `RadioDirectoryPage` | `components/radio-directory-page.tsx` | `activeChannelId`, `channels`, `contacts`, `currentUserId`, `hoveredItemId`, `onHoverItem`, `onOpenDirectContact`, `onOpenGeneralRadio`, `onSearchChange`, `onSelectChannel`, `presenceByUser`, `search`, `styles`, `theme` | — | — | Ninguno |
| `RadioAudiosPage` | `components/radio-audios-page.tsx` | `activeFilter`, `filters`, `onFilterChange`, `presenceByUser`, `styles`, `theme`, `token`, `voiceNotes` | — | — | Ninguno |

## 6. Métricas

| Métrica | Valor |
|---|---|
| Contenedor antes → después | 1,970 → 1,824 líneas (−146, −7.4 %) |
| Archivos nuevos | 2 (directory 157 + audios 89 = 246 líneas) |
| Archivos modificados | 1 (`radio-screen-view.tsx`); estilos y componentes existentes intactos |
| Diff del contenedor | 175 eliminaciones, 29 inserciones (imports + las 2 invocaciones); auditoría: cero inserciones fuera de eso |
| Total del módulo antes → después | 1,970 → 2,070 (+100 por contratos de props) |
| Dependencias nuevas | 0 |

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| ESLint (`src/screens/radio` completo) | PASS (exit 0) |
| **Test que ejercita radio (`radio-reducer.test.ts`: reducer + radio-format + audio-service + `RadioRealtimeService`)** | **PASS 13/13, confirmado explícitamente** |
| `npm test` post-cambio | 25/25 suites, 126/126 tests — idéntico a la línea base; escaneos globales recorren los 2 archivos nuevos y pasan |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |
| Ejercicio runtime real (transmitir PTT, recibir frames, realtime, foreground) | **No ejercitado**: requiere sesión, backend y hardware de audio. Evidencia: diff con cero inserciones en la lógica + suite idéntica + bundle release completo |

## 8. Matriz de compatibilidad

| Contrato | Estado |
|---|---|
| Export público `RadioScreen` (vía `radio-screen.tsx` → `App.tsx:21`) | Sin cambio |
| **Máquina PTT y `radioSessionReducer` (`transitionSession`, fases, `radioSessionRef`)** | **Intactos, byte a byte** (líneas 53/133/180 del contenedor) |
| **Timers de grabación (`setInterval` 400 ms), press-to-talk (`setTimeout` 180 ms) y metering (frames web + `waveformLevels`)** | **Intactos** |
| **`RadioRealtimeService` colgado del socket compartido (constructor con `onEnd`/`onError`/`onFrame` + connect por canal)** | **Intacto** (363, 508–510 del contenedor nuevo) |
| **Servicio nativo en primer plano (`startRadioForegroundService`/`stop`)** | **Intacto** (514–519) |
| **Envío de frames de audio de 640 bytes (guard `frame.bytes !== 640`)** | **Intacto** (523) |
| **Ramas web (recorder `MediaRecorder`, enumeración de dispositivos, `setSinkId`, `webRecorderRef`)** | **Intactas** (662–721, 703–721, 1074–1209, 1211–1230) |
| Todos los `useState`/`useRef`/reducer/efectos del contenedor (12 estados, ~22 refs, ~12 efectos) | Sin cambio |
| Directorio: búsqueda, canales, no-leídos, contactos directos (textos y accesibilidad) | Trasladados byte a byte con el mapeo de props declarado |
| Audios: filtros, tarjetas (`VoiceTransmissionCard` sin tocar), vacío | Ídem |
| `radio-screen.styles.ts` | 0 modificaciones |
| `radio-status.test.ts` | Confirmado inexistente y referenciado; **no creado ni tocado** |
| `package.json` / dependencias | Sin cambio |

## 9. Rollback

Cambios de esta fase sin commit; reversión desde la raíz del repo (no afecta la Fase 2.1):

```
git checkout -- mobile/src/screens/radio/radio-screen-view.tsx && rm mobile/src/screens/radio/components/radio-directory-page.tsx mobile/src/screens/radio/components/radio-audios-page.tsx && rm RC-MOBILE-MODULARIZATION-06.md
```

---

## 10. Cierre de Fase 2 — estado global

| Fase | Pantalla | Contenedor antes → después | Reducción | RC |
|---|---|---|---|---|
| 2.1 | `checklist-screen` | 2,827 → 1,514 | −1,313 (−46.4 %) | RC-MOBILE-MODULARIZATION-05 |
| 2.2 | `radio-screen-view` | 1,970 → 1,824 | −146 (−7.4 %) | RC-MOBILE-MODULARIZATION-06 |
| **Total Fase 2** | 2 pantallas con lógica viva | **4,797 → 3,338** | **−1,459 (−30.4 %)** | — |

La asimetría es el resultado correcto del alcance: en checklist la capa segura era enorme (750 líneas de estilos + 400 de helpers puros + RoutePreview); en radio los estilos ya estaban fuera y la mitad del JSX es consola PTT en vivo que la regla prohíbe mover. En ambas fases el diff del contenedor quedó auditado con cero inserciones fuera de imports/re-export/invocaciones, la suite quedó idéntica (25/25, 126/126) con los tests específicos confirmados (`checklist-screen.test.ts` 5/5, `radio-reducer.test.ts` 13/13), y typecheck/ESLint/bundle release en verde. Cero dependencias nuevas en toda la Fase 2. Intocados y pendientes (Fase 3 u otra decisión): `root-store.ts`, doble `useLocationSync`, chat RTC, contenedor vivo de checklist y consola PTT.
