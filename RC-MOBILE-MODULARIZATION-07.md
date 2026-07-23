# RC-MOBILE-MODULARIZATION-07 — Borrados inequívocos y micro-limpieza (Fase 3.1 móvil)

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `6c3e1ac` (Fases 1 commiteada; Fase 2 —RC-05, RC-06— en el árbol sin commit, verificada en verde)
>
> **Estado Git inicial:** sin revert, rebase, merge ni cherry-pick en curso. Nota: el árbol tiene cambios preexistentes ajenos en `backend/` (`models.js`, `payment-repository.js`, `store.js`, `checkout-idempotency.js`) que **no pertenecen a esta fase y no se tocaron**.

## 1. Objetivo y resultado

Limpieza de bajo riesgo: cuatro ítems, cada uno **verificado como muerto leyendo el código antes de tocarlo**. Cero cambios de comportamiento, estilos ni lógica; cero dependencias nuevas; ninguna reliquia web tocada. Los cuatro ítems resultaron efectivamente muertos/deduplicables y se aplicaron; el ítem 4 tuvo una **discrepancia con la premisa del prompt** (documentada abajo) que se resolvió de forma faithful al intent.

## 2. Ítem 1 — Carpetas vacías `app/(tabs)`, `app/portal`, `app/ventas`

**Verificación:**
- `find app -mindepth 1` → solo las tres carpetas, **ningún archivo** (ni oculto).
- `git ls-files app` → **vacío** (nada versionado).
- `ls -la` de cada una → solo `.` y `..`.

**Acción:** `rmdir "app/(tabs)" "app/portal" "app/ventas"` (rmdir falla si no están vacías — garantía extra de que no había contenido).

**Nota declarada:** tras el borrado, el directorio padre `app/` queda existente pero vacío. El prompt acotó el borrado a las **tres subcarpetas nombradas**, así que `app/` (vacío, no versionado, inofensivo — git no rastrea directorios vacíos) **se deja en pie**; su eliminación queda fuera de scope, a decisión del usuario.

## 3. Ítem 2 — Referencia muerta `radio-status.test.ts` en `package.json`

**Verificación:**
- `find` repo-wide (desde `mobile/` y desde la raíz, excluyendo `node_modules`) de `radio-status*` → **no existe en ningún lado**.
- Baseline `npm test` mostró el patrón `src\\utils\\radio-status.test.ts` en "Ran all test suites matching …" pero corriendo **25 suites** — jest lo trata como patrón sin match (no error, no suite).

**Acción:** se retiró exactamente el token `src/utils/radio-status.test.ts ` (más un espacio) del script `test`. Quedó `…src/utils/location-status.test.ts src/utils/realtime-state.test.ts…`. Ningún otro path, flag ni script tocado.

**Confirmación de conteo:** `npm test` post-cambio corre **25 suites / 126 tests** — idéntico al baseline. El conteo **no bajó** (el patrón retirado nunca aportaba una suite) y el patrón `radio-status` ya no aparece en la línea de match.

## 4. Ítem 3 — Re-export huérfano `getIncidentContext` en `incidents-screen.tsx:2`

**Verificación (grep repo-wide):**
- Único importador **desde** el módulo `incidents-screen`: `App.tsx:13`, que importa **solo `IncidentsScreen`**, no `getIncidentContext`.
- El único consumidor real de `getIncidentContext` es `AlertsScreen.tsx:26`, que lo importa **directo** de `./alerts/utils/alerts.utils` (no vía el re-export).
- Las demás apariciones son documentación (`.md` de RCs anteriores), no código.

Conclusión: el re-export de la línea 2 **no tiene consumidor**. (El comentario en `RC-MOBILE-APP-CENTER-06.md` que decía "se reexporta… para conservar sus consumidores" quedó obsoleto: los consumidores migraron al import directo.)

**Acción:** se eliminó la línea 2 (`export { getIncidentContext } …`). Se conservó la línea 1 (`export { AlertsScreen as IncidentsScreen } …`), que sí tiene consumidor (`App.tsx:13`).

## 5. Ítem 4 — Tipo `Tone` redeclarado — **discrepancia con la premisa del prompt, resuelta**

**Verificación y discrepancias:**
1. **`status-pill` NO exporta ningún tipo `Tone`.** Su prop se tipa `tone?: DesignTone`, importando `DesignTone` de `@/constants/theme`. Por tanto "importar el tipo de `status-pill`" **no es literalmente posible** — el tipo canónico vive en `@/constants/theme:24`.
2. **Una sola** pantalla redeclara el tipo (`users-screen.tsx:17`), no "varias" como decía la auditoría. `grep -rn "type Tone"` en todo `src/` devuelve exactamente esa línea.
3. El `Tone` local (`'positive' | 'warning' | 'danger' | 'info' | 'neutral'`) es **idéntico carácter por carácter** a `DesignTone` (mismos 5 miembros, mismo orden) — cumple la condición del prompt ("solo si el tipo importado es idéntico").
4. `Tone` se usa en `users-screen` como tipo de retorno de `roleTone()`/`accountStatusTone()`, cuyos resultados alimentan `StatusPill.tone` — que es precisamente `DesignTone`. Es decir, `DesignTone` es el tipo que la pantalla **debería** haber usado desde el principio.

**Resolución declarada:** como `status-pill` no exporta el tipo, se importó el tipo canónico idéntico desde donde realmente vive y donde `StatusPill` mismo lo consume — `@/constants/theme` — usando un **alias** para no alterar ninguna otra línea del archivo:

```ts
import { AppTheme, Typography, type DesignTone as Tone } from '@/constants/theme';
```

y se eliminó la línea `type Tone = …`. Con el alias, el identificador `Tone` sigue existiendo en el archivo (las firmas `roleTone(): Tone` y `accountStatusTone(): Tone` quedan **byte a byte iguales**); solo cambia su origen: de redeclaración local a import del tipo canónico. Es un cambio **puro de tipos** (borrado en runtime), cero efecto en valores. Se prefirió el alias a renombrar `Tone → DesignTone` en las firmas para minimizar el diff, fiel al "reemplaza la redeclaración local por un import".

## 6. Resumen de cambios

| Ítem | Archivo | Cambio exacto |
|---|---|---|
| 1 | `mobile/app/(tabs)`, `app/portal`, `app/ventas` | 3 directorios vacíos eliminados (`rmdir`) |
| 2 | `mobile/package.json` | script `test`: retirado `src/utils/radio-status.test.ts` |
| 3 | `mobile/src/screens/incidents-screen.tsx` | eliminada la línea 2 (re-export huérfano) |
| 4 | `mobile/src/screens/users-screen.tsx` | import `type DesignTone as Tone` de `@/constants/theme`; eliminada la redeclaración local `type Tone` |

Nada resultó tener consumidor oculto; ningún ítem se dejó por estar vivo. Reliquias web (`app-map.web.tsx`, `mapbox-gl`, ramas web) **no tocadas**, según lo pedido.

## 7. Validaciones

| Verificación | Resultado |
|---|---|
| Línea base pre-cambio: `npm test` | 25/25 suites, 126/126 tests PASS |
| `npm run typecheck` (`tsc --noEmit`) | PASS (exit 0) — el alias `type DesignTone as Tone` resuelve limpio |
| ESLint (archivos tocados) | PASS (exit 0) |
| `npm test` post-cambio | **25/25 suites, 126/126 tests — idéntico al baseline**; el patrón `radio-status` ya no aparece en la línea de match y **el conteo de suites no bajó** |
| Bundle release Metro (`--dev false`, a directorio temporal) | PASS (exit 0) |

## 8. Rollback

Cambios de esta fase sin commit; reversión desde la raíz del repo:

```
git checkout -- mobile/package.json mobile/src/screens/incidents-screen.tsx mobile/src/screens/users-screen.tsx && mkdir -p "mobile/app/(tabs)" mobile/app/portal mobile/app/ventas && rm RC-MOBILE-MODULARIZATION-07.md
```

(Las tres carpetas eran vacías y no versionadas; el `mkdir` las recrea vacías para dejar el árbol como estaba. Alternativamente, al ser relictos no rastreados, pueden simplemente omitirse.)
