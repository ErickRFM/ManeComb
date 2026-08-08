# PHASE-1 — Auditoría de identidad, canal de cuenta y destino autenticado

## Estado

```text
PHASE_1_IMPLEMENTED
PHASE_1_CORRECTED_20260808
```

| Dato | Valor |
|---|---|
| Repositorio | `ErickRFM/ManeComb` |
| Fase original | `fix/auth-account-channel-authority` / PR `#48` |
| Corrección | `fix/company-admin-mobile-access-20260808` |
| Fecha original | 2026-08-06 |
| Corrección de autoridad | 2026-08-08 |

> **Corrección 2026-08-08.** La implementación original trató `accountChannel` como exclusividad de producto y bloqueó Mobile para `company_owner` con rol `owner/admin`. Esa interpretación era incorrecta para ManeComb. `accountChannel` conserva el destino principal de la identidad en web, pero el acceso a superficies adicionales se decide por capabilities. Un `owner/admin` empresarial con plan y tenant activos conserva `company_portal` como destino web y además obtiene `mobile.access`.

---

# 1. Diccionario canónico

Estos términos no son equivalentes y no deben volver a reutilizarse para decisiones distintas.

| Campo | Significado único | No significa |
|---|---|---|
| `accountChannel` | Destino/producto principal de la identidad | Exclusividad absoluta sobre todas las demás superficies |
| `canAccessPortal` | Puede montar el Portal empresarial | Puede entrar a Mobile |
| `canAccessMobile` | Puede entrar realmente a la app Mobile según capability + estado comercial/tenant | Que su destino web deba ser Mobile |
| `canUseOperations` | Puede consumir funciones operativas autorizadas | Canal de producto |
| `mobileBlockReason` | Causa por la que Mobile no se abre | Causa general de un endpoint operativo |
| `operationalBlockReason` | Causa por la que una función operativa está bloqueada | Destino posterior al login |
| `productDestination` | Destino principal posterior al login en el producto actual | Lista total de superficies autorizadas |
| `productRoute` | Ruta principal del producto actual | Capability o rol |

## Canales principales

```text
company_portal    -> destino web de la empresa en Ventas / Portal
mobile_operations -> destino principal de identidades operativas en la app Mobile
platform_admin    -> Admin Global
blocked           -> ningún producto protegido
```

`company_portal` no implica “Portal únicamente”. Para `owner/admin` de empresa, la capability `mobile.access` habilita también la app.

---

# 2. Reglas de clasificación

## Identidad empresarial

Roles permitidos con `accountType=company_owner`:

- `owner`
- `admin`
- `billing_manager`
- `support`
- `viewer`

Capacidades de producto:

- `owner` y `admin`: `portal.access` + `mobile.access`.
- `billing_manager`, `support`, `viewer`: Portal únicamente salvo una futura capability explícita; no reciben Mobile por pertenecer a la empresa.

El registro público de Ventas crea `accountType=company_owner`; el backend asigna rol `owner`, por lo que la cuenta que compra/administra la flotilla es una identidad administrativa de empresa con acceso a Portal y, cuando el plan/tenant están activos, a Mobile.

## Identidad operativa

Roles permitidos con `accountType=operations`:

- `owner`
- `admin`
- `dispatcher`
- `supervisor`
- `driver`
- alias legado `conductor`

Estas identidades usan `mobile_operations` como canal principal y reciben `mobile.access` conforme a su matriz de capabilities.

## Canal Platform

Roles reconocidos:

- `platform_owner`
- `platform_admin`
- `platform_support`
- `platform_auditor`

Admin Global permanece separado del producto Mobile de empresas.

## Fallo cerrado

Una cuenta suspendida, un tipo desconocido o una combinación incompatible de `accountType` y `role` obtiene:

```text
accountChannel = blocked
canAccessPortal = false
canAccessMobile = false
canUseOperations = false
```

---

# 3. Matriz de comportamiento esperada

| Identidad | Estado comercial/tenant | Canal principal | Portal | Mobile | Operaciones | Destino principal |
|---|---|---|---:|---:|---:|---|
| Empresa `owner/admin` | Sin plan | `company_portal` | Sí | No (`no_plan`) | No | `/portal/plan` |
| Empresa `owner/admin` | Pago pendiente | `company_portal` | Sí | No (`payment_pending`) | No | `/portal/pagos` |
| Empresa `owner/admin` | Plan activo, tenant ausente | `company_portal` | Sí | No (`missing_tenant`) | No | `/portal/onboarding` |
| Empresa `owner/admin` | Plan o trial activo + tenant activo | `company_portal` | Sí | **Sí** | Sí | Web `/portal`; Mobile `/mapa` |
| Empresa `billing_manager/support/viewer` | Plan activo | `company_portal` | Sí | No (`wrong_channel`) | Según capability | `/portal` |
| Conductor/operativo | Sin plan | `mobile_operations` | No | No | No | `/plan-blocked` |
| Conductor/operativo | Pago pendiente | `mobile_operations` | No | No | No | `/plan-blocked` |
| Conductor/operativo | Plan activo, tenant ausente | `mobile_operations` | No | No | No | `/plan-blocked` |
| Conductor/operativo | Plan y tenant activos | `mobile_operations` | No | Sí | Sí | `/mapa` en Mobile |
| Platform | Identidad vigente | `platform_admin` | No | No | Según política Platform | `/platform` |
| Cualquiera | Suspendida/incompatible | `blocked` | No | No | No | `/access-blocked` |

---

# 4. Fronteras y frases visibles

## Ventas / Portal

- `/portal` y todas sus subrutas exigen una identidad empresarial autorizada para Portal.
- Una cuenta cuyo canal principal es `mobile_operations` recibe `/acceso-operativo` con `CUENTA OPERATIVA` y `Continúa en la app móvil`.
- Ventas no monta una segunda implementación de `/mapa` ni `/radio`.
- El aviso operativo explica que mapa, GPS, rutas, Radio, Chat y llamadas viven en Mobile; no simula ese producto dentro de Ventas.
- Una identidad Platform recibe `/acceso-admin` con `Usa Admin Global`.
- Una identidad bloqueada recibe `/acceso-restringido` con `Cuenta sin producto autorizado`.
- Que un `owner/admin` empresarial tenga `canAccessMobile=true` no cambia su destino web: en Ventas sigue entrando a `/portal`.

## Compra y demo

- El botón principal conserva la frase `Elegir plan`.
- Solo un plan con `trialEligible=true` y `trialDays>0` muestra la acción secundaria.
- La frase canónica es `Usar demo {trialDays} días`; para `starter-2` es `Usar demo 7 días`.
- La acción de demo ejecuta el mismo checkout con `requestTrial=true`; no es decorativa.
- `planId` y `requestTrial` sobreviven registro, login y recuperación de contraseña.
- La cuenta registrada desde Ventas como `company_owner` es creada por backend con rol `owner` y no debe perder acceso administrativo Mobile al activar plan/trial.

## Mobile

- Mobile confía en la decisión vigente del backend `canAccessMobile`; no deriva autorización únicamente desde `accountChannel`.
- `mobile_operations` autorizado entra normalmente a Mobile.
- `company_portal` con `accountType=company_owner` y rol `owner/admin` entra a Mobile cuando `canAccessMobile=true`.
- `billing_manager`, `support` y `viewer` no obtienen Mobile por accidente aunque pertenezcan a una empresa.
- `platform_admin` y `blocked` continúan fallando cerrados.
- `wrong_channel` no se presenta como plan vencido.
- `account_blocked` no se presenta como error de sincronización.
- Una sesión cacheada sin decisión vigente del backend no concede permisos localmente.

## Backend

- El canal principal se resuelve antes de que los clientes decidan una ruta.
- La capacidad de Mobile se resuelve con `mobile.access`, no con igualdad rígida `accountChannel === mobile_operations`.
- Plan/trial y tenant deben estar activos para materializar `canAccessMobile=true`.
- Login, registro, refresh, `/auth/me`, `/auth/session` y activación de conductor exponen el mismo contrato.
- El repositorio de usuarios normaliza MongoDB y store embebido.
- Los endpoints operativos usan `operationalBlockReason`.

---

# 5. Intenciones de navegación

El orden obligatorio en Ventas es:

```text
1. conservar compra pendiente;
2. conservar recuperación de contraseña y parámetros de compra;
3. resolver identidad y destino principal;
4. dirigir al producto web correcto;
5. conservar capabilities para otras superficies autorizadas;
6. fallar cerrado si la identidad es inválida.
```

La compra pendiente se conserva antes del redirect normal. La recuperación conserva `planId` y `requestTrial` hasta regresar a login y checkout.

En Mobile el orden es:

```text
1. exigir usuario y contexto vigente;
2. bloquear blocked/platform_admin;
3. leer canAccessMobile emitido por backend;
4. validar que la combinación accountType/role sea elegible para Mobile;
5. entrar a /mapa o devolver la causa real del bloqueo.
```

---

# 6. Pruebas de autoridad

## Backend

La suite debe fijar:

- `company_owner + owner` con plan activo: `canAccessPortal=true` y `canAccessMobile=true`;
- `company_owner + admin` con plan activo: `canAccessPortal=true` y `canAccessMobile=true`;
- owner/admin sin plan o con pago pendiente: Mobile bloqueado por la causa comercial real, no por `wrong_channel`;
- `billing_manager` empresarial: Portal sí, Mobile no;
- conductor/operativo con plan y tenant activos: Mobile sí;
- combinaciones inválidas y cuentas suspendidas: fallo cerrado;
- Platform: sin `mobile.access`.

## Mobile

La suite debe fijar:

- acceso válido de `mobile_operations`;
- acceso válido de `company_owner` con rol `owner/admin` cuando backend devuelve `canAccessMobile=true`;
- rechazo de roles empresariales sin `mobile.access`;
- rechazo de `platform_admin` y `blocked`;
- prioridad del contexto vigente sobre caché;
- bloqueo por plan, pago, tenant y sincronización;
- sesión cacheada sin concesión local de permisos.

## Navegador autenticado local

`local-account-channel.spec.ts` mantiene separadas navegación web y capabilities:

- una empresa `owner` permanece en `/portal` en web aunque el contrato también declare `canAccessMobile=true`;
- `mobile_operations` termina en `/acceso-operativo` desde Ventas;
- `platform_admin` termina en `/acceso-admin`;
- `blocked` termina en `/acceso-restringido`.

La matriz captura evidencia, verifica ausencia de errores JavaScript y respuestas 5xx, y comprueba overflow.

---

# 7. Invariante definitivo

```text
accountChannel = destino principal
capabilities   = superficies y acciones autorizadas
```

Nunca volver a usar `accountChannel` como sustituto de capabilities.

Para una cuenta administrativa de empresa activa:

```text
accountType       = company_owner
role              = owner | admin
accountChannel    = company_portal
portal.access     = true
mobile.access     = true
canAccessPortal   = true
canAccessMobile   = true  (solo con plan/trial + tenant activos)
web destination   = /portal
mobile destination= /mapa
```
