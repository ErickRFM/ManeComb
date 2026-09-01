# Product Readiness Closeout — 2026-08-30

Este documento es el único ledger de ejecución del cierre iniciado desde
`AUDIT_BASELINE_SHA=3786a7440f4804c665ab3ca6ea82008ce6f1fe96`.

## Autoridad de trabajo

- Rama: `codex/product-readiness-closeout`
- Base local/remota al iniciar: `3786a7440f4804c665ab3ca6ea82008ce6f1fe96`
- PRs abiertos al iniciar: ninguno.
- Issues físicos/productivos abiertos: #108, #89 y #29.
- Autoridad de perfil: backend `profile-authority.js` y `PATCH /api/users/me`.
- Autoridad de credenciales: `POST /api/users/me/change-password`.
- Autoridad de release público: backend `/api/app/info`; `mobile/app.json` describe el binario.
- Autoridad de jornada: `shared/operational-contract/journey-selectors.ts`.

## Ledger de findings

### MC-01 — Credenciales fuera de self-profile y de la cola offline

| Campo | Contenido |
| --- | --- |
| Categoría | security / bug |
| Usuario afectado | empresa y conductor |
| Journey | perfil → cambio de contraseña; edición offline → replay; logout/cambio de cuenta |
| Evidencia | Mobile admitía `password`, `userStatus` y `operationalSchedule` en la mutación self-profile; `user:updateProfile` persistía el payload completo en AsyncStorage. Backend ya excluía credenciales y poseía endpoint dedicado. |
| Autoridad | Backend self-profile allowlist + account-security endpoint. Mobile sólo presenta, valida y transporta. |
| Causa raíz | `ProfileMutationPayload` mezclaba self-service, campos administrados y credenciales; la cola confiaba ciegamente en ese tipo. |
| Opción A | Ocultar sólo el input. |
| Opción B | Cifrar toda la cola. |
| Opción C | Separar tipos, reutilizar el cambio dedicado y sanear en compile-time/runtime/persistencia. |
| Trade-offs | A deja la frontera rota; B aumenta complejidad y conserva un diseño incorrecto; C elimina el secreto donde nunca debió existir y preserva operaciones válidas. |
| Decisión | Opción C. |
| Archivos | `mobile/src/types/app.ts`, `mobile/src/api/self-profile-authority.ts`, `mobile/src/api/offline-cache.ts`, `mobile/src/api/client.ts`, `mobile/src/api/account-security-validation.ts`, perfiles Mobile, tipos/API de Ventas y pruebas relacionadas. |
| Tests | Sanitización runtime/persistida, operación legacy sólo-credencial, perfil offline válido, boundary TypeScript, validación de password, endpoint y sesiones. |
| Resultado | PASS |
| Razón | La frontera compila estrecha, sanea en ingreso/lectura/escritura/replay, elimina operaciones sin campos útiles y pasó 114 suites/642 tests Mobile más las suites completas Backend. Ningún secreto queda en AsyncStorage por esta ruta. |

### MC-02 — Distribución y autoridad de APK

| Campo | Contenido |
| --- | --- |
| Categoría | release / infra |
| Usuario afectado | conductor / empresa |
| Journey | landing → descarga → instalación limpia |
| Evidencia | En el baseline Mobile declaraba 1.3.0/build 22 mientras el seed de `/api/app/info` anunciaba 1.0.2 y un share OneDrive mutable. El APK histórico local mide ~96 MB. |
| Autoridad | Binario desde `mobile/app.json`; release público desde backend `/api/app/info`. |
| Causa raíz | El build y AppConfig no compartían una evidencia generada de commit/artefacto/digest; el seed podía convertirse en metadata pública obsoleta. |
| Opción A | Mantener OneDrive. |
| Opción B | R2 con dominio ManeComb. |
| Opción C | GitHub Releases o Pages según visibilidad/tamaño. |
| Trade-offs | OneDrive no ofrece procedencia ni URL inmutable; R2 es el mejor canal de marca pero requiere bucket/dominio/secretos inexistentes; Pages limita cada asset a 25 MiB; GitHub Releases es anónimo para este repo público y aporta tags, assets, digest, rollback y attestations sin otro proveedor. |
| Decisión | GitHub Releases como canal productivo inmediato; R2 sólo como espejo futuro. Publicación atómica y fail-closed desde Platform. |
| Archivos | Backend AppConfig/repository/rutas/certification service/tests; `mobile/scripts/build-android-apk.js`, `release-manifest.js`, workflow `android-release-candidate.yml`, tipos Ventas y runbook. Notas, obligatoriedad e historial se publican en la misma transición. |
| Tests | Contrato público configurado/incompleto/nulo, validación Platform, persistencia, auth update, self-test de manifiesto, suite Backend y Mobile completas. El workflow vuelve a descargar y compara SHA-256 cuando publica. |
| Resultado | BLOCKED |
| Razón | Código/pipeline PASS. Publicación real bloqueada: GitHub sólo contiene `MAPBOX_ACCESS_TOKEN`; faltan keystore/password/alias/key password y `google-services.json` en secrets. Sin publicar no existe URL anónima ni digest remoto que certificar. |

### MC-03 — Checkpoint semántico de System Audit

| Campo | Contenido |
| --- | --- |
| Categoría | certification / architecture |
| Usuario afectado | plataforma / release engineering |
| Journey | commit → gates → certificación automatizada |
| Evidencia | El workflow del baseline falla por drift 6/5 y omite checks posteriores. |
| Autoridad | `system-audit-gates.json`, `system-authorities.json` y scripts/workflow asociados. |
| Causa raíz | El checkpoint anterior quedó seis commits detrás del main con máximo cinco; esos commits cambiaron durabilidad de comunicación y recuperación, pero no crearon otra autoridad. |
| Opción A | Cambiar sólo el SHA. |
| Opción B | Aumentar el máximo de drift. |
| Opción C | Revisar cambios semánticos y apuntar a un checkpoint de código reproducible. |
| Trade-offs | A/B ocultan drift; C conserva la intención del gate. |
| Decisión | Opción C. |
| Archivos | `docs/architecture/system-audit-gates.json`, `docs/architecture/system-authorities.json`. |
| Tests | Los seis pasos locales exactos del workflow pasan; policy física 8/8. El paso `Enforce physical gate on Ready PRs` no aplica porque no existe PR. Los runs remotos de CI, System Audit y Dependency Audit sobre el candidato previo al ajuste exclusivo de Actions terminaron en PASS. |
| Resultado | PASS |
| Razón | Checkpoint reproducible `3786a744...` coincide con `origin/main`, drift 0/5 sin ampliar el límite; autoridades y nuevas rutas fuente están registradas. |

### MC-04 — Header responsive

| Campo | Contenido |
| --- | --- |
| Categoría | UX / responsive |
| Usuario afectado | visitante comercial móvil |
| Journey | landing → navegación/plan |
| Evidencia | “Ver planes” se recorta en 320/360/390 px; el test de `scrollWidth` no lo detecta. |
| Autoridad | `site-header.tsx` y layout de Ventas. |
| Causa raíz | En composición stacked el logo y dos acciones competían por un ancho que `scrollWidth` global no revelaba como clipping local. |
| Opción A | Ocultar CTA secundario estrecho. |
| Opción B | Comprimir toda la cabecera. |
| Opción C | Reorganizar todas las acciones. |
| Trade-offs | El hero ya contiene el CTA comercial; A ofrece el mismo resultado con el menor riesgo. |
| Decisión | Opción A. |
| Archivos | `ventas/screens/sales/components/site-header.tsx`, `sales-screen.tsx`, config/spec Playwright y workflow Portal. |
| Tests | Bounding boxes `left >= 0` y `right <= viewport` en 320/360/390/430/768/1024/1280/1440; CTA ausente bajo 430 y visible desde 430. 16/16 checks dirigidos PASS. |
| Resultado | PASS |
| Razón | Se retira sólo el CTA redundante en estrecho; login permanece y Hero conserva la acción comercial. |

### MC-05 — Semántica y ergonomía de Auth

| Campo | Contenido |
| --- | --- |
| Categoría | accessibility / UX |
| Usuario afectado | visitante comercial |
| Journey | registro/login/password recovery |
| Evidencia | Labels visuales no asociados programáticamente; pestañas de 36 px y toggle estrecho. |
| Autoridad | componentes Auth de Ventas; WCAG 2.2 para web. |
| Causa raíz | El texto visual no estaba referenciado por el input y varias áreas interactivas dependían del tamaño del glifo/texto. |
| Opción A | Aumentar todo a 44 px. |
| Opción B | Asociar labels y cumplir 24×24 CSS px/spacing AA, usando área cómoda sin agrandar iconos. |
| Trade-offs | A confunde guía Android con el criterio WCAG; B corrige semántica y ergonomía sin rediseño. |
| Decisión | Opción B. |
| Archivos | `auth-field.tsx`, `auth-mode-selector.tsx`, `auth-session-bar.tsx`, `auth.styles.ts`, `sales-auth-screen.tsx` y matriz Playwright. |
| Tests | Accessible names, `aria-selected`, username/current-password/new-password/name/organization autocomplete, Tab identity→password→toggle y targets de 32/44 px en ocho viewports. |
| Resultado | PASS |
| Razón | Semántica y ergonomía mejoraron sin cambiar estética, validación ni flujo de autenticación. |

### MC-06 — Vocabulario de jornada

| Campo | Contenido |
| --- | --- |
| Categoría | cross-surface UX |
| Usuario afectado | conductor |
| Journey | jornada READY y su historial |
| Evidencia | Mobile duplicaba `READY: Lista`; shared define `Lista para iniciar`. |
| Autoridad | `shared/operational-contract/journey-selectors.ts`. |
| Causa raíz | El panel de historial mantenía un segundo diccionario local de seis estados mientras shared sólo exponía el formatter del journey activo. |
| Opción A | Cambiar sólo el string local. |
| Opción B | Consumir el formatter compartido. |
| Trade-offs | B elimina duplicación sin tocar estados backend. |
| Decisión | Opción B. |
| Archivos | `shared/operational-contract/journey-selectors.ts`, `BottomTrackingPanel.tsx`, prueba de autoridad. |
| Tests | ASSIGNED/READY/RUNNING/PAUSED/FINISHED/CANCELLED más null y fallback desconocido. |
| Resultado | PASS |
| Razón | Shared ahora posee los seis labels de lifecycle; `RUNNING: En jornada` se conserva como copy contextual intencional. No cambió ningún estado backend. |

### MC-07 — Copy de presencia

| Campo | Contenido |
| --- | --- |
| Categoría | visual copy |
| Usuario afectado | conductor / operador |
| Journey | chat y presencia |
| Evidencia | Mobile muestra “En linea” y “Offline”. |
| Autoridad | estado realtime existente; sólo cambia presentación. |
| Causa raíz | Literales españoles inconsistentes vivían en el presenter de presencia y en consola Radio. |
| Opción A | “En línea” / “Sin conexión”. |
| Opción B | Cambiar estados/socket. |
| Trade-offs | A alinea español sin riesgo de realtime. |
| Decisión | Opción A. |
| Archivos | `mobile/src/utils/presence.ts`, pruebas y presenter/test de Radio. |
| Tests | online/offline/unknown y consola LISTENING. |
| Resultado | PASS |
| Razón | “En línea” / “Sin conexión” quedan normalizados sin tocar sockets, heartbeat, freshness ni estados. |

### MC-08 — Error envelope distribuido

| Campo | Contenido |
| --- | --- |
| Categoría | technical debt |
| Usuario afectado | transversal |
| Journey | errores recuperables de API |
| Evidencia | Los clientes aún clasifican parcialmente por separado; no existe regresión concreta ligada al cierre. |
| Autoridad | Backend error envelope; consumidores Mobile/Ventas/Admin. |
| Causa raíz | Evolución histórica separada entre clientes; no se reprodujo una falla ligada a los journeys modificados. |
| Opción A | Nuevo framework global. |
| Opción B | No cambiar durante el cierre. |
| Trade-offs | A tiene impacto invisible y riesgo alto. |
| Decisión | Opción B. |
| Archivos | Ninguno. |
| Tests | Suites existentes. |
| Resultado | DEFER |
| Razón | Deuda no bloqueante sin bug reproducible actual. |

## Investigación aplicada

| Problema | Patrón oficial | Aplicación a ManeComb | Decisión |
| --- | --- | --- | --- |
| Secretos en cola offline | AsyncStorage se documenta como almacenamiento persistente no cifrado; SecureStore está orientado a valores secretos pequeños. | La cola es grande y replayable; una contraseña no es una operación offline válida. | Eliminar la credencial del diseño y sanear legado, no cifrar toda la cola. |
| Targets web | WCAG 2.2 AA 2.5.8 exige 24×24 CSS px o spacing equivalente. | Un objetivo de comodidad puede ser mayor, pero `<44px` no implica por sí solo incumplimiento AA. | Medir geometría y spacing; no agrandar iconos sin necesidad. |
| Labels | WAI recomienda asociación explícita entre label y control. | El placeholder no sustituye el nombre accesible estable. | Añadir asociación programática conservando el diseño. |
| Distribución APK | GitHub Releases publica assets del repo público con URL directa, tags y digest; immutable releases/attestations refuerzan procedencia. | No exige credenciales de un segundo host y el workflow puede descargar el mismo asset publicado. | GitHub Releases inmediato, draft-first, attestation y verificación remota. |
| R2 | Public buckets admiten custom domain y caché; R2 no cobra egress directo, pero `r2.dev` no es canal productivo y faltan recursos/secretos. | Aporta marca y control cuando ManeComb provisione bucket/dominio. | Conservar como espejo futuro, nunca como segunda autoridad de metadata. |
| Pages | Cloudflare Pages limita cada asset a 25 MiB. | El APK real ronda 96 MB. | Descartado. |
| Runtime de Actions | Las generaciones vigentes documentadas son `setup-java@v6` y `upload-artifact@v7`. | Los workflows usaban generaciones con runtime Node 20 deprecado; además el build aislaba `GRADLE_USER_HOME` fuera del caché de `setup-java`. | Actualizar majors y alinear el home de Gradle en CI/release sin cambiar el build local. |

## Matriz de distribución MC-02

| Criterio | OneDrive | R2 + dominio | GitHub Releases | Pages |
| --- | --- | --- | --- | --- |
| Anónimo | No garantizado | Sí | Sí, repo público | Sí |
| URL estable | Share mutable | Sí | Sí, tag + asset | Sí |
| Dominio ManeComb | No | Sí | No | Sí |
| APK grande | Frágil | Sí | Sí | No, 25 MiB/asset |
| Versionado | Manual | Por key | Nativo por tag | Por deploy |
| SHA/digest | Externo | Externo/metadata | Asset digest + manifiesto | Externo |
| Rollback | Manual/mutable | Cambiar metadata a key previa | Release/tag previo | Deploy previo |
| Automatizable | Bajo | Alto | Alto | Inviable por tamaño |
| Riesgo | Alto | Bajo tras provisión | Bajo actual | Bloqueante |
| Complejidad actual | Baja aparente | Media/alta por secretos | Baja/media | No aplicable |

## Autoridad y cadena de release

```text
mobile/app.json (version + build)
             ↓
build firmado desde un SHA Git limpio
             ↓
APK versionado + SHA-256 + release-manifest.json
             ↓
GitHub Release/attestation + descarga y re-hash
             ↓
Platform PATCH /api/platform/system/app/info (operación atómica)
             ↓
     /api/app/info fail-closed
             ↙             ↘
      Mobile update       Ventas download
```

`release-manifest.json` no es una segunda autoridad runtime: es la evidencia
generada por el build y contiene el patch exacto que Platform debe persistir.
AppConfig sigue siendo la única autoridad pública; `mobile/app.json` sigue
siendo la autoridad compilada del binario.

## Matriz resultado/riesgo

| Alternativa | Resultado usuario | Archivos | Riesgo | Complejidad | Decisión |
| --- | ---: | ---: | ---: | ---: | --- |
| Cifrar toda la cola offline | Bajo | Muchos | Alto | Alta | NO |
| Excluir credenciales en tipos/runtime/persistencia | Alto | Acotados | Bajo | Baja | SÍ |
| Rediseñar header completo | Medio | Muchos | Medio | Media | NO |
| Ocultar CTA redundante bajo 430 | Alto | 2 + test | Bajo | Baja | SÍ |
| Framework global de errores | Invisible en este cierre | Muchos | Alto | Alta | DEFER |
| Plataforma nueva de releases | Medio | Muchos | Alto | Alta | NO |
| Manifiesto pequeño + GitHub Releases existente | Alto | Acotados | Bajo/medio | Media | SÍ |

## Segunda pasada de producto/UX

- Product/interaction: los journeys modificados ya tienen siguiente acción
  clara; no se añadieron pasos. Header mantiene acceso, Hero mantiene compra y
  Auth conserva recuperación/feedback. No apareció navegación circular.
- Security: los únicos datos persistibles/replayables de self-profile son la
  allowlist; credenciales usan el endpoint online dedicado y semántica de
  revocación.
- Release: un APK sólo puede anunciarse con procedencia completa. Notas y
  obligatoriedad son campos atómicos; `versionHistory` se deriva de la nueva
  publicación y marca la previa como no actual. El endpoint no degrada hacia
  seed, URL o versión histórica.
- Time to value comercial: Landing → Plan → Cuenta → Pago → Onboarding → Unidad
  → Conductor → Mapa continúa sin duplicar captura. No hubo evidencia suficiente
  para alterar billing, capacidad, tenant o RBAC; se decidió NO CAMBIAR.

## Evidencia de validación local

| Superficie | Comando | Resultado |
| --- | --- | --- |
| Backend | `npm.cmd test` en `backend` | PASS, incluida autoridad de perfil, account-security, sesiones, AppConfig y Platform. |
| Mobile | `npm.cmd test` | PASS: 114 suites, 642 tests. |
| Mobile | `npm.cmd run typecheck` | PASS. |
| Mobile | `npm.cmd run lint -- --max-warnings=0` | PASS. |
| Mobile release | `npm.cmd run version:check` y `npm.cmd run release:manifest:test` | PASS: 1.3.0/build 22 y contrato de procedencia. |
| Ventas | `npm.cmd run typecheck`; build con `VITE_API_URL`/`VITE_SOCKET_URL` HTTPS | PASS, incluidos todos los contratos y `verify:build-meta`. |
| Responsive/Auth | Playwright dirigido con `CERT_BASE_URL` local | PASS 16/16 en 320/360/390/430/768/1024/1280/1440. |
| Admin Global | `npm.cmd test`, `npm.cmd run typecheck`, build con API HTTPS | PASS. |
| Communication | `npm.cmd test` | PASS. |
| System Audit | seis comandos exactos del job `cross-layer-contract` | PASS; physical policy 8/8; PR-only enforcement N/A sin PR. |
| Dependency Audit | cuatro `npm audit --omit=dev --audit-level=high` + Mobile gate | PASS, 0 high/critical en los cinco productos. |
| GitHub Actions | CI `33475538308`, System Audit `33475538329`, Dependency Audit `33475538376` | PASS sobre `4b0311b1`; CI completó sus ocho jobs y produjo el artefacto debug certificado. El SHA final sólo cambia workflows/ledger y se revalida después del push. |
| Android Release | `npm.cmd run android:release` desde worktree limpio | BLOCKED antes de Gradle: falta `google-services.json` y no existen las cuatro variables `MANECOMB_FIREBASE_*`. Keystore y credenciales locales sí existen; no se degradó a un build sin FCM. |
| Android físico | `adb devices -l` | BLOCKED: daemon accesible, lista de dispositivos vacía. |

## Reconciliación y freeze

- `origin/main` después de `git fetch --prune`: `3786a7440f4804c665ab3ca6ea82008ce6f1fe96`.
- Merge-base del candidato: el mismo SHA; no hay commits nuevos de main que integrar.
- PRs abiertos al reconciliar: ninguno.
- Issues abiertos: #108, #89 y #29.
- El SHA final se captura con `git rev-parse HEAD` después del commit de este
  ledger; no se introduce un SHA autorreferencial en el propio commit.
- Android Release, manifiesto y digest sólo se generan con worktree limpio.

## Bloqueos externos/físicos

- `RELEASE_SECRETS_BLOCKED`: Actions sólo tiene `MAPBOX_ACCESS_TOKEN`; faltan
  `MANECOMB_ANDROID_KEYSTORE_BASE64`, passwords/alias y
  `MANECOMB_GOOGLE_SERVICES_JSON_BASE64`. El workflow nuevo fallará cerrado.
- `PUBLICATION_BLOCKED`: sin build firmado y secrets no se crea Release, URL ni
  patch de AppConfig. R2 también carece de bucket, dominio y credenciales.
- `PHYSICAL_DEVICE_BLOCKED`: `adb devices -l` devolvió una lista vacía; la matriz
  requiere el APK/digest final y hardware autorizado; RTC además requiere dos
  Android reales.
- #108, #89 y #29 permanecen abiertos; sólo podrán cerrarse con el mismo artifact
  final y digest en session endurance, RTC/TURN, FCM, Portal/Admin y Commercial.

## Orden de continuación física

1. Cargar los seis secretos indicados y ejecutar `Android Release Candidate`
   sobre el SHA final con `publish_github_release=true`.
2. Confirmar el check de descarga/re-hash y aplicar únicamente `backendPatch`
   del manifiesto mediante `platform_owner`.
3. Verificar `/api/app/info`, descargar anónimamente y re-hashear otra vez.
4. Instalar ese APK exacto: `adb install -r <artifact.apk>`.
5. Ejecutar #108: login, 30+ min, mapa/GPS/chat/radio, background/foreground,
   lockscreen, Wi-Fi↔datos, process death y recuperación.
6. Ejecutar #89 con dos Android: audio/video/reject/cancel/timeout/background,
   lockscreen/network switch/TURN/CDR y comprobar `usedRelay:true`.
7. Ejecutar #29: FCM foreground/background/killed/lockscreen; Portal GPS real,
   activación/documentos/roles; Admin Access/JWT/MFA; journey comercial completo.
8. Adjuntar SHA, digest, dispositivos, fecha y evidencia a cada issue. No cerrar
   ninguna fila por inspección de código.
