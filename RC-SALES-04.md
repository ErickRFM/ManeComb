# RC-SALES-04 — Consolidación de utilidades compartidas entre pantallas de Ventas

## 1. Objetivo

Consolidar `formatCurrency` y `getFirstParam`, definidas idénticamente en múltiples módulos de pantalla (Sales, Checkout, Auth), en una única implementación compartida en `screens/shared/utils.ts`, preservando las APIs públicas originales de cada módulo.

## 2. Clasificación de duplicaciones

| Símbolo         | Clasificación                     | Justificación                                                                 |
|-----------------|-----------------------------------|------------------------------------------------------------------------------|
| `getFirstParam` | Duplicación exacta                | Firma y cuerpo idénticos en los 3 módulos                                   |
| `formatCurrency`| Duplicación estructural compatible| Mismo cuerpo y resultado; firma distinta (`value: number` vs `value?: number \| null`) |

### 2.1. `getFirstParam` — verificación de identidad

Las tres versiones originales (`sales/utils.ts`, `checkout/checkout.utils.ts`, `auth/auth.utils.ts`) comparten:

- Firma: `(value: string | string[] | undefined)`
- Implementación: `Array.isArray(value) ? value[0] : value`
- Tratamiento de arrays: devuelve el primer elemento
- Tratamiento de strings: devuelve el string intacto
- Tratamiento de `undefined`: devuelve `undefined`
- Valor de retorno: `string | string[] | undefined`

### 2.2. `formatCurrency` — verificación de compatibilidad

| Aspecto              | Sales original                          | Checkout original                     | Shared (unificada)                    |
|----------------------|-----------------------------------------|---------------------------------------|---------------------------------------|
| Firma                | `(value: number)`                       | `(value?: number \| null)`            | `(value?: number \| null)`            |
| locale               | `es-MX`                                 | `es-MX`                               | `es-MX`                               |
| currency             | `MXN`                                   | `MXN`                                 | `MXN`                                 |
| decimales            | `0`                                     | `0`                                   | `0`                                   |
| Fallback null/undefined | N/A (value siempre number)           | `Number(value \|\| 0)`                | `Number(value \|\| 0)`                |
| Formato salida       | `Intl.NumberFormat().format(value)`     | `Intl.NumberFormat().format(Number(value \|\| 0))` | `Intl.NumberFormat().format(Number(value \|\| 0))` |

**Comportamiento con distintos valores (idéntico entre Sales y Shared para el subset `number`):**

| Entrada   | Sales original | Shared (wrapper Sales) |
|-----------|---------------|----------------------|
| `1500`    | `$1,500`      | `$1,500`             |
| `0`       | `$0`          | `$0`                 |
| `undefined`| No aplica (TS) | No aplica (wrapper `(value: number)` rechaza en TS) |
| `null`     | No aplica (TS) | No aplica (wrapper `(value: number)` rechaza en TS) |

## 3. Archivos

### 3.1. Creado

```
A  ventas/screens/shared/utils.ts
```

Sin imports. Contiene únicamente las dos funciones compartidas. No importa Sales, Checkout, Auth, stores, API, router, Commercial ni Portal. Sin ciclos.

### 3.2. Modificados

```
M  ventas/screens/sales/utils.ts
M  ventas/screens/checkout/checkout.utils.ts
M  ventas/screens/auth/auth.utils.ts
```

### 3.3. APIs preservadas por módulo

| Archivo                           | Exporta antes                           | Exporta después                          | ¿Cambió? |
|-----------------------------------|-----------------------------------------|------------------------------------------|----------|
| `sales/utils.ts`                  | `formatCurrency(value: number)`         | `formatCurrency(value: number)` (wrapper)| NO       |
|                                   | `getFirstParam(...)`                    | `getFirstParam(...)` (re-export)         | NO       |
|                                   | `getPlanAccent`, `buildPlanParams`, ... | Sin cambios                              | NO       |
| `checkout/checkout.utils.ts`      | `formatCurrency(value?: number \| null)`| `formatCurrency(...)` (re-export)        | NO       |
|                                   | `getFirstParam(...)`                    | `getFirstParam(...)` (re-export)         | NO       |
|                                   | `openCheckoutUrl`, `getCheckoutMessage` | Sin cambios                              | NO       |
| `auth/auth.utils.ts`              | `getFirstParam(...)`                    | `getFirstParam(...)` (re-export)         | NO       |
|                                   | `buildPaymentRoute`, `normalizeIdentity`| Sin cambios                              | NO       |
|                                   | `formatCurrency`                        | No exportado (nunca lo estuvo)           | NO       |

**Nota:** Sales usa un wrapper typed `(value: number)` que delega en la implementación compartida de tipo más permisivo. Esto preserva el contrato TypeScript original sin cambiar el resultado en tiempo de ejecución.

## 4. Consumidores

### 4.1. `formatCurrency`

| Métrica               | Valor |
|-----------------------|------:|
| Archivos consumidores | 4     |
| Referencias totales   | 12    |

**Archivos consumidores** (importan `formatCurrency` desde su módulo de pantalla):
1. `screens/checkout/components/checkout-order-summary.tsx`
2. `screens/checkout/components/checkout-payment-section.tsx`
3. `screens/plan-checkout-screen.tsx`
4. `screens/sales/components/plan-card.tsx`

**Distribución de referencias (imports + llamadas):**

| Archivo                    | Import | Llamadas | Total |
|----------------------------|-------:|---------:|------:|
| checkout-order-summary.tsx | 1      | 4        | 5     |
| checkout-payment-section.tsx | 1    | 1        | 2     |
| plan-checkout-screen.tsx   | 1      | 1        | 2     |
| plan-card.tsx              | 1      | 2        | 3     |
| **Total**                  | **4**  | **8**    | **12**|

### 4.2. `getFirstParam`

| Métrica               | Valor |
|-----------------------|------:|
| Archivos consumidores | 4     |
| Referencias totales   | 13    |

**Archivos consumidores** (importan `getFirstParam` desde su módulo de pantalla):
1. `screens/sales-screen.tsx`
2. `screens/plan-checkout-screen.tsx`
3. `screens/sales-auth-screen.tsx`
4. `screens/sales/components/checkout-return-banner.tsx`

**Distribución de referencias (líneas con el símbolo, excluyendo definiciones y reexports):**

| Archivo                         | Líneas |
|---------------------------------|------:|
| sales-screen.tsx                | 5 (import + 4 llamadas) |
| plan-checkout-screen.tsx        | 3 (import + 2 llamadas) |
| sales-auth-screen.tsx           | 3 (import + 2 llamadas) |
| checkout-return-banner.tsx      | 2 (import + 1 llamada) |
| **Total**                       | **13**|

**Nota:** No se cuentan: definición compartida (`shared/utils.ts`), reexports (`sales/utils.ts:8-11`, `checkout/checkout.utils.ts:2`, `auth/auth.utils.ts:2`) ni menciones en este reporte.

## 5. Código sin referencias

Se detectaron cinco propiedades de `authPalette` (`auth/auth.constants.ts`) sin referencias directas en ningún archivo del proyecto:

```
accentRgb, iconDefault, iconFocus, placeholder, formBorder
```

Se conservaron porque su eliminación no forma parte de la consolidación de utilidades realizada en RC-SALES-04. No fueron validadas como necesarias; únicamente se preservaron por alcance.

| Métrica                                     | Respuesta |
|---------------------------------------------|-----------|
| ¿Se eliminó código sin uso?                 | NO        |
| ¿Se detectó código sin referencias?         | SÍ, cinco tokens de paleta |
| ¿Se modificó ese código?                    | NO        |

## 6. Métricas desde Git

```
$ git diff --stat
 ventas/screens/auth/auth.utils.ts         |  5 +----
 ventas/screens/checkout/checkout.utils.ts | 13 +------------
 ventas/screens/sales/utils.ts             | 13 +++----------
 3 files changed, 5 insertions(+), 26 deletions(-)

$ git diff --numstat
1       4       ventas/screens/auth/auth.utils.ts
1       12      ventas/screens/checkout/checkout.utils.ts
3       10      ventas/screens/sales/utils.ts
```

| Métrica                          | Valor |
|----------------------------------|------:|
| Archivos creados                 | 1 (`shared/utils.ts`, 11 líneas) |
| Archivos modificados             | 3     |
| Líneas agregadas (modificados)   | 5     |
| Líneas eliminadas (modificados)  | 26    |
| Cambio neto en archivos modific. | −21   |
| Líneas en shared/utils.ts        | 11    |
| Dependencias agregadas           | 0     |
| Lockfile modificado              | NO    |

## 7. Validaciones técnicas

| Validación        | Resultado                                       |
|-------------------|-------------------------------------------------|
| Typecheck         | Aprobado                                        |
| Build             | Aprobado                                        |
| Tests             | No ejecutados: el script `test` no está definido |
| `git diff --check`| Sin errores (solo advertencias CRLF inevitables) |
| Dependencias      | Ninguna agregada                                |
| Ciclos            | Ninguno (`shared/utils.ts` no tiene imports)    |
| Importaciones rotas| Ninguna (re-exports preservan rutas)           |
| Archivos fuera del alcance | Ninguno                             |

## 8. Matriz de compatibilidad final

| Pregunta                                   | Respuesta                                   |
|--------------------------------------------|---------------------------------------------|
| ¿Cambió el resultado de `formatCurrency`?  | NO                                          |
| ¿Cambió el resultado de `getFirstParam`?   | NO                                          |
| ¿Cambió la API original de Sales utils?    | NO                                          |
| ¿Cambió la API original de Checkout utils? | NO                                          |
| ¿Cambió la API original de Auth utils?     | NO                                          |
| ¿Se agregó `formatCurrency` a Auth?        | NO                                          |
| ¿Cambió algún consumidor?                  | NO, se preservaron rutas mediante reexports |
| ¿Cambió lógica comercial?                  | NO                                          |
| ¿Cambió la UI?                             | NO                                          |
| ¿Cambió la navegación?                     | NO                                          |
| ¿Cambió algún store?                       | NO                                          |
| ¿Cambió algún servicio?                    | NO                                          |
| ¿Cambió Portal Admin?                      | NO                                          |
| ¿Cambió Mobile?                            | NO                                          |
| ¿Cambió backend?                           | NO                                          |
| ¿Se agregaron dependencias?                | NO                                          |
| ¿Se eliminaron los tokens de paleta?       | NO                                          |
| ¿Typecheck aprobó?                         | SÍ                                          |
| ¿Build aprobó?                             | SÍ                                          |
| ¿`git diff --check` aprobó?                | SÍ                                          |

## 9. Pre-commit evidencia

```bash
$ git branch --show-current
main

$ git rev-parse --short HEAD
63724b0

$ git status --short
 M ventas/screens/auth/auth.utils.ts
 M ventas/screens/checkout/checkout.utils.ts
 M ventas/screens/sales/utils.ts
?? RC-SALES-04.md
?? ventas/screens/shared/

$ git diff --check
# Sin errores. Solo advertencias CRLF por normalización de línea en Windows.

$ git diff --name-only
ventas/screens/auth/auth.utils.ts
ventas/screens/checkout/checkout.utils.ts
ventas/screens/sales/utils.ts

$ git diff --stat
 ventas/screens/auth/auth.utils.ts         |  5 +----
 ventas/screens/checkout/checkout.utils.ts | 13 +------------
 ventas/screens/sales/utils.ts             | 13 +++----------
 3 files changed, 5 insertions(+), 26 deletions(-)
```

Archivos a incluir en el commit:
```
ventas/screens/shared/utils.ts         (nuevo)
ventas/screens/sales/utils.ts          (modificado)
ventas/screens/checkout/checkout.utils.ts (modificado)
ventas/screens/auth/auth.utils.ts      (modificado)
RC-SALES-04.md                          (nuevo)
```

## 10. Commit

```bash
$ git add ventas/screens/shared/utils.ts
$ git add ventas/screens/sales/utils.ts
$ git add ventas/screens/checkout/checkout.utils.ts
$ git add ventas/screens/auth/auth.utils.ts
$ git add RC-SALES-04.md
$ git commit -m "refactor(ventas): consolidate shared screen utilities"

$ git rev-parse --short HEAD
9c2a77f

$ git status --short
(árbol limpio)

$ git show --stat --oneline HEAD
9c2a77f refactor(ventas): consolidate shared screen utilities
 RC-SALES-04.md                            | 293 ++++++++++++++++++++++
 ventas/screens/auth/auth.utils.ts         |   5 +-
 ventas/screens/checkout/checkout.utils.ts |  13 +-
 ventas/screens/sales/utils.ts             |  13 +-
 ventas/screens/shared/utils.ts            |  11 ++
 5 files changed, 309 insertions(+), 26 deletions(-)

$ git show --name-status --format= HEAD
A  RC-SALES-04.md
M  ventas/screens/auth/auth.utils.ts
M  ventas/screens/checkout/checkout.utils.ts
M  ventas/screens/sales/utils.ts
A  ventas/screens/shared/utils.ts
```

## 11. Rollback

```bash
git revert 9c2a77f
```

No ejecutar el revert.

## 12. Matriz de cierre documental

| Pregunta                                     | Respuesta |
|----------------------------------------------|-----------|
| ¿Se consolidó duplicación exacta?            | SÍ (getFirstParam) |
| ¿Se consolidó duplicación estructural?       | SÍ (formatCurrency, firmas compatibles) |
| ¿Se preservó la API pública de cada módulo?  | SÍ |
| ¿Se verificaron consumidores?                | SÍ, con grep real |
| ¿Se documentaron tokens sin referencias?     | SÍ, sin modificar |
| ¿Las métricas provienen de Git?              | SÍ |
| ¿Se verificó con typecheck?                  | SÍ |
| ¿Se verificó con build?                      | SÍ |
| ¿Se verificó con `git diff --check`?         | SÍ |
| ¿El commit es independiente?                 | SÍ (9c2a77f) |
