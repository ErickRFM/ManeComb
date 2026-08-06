# PHASE-1 — Auditoría de identidad, canal de cuenta y destino autenticado

## Estado

```text
PHASE_1_IMPLEMENTED
PHASE_1_VALIDATION_RUNNING
PHASE_1_NOT_READY_TO_MERGE
```

| Dato | Valor |
|---|---|
| Repositorio | `ErickRFM/ManeComb` |
| Rama | `fix/auth-account-channel-authority` |
| Base exacta | `624816d052bceb16d491b321b2dbfcc175037233` |
| Pull request | `#48` |
| Fecha | 2026-08-06 |
| Merge permitido | No, hasta certificación completa |

---

# 1. Diccionario canónico

Estos términos no son equivalentes y no deben volver a reutilizarse para decisiones distintas.

| Campo | Significado único | No significa |
|---|---|---|
| `accountChannel` | Producto al que pertenece la identidad | Estado del pago o permiso para una acción |
| `canAccessPortal` | Puede montar el Portal empresarial | Puede entrar a Mobile |
| `canAccessMobile` | Puede entrar realmente a la app Mobile | Puede administrar operaciones desde Portal |
| `canUseOperations` | Puede consumir funciones operativas desde su producto autorizado | Canal de producto |
| `mobileBlockReason` | Causa por la que Mobile no se abre | Causa general de un endpoint operativo |
| `operationalBlockReason` | Causa por la que una función operativa está bloqueada | Destino posterior al login |
| `productDestination` | Nombre canónico del destino autenticado | Capability o rol |
| `productRoute` | Ruta canónica del producto | Ruta operativa simulada dentro de Ventas |

## Canales

```text
company_portal    -> Ventas / Portal empresarial
mobile_operations -> app Mobile
platform_admin    -> Admin Global
blocked           -> ningún producto protegido
```

---

# 2. Reglas de clasificación

## Canal empresarial

Roles permitidos con `accountType=company_owner`:

- `owner`
- `admin`
- `billing_manager`
- `support`
- `viewer`

## Canal operativo

Roles permitidos con `accountType=operations`:

- `owner`
- `admin`
- `dispatcher`
- `supervisor`
- `driver`
- alias legado `conductor`

## Canal Platform

Roles reconocidos:

- `platform_owner`
- `platform_admin`
- `platform_support`
- `platform_auditor`

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

| Identidad | Estado comercial/tenant | Canal | Portal | Mobile | Operaciones | Destino |
|---|---|---|---:|---:|---:|---|
| Empresa | Sin plan | `company_portal` | Sí | No | No | `/portal/plan` |
| Empresa | Pago pendiente | `company_portal` | Sí | No | No | `/portal/pagos` |
| Empresa | Plan activo, tenant ausente | `company_portal` | Sí | No | No | `/portal/onboarding` |
| Empresa | Plan o trial activo | `company_portal` | Sí | No | Sí | `/portal` |
| Conductor/operativo | Sin plan | `mobile_operations` | No | No | No | `/plan-blocked` |
| Conductor/operativo | Pago pendiente | `mobile_operations` | No | No | No | `/plan-blocked` |
| Conductor/operativo | Plan activo, tenant ausente | `mobile_operations` | No | No | No | `/plan-blocked` |
| Conductor/operativo | Plan y tenant activos | `mobile_operations` | No | Sí | Sí | `/mapa` en Mobile |
| Platform | Identidad vigente | `platform_admin` | No | No | Según política Platform | `/platform` |
| Cualquiera | Suspendida/incompatible | `blocked` | No | No | No | `/access-blocked` |

---

# 4. Fronteras visibles

## Ventas / Portal

- `/portal` y todas sus subrutas exigen `company_portal`.
- Una cuenta `mobile_operations` recibe un aviso en `/acceso-operativo`.
- Ventas ya no monta rutas `/mapa` ni `/radio`.
- El aviso operativo dice que la operación ocurre en la app Mobile; no simula el producto.
- Una identidad Platform recibe `/acceso-admin`.
- Una identidad bloqueada recibe `/acceso-restringido`.

## Mobile

- `accountChannel=mobile_operations` es requisito previo a `canAccessMobile=true`.
- Una cuenta `company_portal` no entra al mapa aunque una respuesta heredada envíe accidentalmente `canAccessMobile=true`.
- `wrong_channel` no se presenta como plan vencido.
- `account_blocked` no se presenta como error de sincronización.

## Backend

- El canal se resuelve antes de que los clientes decidan una ruta.
- Login, registro, refresh, `/auth/me`, `/auth/session` y activación de conductor exponen el mismo contrato.
- El repositorio de usuarios normaliza MongoDB y store embebido.
- Los endpoints operativos usan `operationalBlockReason`.

---

# 5. Intenciones de navegación

El orden obligatorio en Ventas es:

```text
1. conservar compra pendiente;
2. conservar recuperación de contraseña y parámetros de compra;
3. resolver canal de cuenta;
4. dirigir al producto correcto;
5. fallar cerrado si el canal es inválido.
```

La compra pendiente se conserva antes del redirect normal por canal. La recuperación conserva `planId` y `requestTrial` hasta regresar a login y checkout.

---

# 6. Pruebas incorporadas

## Backend

- matriz completa de roles y canales;
- combinaciones inválidas;
- cuenta suspendida;
- usuario ausente;
- plan activo sin tenant para empresa y conductor;
- empresa con/sin plan, pago pendiente, trial y plan vencido;
- conductor con/sin acceso;
- serialización sin campos sensibles;
- smoke de registro, login, sesión restaurada, pago y endpoints operativos;
- regresión comercial/Mercado Pago.

## Ventas

El gate `verify:account-routing` comprueba:

- AND heredado en lugar de OR;
- guard global de Portal;
- ausencia de `/mapa` y `/radio` en Ventas;
- aviso canónico para Mobile;
- salidas separadas para Platform y cuenta bloqueada;
- compra pendiente antes del redirect por canal;
- recuperación con `planId` y `requestTrial` preservados.

## Mobile

- acceso válido de `mobile_operations`;
- rechazo de `company_portal`, `platform_admin` y `blocked`;
- prioridad del contexto vigente sobre caché;
- compatibilidad heredada cerrada;
- bloqueo por plan, pago, tenant y sincronización;
- sesión cacheada sin concesión local de permisos.

---

# 7. Evidencia pendiente para cierre

- [ ] Backend completo verde.
- [ ] Smoke integral verde.
- [ ] Regresión comercial verde.
- [ ] Mobile typecheck verde.
- [ ] Mobile tests verdes.
- [ ] Ventas typecheck verde.
- [ ] Ventas contratos verdes.
- [ ] Ventas build verde.
- [ ] Dependency audit verde.
- [ ] APK Android debug generado.
- [ ] Deployments aplicables verdes.
- [ ] Cero review threads.
- [ ] SHA final congelado y registrado.

El documento se actualizará con IDs de workflows, artefacto APK, SHA final y veredicto únicamente después de que cada evidencia exista.
