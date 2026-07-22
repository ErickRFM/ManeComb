# RC-PORTAL-10 — Modularización de Perfil del Portal

> **Estado:** Cerrado
>
> **Rama:** `main`
>
> **Commit base:** `95ae973`
>
> **Estado Git inicial:** árbol limpio, sin revert, rebase, merge ni cherry-pick en curso.

## 1. Objetivo y resultado

Se modularizó `ventas/features/portal/screens/portal-profile-screen.tsx` sin rehacer Perfil. `PortalProfileScreen` continúa como único contenedor de parámetros, stores, sesión, formulario, efecto, validaciones, normalización, payload, guardado, navegación, enlace de correo y revocación de sesiones.

El contenedor pasó de **377 a 173 líneas físicas**, una reducción de **204 líneas (54.1 %)**. Es traslado estructural hacia componentes, estilos, tipos y una utilidad pura; no representa eliminación del módulo.

## 2. Estado inicial e inventario real

| Elemento | Implementación verificada |
|---|---|
| Export público | `PortalProfileScreen` |
| Consumidor | Carga diferida en `ventas/src/App.tsx` |
| Protección | `ScreenErrorBoundary` con nombre `Perfil` y guard general del Portal |
| Props públicas | Ninguna |
| Parámetro | `section`, normalizado a resumen, empresa, seguridad o soporte |
| Stores | `useAppStore` y `usePortalStore` |
| Acciones | `updateProfile` y `revokeSession` |
| Datos | usuario autenticado y sesiones administrativas |
| API directa | Ninguna; las operaciones permanecen delegadas a stores |
| Navegación | `router.push('/portal')` desde soporte operativo |
| Enlace externo | `mailto:soporte@manecomb.com` mediante `Linking.openURL` |
| Confirmación | `ConfirmModal` destructivo para revocar una sesión remota |

La pantalla real no tenía cambio de contraseña, avatar editable, preferencias, notificaciones, 2FA, eliminación de cuenta, carga explícita del perfil, reintento o cancelación del formulario. No se añadieron esas capacidades.

## 3. Estado, hooks y efectos conservados

El orden permanece:

1. `useLocalSearchParams`.
2. cálculo puro de `activeSection`.
3. `useAppStore` para usuario, envío y actualización de perfil.
4. `usePortalStore` para sesiones, envío y revocación.
5. `form`.
6. `message`.
7. `sessionToRevoke`.
8. `useEffect` de sincronización del formulario.

El único efecto conserva el guard `if (!user) return`, los mismos fallbacks y dependencias `[user]`. No existían `useMemo`, `useCallback`, `useRef`, timers, listeners o cleanup.

## 4. Arquitectura anterior

El archivo original concentraba:

- lectura y normalización de query params;
- acceso a dos stores y sesión autenticada;
- formulario de ocho campos;
- sincronización desde usuario y perfil de empresa;
- normalización y validaciones;
- construcción de payload y guardado;
- secciones personales y fiscales;
- listado y revocación de sesiones;
- acciones de soporte comercial y operativo;
- confirmación destructiva de sesión;
- tipo privado, helper de sección y StyleSheet completo.

## 5. Arquitectura final

```text
PortalProfileScreen
└── profile/
    ├── components/
    │   ├── portal-profile-personal-section.tsx
    │   ├── portal-profile-company-section.tsx
    │   ├── portal-profile-sessions-section.tsx
    │   └── portal-profile-support-section.tsx
    ├── profile.styles.ts
    ├── profile.types.ts
    └── profile.utils.ts
```

### Componentes extraídos

| Componente | Responsabilidad | Props | Estado propio | Hooks | Consumidor |
|---|---|---|---|---|---|
| `PortalProfilePersonalSection` | Campos visuales de nombre, correo y teléfono | form, message, onFieldChange | Ninguno | Ninguno | `PortalProfileScreen` |
| `PortalProfileCompanySection` | Campos fiscales y acción visual de guardado | form, loading y callbacks | Ninguno | Ninguno | `PortalProfileScreen` |
| `PortalProfileSessionsSection` | Lista, estado vacío y acción visual de revocación | sessions y onRevoke | Ninguno | Ninguno | `PortalProfileScreen` |
| `PortalProfileSupportSection` | Canales visuales de soporte | dos callbacks | Ninguno | Ninguno | `PortalProfileScreen` |

Los componentes no importan stores, API, sesión, router, Linking, persistencia o timers. Las acciones externas llegan mediante callbacks.

## 6. Perfil, sesión y empresa

No cambiaron el usuario, sesión, empresa, rol, origen de datos o fallbacks. El formulario conserva:

- `name`, `email`, `phone`;
- `companyName`, `legalName`, `taxId`;
- `billingEmail`, `billingAddress`;
- inicialización desde `user` y `companyProfile`;
- fallback de correo fiscal al correo del usuario;
- campos, placeholders, accesibilidad, capitalización y estilos.

Perfil no ofrecía edición de rol o permisos. La autorización sigue a cargo del guard general y de la sesión; no se introdujo un RBAC local nuevo.

## 7. Formularios, validaciones y guardado

Permanecen en el contenedor:

- trim de todos los campos;
- lowercase para correos y uppercase para RFC;
- nombre obligatorio y máximo 100 caracteres;
- validación de formato de correo;
- RFC de 12 o 13 caracteres con la misma expresión regular;
- empresa con máximo 200 caracteres;
- payload con las mismas ocho propiedades;
- llamada única a `updateProfile`;
- mensajes de éxito y error;
- loading y texto `Guardando...`.

No cambió endpoint, método HTTP, secuencia o manejo de errores; la pantalla no realiza API directa.

## 8. Sesiones y soporte

Las sesiones conservan dispositivo, expiración, marca actual/activa, restricción para no cerrar la sesión actual y confirmación destructiva. `revokeSession` sigue ejecutándose desde el contenedor y limpia el objetivo solo cuando `result.ok`.

El correo comercial continúa abriendo `mailto:soporte@manecomb.com`. Soporte operativo continúa navegando a `/portal`. Los componentes presentacionales no navegan ni abren enlaces por sí mismos.

## 9. Estilos y código histórico

El `StyleSheet.create` completo se trasladó mecánicamente a `profile.styles.ts`, incluidas claves históricas sin consumidor actual. No se cambiaron valores visuales, textos, iconos o responsive.

El import histórico sin uso `portalButtonGradient` permanece en el contenedor y queda fuera de alcance; retirarlo sería una limpieza independiente.

## 10. Métricas

| Métrica | Resultado |
|---|---:|
| Líneas originales del contenedor | 377 |
| Líneas finales del contenedor | 173 |
| Reducción del contenedor | 204 (54.1 %) |
| Componentes extraídos | 4 |
| Archivos fuente nuevos | 7 |
| Archivos fuente modificados | 1 |
| Módulos de estilos | 1 |
| Módulos de tipos | 1 |
| Módulos de constantes | 0 |
| Módulos de utilidades | 1 |
| Diff del contenedor | 27 inserciones, 231 eliminaciones |
| Reporte nuevo | 1 |
| Archivos totales afectados | 9 |

## 11. Validaciones

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Aprobado, sin errores |
| `npm run build` | Aprobado; 630 módulos transformados |
| `npm run test` | No ejecutado: el script `test` no está definido en `ventas/package.json` |
| `npm run lint` | No ejecutado: el script `lint` no está definido en `ventas/package.json` |
| `git diff --check` | Aprobado |
| Dependencias | Cero dependencias nuevas |
| Package y lockfile | Sin cambios |
| Pureza de `profile.utils.ts` | Sin stores, API, navegación, setters, timers o persistencia |

### Runtime

La ruta pública, el bundle y el guard de autenticación fueron verificados. La visualización y actualización autenticada del perfil no pudieron validarse manualmente por falta de credenciales de prueba.

La apertura de `/portal/perfil` cargó sin errores de importación o evaluación y redirigió a `/ventas/login`, cuya interfaz se renderizó. No se utilizaron credenciales reales ni usuarios simulados.

## 12. Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió el export público o la ruta? | NO |
| ¿Cambió el usuario o la sesión? | NO |
| ¿Cambió la empresa o el rol? | NO |
| ¿Cambió algún permiso o RBAC? | NO |
| ¿Cambió algún campo o validación? | NO |
| ¿Cambió algún payload, endpoint o acción? | NO |
| ¿Cambió el store o la API? | NO |
| ¿Cambió la navegación? | NO |
| ¿Cambió la UI o responsive? | NO |
| ¿Se agregaron dependencias? | NO |
| ¿Se modificó RC-PORTAL-09? | NO |
| ¿Typecheck aprobó? | SÍ |
| ¿Build aprobó? | SÍ |

## 13. Archivos incluidos

Modificado:

- `ventas/features/portal/screens/portal-profile-screen.tsx`

Creados:

- `ventas/features/portal/profile/components/portal-profile-personal-section.tsx`
- `ventas/features/portal/profile/components/portal-profile-company-section.tsx`
- `ventas/features/portal/profile/components/portal-profile-sessions-section.tsx`
- `ventas/features/portal/profile/components/portal-profile-support-section.tsx`
- `ventas/features/portal/profile/profile.styles.ts`
- `ventas/features/portal/profile/profile.types.ts`
- `ventas/features/portal/profile/profile.utils.ts`
- `RC-PORTAL-10.md`

## 14. Rollback

```bash
git revert <HASH_RC_PORTAL_10>
```

El rollback se documenta y no se ejecuta durante esta RC.
