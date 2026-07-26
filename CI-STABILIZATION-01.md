# CI-STABILIZATION-01 — Restauración de GitHub Actions

## Estado

**Estado:** Cerrado técnicamente — pendiente de verificación remota
**Veredicto local:** CI_GREEN
**Docker image validation:** TEMPORARILY_DEFERRED

## Base

| Dato | Valor |
| --- | --- |
| Rama | `main` |
| Commit base | `2fae9f7` |
| Workflow | `.github/workflows/ci.yml` |
| Run analizado | [CI #128](https://github.com/ErickRFM/ManeComb/actions/runs/30183822884) |
| Estado inicial | Backend PASS; Mobile FAIL; Ventas FAIL |

La rama y `origin/main` estaban sincronizados al iniciar. El árbol estaba limpio y no existía merge, rebase, revert ni cherry-pick en curso.

## Fallos originales

| Job | Paso | Error exacto | Causa |
| --- | --- | --- | --- |
| Mobile quality | `Lint` — `npm run lint` | `mobile/src/screens/profile-screen.tsx:101:6 — React Hook useEffect has a missing dependency: 'user'` | La dependencia declarada era `user?.id`, pero el cuerpo del efecto capturaba el objeto `user`. ESLint `react-hooks/exhaustive-deps` lo clasificó como error. |
| Ventas build | `Build production web image` — `docker build ...` | Anotación de GitHub: `Process completed with exit code 1.` | Fallo exclusivo del paso Docker. En el mismo job, `npm ci`, typecheck y build finalizaron correctamente. La validación de la imagen queda fuera de alcance. |

GitHub también registró un warning no bloqueante en `mobile/src/screens/chat/hooks/use-chat-controller.ts:178`: la variable `socket` oculta otra declaración. No se modificó porque no causa el fallo y pertenece a trabajo concurrente.

Los datos de jobs, pasos y anotaciones se obtuvieron mediante la API pública de GitHub. La descarga del log interno de Docker requiere autenticación administrativa y el token local de `gh` estaba vencido; por ello no se atribuye una causa interna no verificada al Dockerfile.

## Correcciones

| Archivo | Corrección | Motivo |
| --- | --- | --- |
| `mobile/src/screens/profile-screen.tsx` | Se deriva `userId` y el efecto utiliza y declara ese mismo valor primitivo. | Satisfacer `react-hooks/exhaustive-deps` sin cambiar cuándo se consulta la documentación del usuario. |
| `.github/workflows/ci.yml` | Se retiró únicamente el paso `Build production web image`. | Docker fue diferido expresamente; se conservaron instalación, typecheck y build de Ventas. |
| `CI-STABILIZATION-01.md` | Reporte de evidencia y cierre. | Documentar causa, alcance, validaciones y trabajo diferido. |

## No cambios funcionales

```text
Lógica modificada: NO
Dependencias modificadas: NO
Contratos modificados: NO
Dockerfile modificado: NO
MFA modificado: NO
Mercado Pago modificado: NO
```

No se modificaron rutas, reducers, stores, servicios API, autenticación, MFA, permisos, pagos, navegación, estados operativos, persistencia, diseño ni pruebas.

## Docker

```text
Estado: TEMPORARILY_DEFERRED
Motivo: fuera del alcance solicitado
RC futura: DOCKER-WEB-01
```

No se modificaron `Dockerfile`, `Dockerfile.web`, archivos Compose, `.dockerignore` ni configuraciones de Nginx. Tampoco se usó `continue-on-error` ni un comando ficticio.

## Validaciones

| Área | Comando | Resultado |
| --- | --- | --- |
| Mobile | `npm ci` | PASS |
| Mobile | `npm run typecheck` | PASS |
| Mobile | `npm run lint` | PASS — 0 errores, 1 warning preexistente |
| Mobile | `npm test` | PASS — 26 suites, 134 pruebas |
| Ventas | `npm ci` | PASS |
| Ventas | `npm run typecheck` | PASS |
| Ventas | `npm run build` | PASS — 641 módulos |
| Backend | `npm ci` con Node 22.22.0 | PASS |
| Backend | `npm test` | PASS |
| Git | `git diff --check` | PASS |

Mobile y Ventas se validaron localmente con Node 24.18.0 porque Node 20 no está instalado en el entorno local. GitHub Actions conserva Node 20 y constituye la validación final del entorno objetivo. Backend se validó con Node 22.22.0, equivalente a la versión mayor del workflow.

`npm ci` no modificó `package.json` ni archivos `package-lock.json`. No se ejecutó `npm install`, `npm audit fix` ni actualización de dependencias.

## Revisión de seguridad y alcance

- No se añadieron secretos, credenciales, tokens ni cadenas de conexión.
- Los nombres de variables seguras existentes en el workflow permanecen sin valores reales.
- No se tocó código de administración, plataforma, Mercado Pago ni backend.
- No se modificó el warning preexistente de chat.
- La única modificación bajo `mobile/src` es la dependencia estable del efecto de perfil.

## Métricas

Las métricas definitivas se obtendrán del commit:

```text
Archivos afectados: 3
Archivos de código fuente modificados: 1
Workflow modificado: 1
Reporte nuevo: 1
Dependencias modificadas: 0
```

## Veredicto

```text
CI_GREEN
```

El veredicto queda sujeto a confirmar la nueva ejecución remota de GitHub Actions:

```text
Backend tests: PASS esperado
Mobile quality: PASS esperado
Ventas build: PASS esperado
Docker image validation: TEMPORARILY_DEFERRED
```
