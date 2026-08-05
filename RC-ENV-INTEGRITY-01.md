# RC-ENV-INTEGRITY-01 — Integridad de entornos y conexiones

**Fecha:** 2026-08-05  
**Repositorio:** `ErickRFM/ManeComb`  
**Rama:** `audit/environment-integrity-20260805-v2`  
**Pull Request:** `#13`  
**Base integrada:** `main@9362f3761658f94201baa2fe5b191db29a3860c7`  
**Veredicto:** `READY_FOR_REVIEW_AND_MERGE`

## 1. Objetivo

Cerrar la integridad técnica del monorepo ManeComb para que Backend, Communication Service, Ventas/Portal, Mobile, Admin Global, Docker y CI compartan contratos reproducibles de instalación, construcción, variables, red y seguridad.

La RC no cambia credenciales ni configuraciones dentro de Render, Cloudflare, MongoDB Atlas, Resend, Twilio, TURN o Mercado Pago. Tampoco modifica lógica funcional de pagos, correo, GPS, Seguimiento o RTC fuera de los ajustes estrictamente necesarios para construir y conectar los artefactos.

## 2. Alcance revisado

| Área | Alcance |
|---|---|
| Git | ramas, temporales versionados, archivos de entorno y trazabilidad de cambios |
| CI | Backend, Communication Service, Mobile, APK Android, Ventas, Admin Global, Docker, Compose y dependencias |
| Backend | arranque, MongoDB, Redis, CORS, URLs públicas, pagos, correo, mapas, Platform Admin y RTC |
| Web | resolución de API/Socket, builds Vite, rutas SPA y Cloudflare Pages |
| Mobile | resolución de API/Socket, Producción, Sandbox, desarrollo LAN y Android |
| Docker | contexto del monorepo, dependencias hermanas, healthchecks y smoke tests |
| Seguridad | secretos versionados, URLs inseguras y vulnerabilidades altas de dependencias de ejecución |
| Operación | documentación reproducible y separación entre código certificado y paneles externos |

## 3. Topología certificada

| Artefacto | Fuente | Conexión principal | Validación |
|---|---|---|---|
| Backend | `backend/` | MongoDB externo, Redis opcional, servicios externos | pruebas + contenedor real |
| Communication Service | `communication-service/` | importado por Backend como paquete hermano | pruebas independientes + imagen Backend |
| Ventas/Portal | `ventas/` | `VITE_API_URL` y `VITE_SOCKET_URL` | typecheck + build + fallback SPA |
| Mobile | `mobile/` | `MANECOMB_API_URL` y `MANECOMB_SOCKET_URL` | typecheck + lint + tests + APK debug |
| Admin Global | `admin-global/` | `VITE_API_URL`; proxy local a puerto 5000 | typecheck + build + fallback SPA |
| Docker | raíz del monorepo | API, web, Redis y Nginx | Compose + builds + smoke HTTP |

MongoDB no se agregó al Compose porque el contrato existente usa una URI externa por ambiente. Introducir una base local distinta habría modificado persistencia, semillas y comportamiento operativo fuera del alcance de esta RC.

## 4. Hallazgos corregidos

### ENV-01 — Backend Docker incompleto

**Severidad:** alta  
**Problema:** `backend/` importa `communication-service/` como carpeta hermana, pero la imagen previa se construía con un contexto que no garantizaba incluir ni instalar esa dependencia.  
**Corrección:** `backend/Dockerfile` ahora se construye desde la raíz, instala ambos locks y copia ambos paquetes con una estructura determinista.  
**Control:** CI construye la imagen y levanta el contenedor.

### ENV-02 — Build web Docker fuera de la estructura real

**Severidad:** alta  
**Problema:** `mobile/Dockerfile.web` copiaba `ventas/` sin conservar `shared/`, aunque Vite resuelve `@shared` fuera de esa carpeta. El build local pasaba y el contenedor fallaba.  
**Corrección:** la imagen conserva `/app/ventas` y `/app/shared`, reproduciendo el monorepo.  
**Control:** smoke de contenedor web en cada PR.

### ENV-03 — Mobile podía ignorar un backend LAN válido

**Severidad:** alta  
**Problema:** una URL HTTP privada para desarrollo podía ser descartada y provocar un fallback silencioso a Producción.  
**Corrección:** se separó `runtime-url.ts`; HTTP local solamente se acepta con runtime de desarrollo, HTTPS explícito sirve para Sandbox/Preview y un build operativo conserva el destino seguro.  
**Control:** pruebas unitarias para HTTPS configurado, LAN permitida/rechazada, fallback, `/api` y Socket.

### ENV-04 — Admin Global usaba un puerto distinto al Backend

**Severidad:** media  
**Problema:** el proxy local podía apuntar a `4000` mientras Backend usa `5000`.  
**Corrección:** `API_PORT=5000`; validación de rango; `VITE_API_URL` obligatorio en build; rechazo de credenciales y protocolos no HTTP(S).  
**Control:** typecheck y build en CI.

### ENV-05 — Contratos de entorno incompletos

**Severidad:** media  
**Problema:** el `.env.example` raíz aparentaba ser suficiente, mientras el Backend consume Mongo, Platform, CORS, pagos, correo, mapas, documentos, RTC, Redis y aprendizaje de rutas.  
**Corrección:** el archivo raíz ahora dirige a contratos por artefacto; `backend/.env.example` documenta variables, aliases, defaults seguros y dependencias condicionales.  
**Control:** `scripts/validate-environment-contract.mjs` falla ante claves faltantes, archivos `.env` prohibidos, temporales RC, defaults inseguros, SPA rota o Docker incompleto.

### ENV-06 — Cobertura CI parcial

**Severidad:** media  
**Problema:** no había gates completos para Communication Service, Admin Global, infraestructura ni seguridad de locks.  
**Corrección:** la matriz permanente valida Backend, Communication Service, Mobile, Android APK, Ventas, Admin Global, Compose, Docker, smoke HTTP y auditoría de dependencias de ejecución.  
**Control:** workflows de solo lectura salvo operaciones temporales ya eliminadas.

### ENV-07 — Rutas SPA no garantizadas

**Severidad:** media  
**Problema:** una recarga directa de `/reset-password`, `/portal` u otra ruta podía depender de configuración manual del proveedor.  
**Corrección:** `_redirects` versionado para Ventas y Admin Global.  
**Control:** CI confirma que Vite lo copia a `dist` y el contenedor Nginx sirve rutas directas.

### ENV-08 — URLs web inválidas detectadas demasiado tarde

**Severidad:** media  
**Problema:** un deployment podía compilar con una URL vacía, malformada, con credenciales o protocolo no permitido.  
**Corrección:** Ventas y Admin Global validan las URLs durante el build. Las rutas relativas siguen permitidas para el proxy Nginx del mismo origen.  
**Control:** builds CI usan dominios `.invalid`, nunca los servicios reales.

### ENV-09 — Dependencias de ejecución con alertas altas

**Severidad:** alta  
**Problema:** los locks reportaban cadenas vulnerables en Backend, Communication Service, Mobile y Ventas.  
**Corrección:** actualización reproducible de locks dentro de rangos declarados y actualización controlada de Nodemailer a una rama segura. No se utilizó `npm audit fix --force`.  
**Control:** `npm audit --omit=dev --audit-level=high` para los cinco artefactos. Resultado de cierre: cero vulnerabilidades altas conocidas en dependencias de ejecución según la base de npm al momento de la RC.

### ENV-10 — Higiene de Git

**Severidad:** baja  
**Problema:** `.tmp-rc-communication-deploy-01-clean` permanecía versionado como copia temporal extensa.  
**Corrección:** eliminación del temporal, reglas `.gitignore`/`.dockerignore` y detección automática de nuevos `.tmp-*`, `.env`, APK, keystores y artefactos locales.  
**Control:** contrato de entorno en CI.

## 5. Matriz de validación obligatoria

| Gate | Criterio |
|---|---|
| Backend tests | instalación reproducible y suite completa verde |
| Communication Service | suite independiente verde |
| Mobile typecheck | sin errores TypeScript |
| Mobile lint | sin violaciones ESLint |
| Mobile tests | suites operativas, RTC, GPS, mapa, navegación y runtime verdes |
| Android debug APK | Gradle `assembleDebug` y artefacto generado |
| Ventas | typecheck, build y `dist/_redirects` |
| Admin Global | typecheck, build y `dist/_redirects` |
| Environment contract | variables, defaults, secretos y archivos versionados válidos |
| Compose | configuración de desarrollo y producción válida |
| Backend Docker | imagen incluye Communication Service |
| Runtime smoke | health, planes, raíz web, `/reset-password` y `/portal` responden |
| Dependency audit | cero hallazgos altos de runtime en los cinco artefactos |

El PR solamente conserva el veredicto `READY_FOR_REVIEW_AND_MERGE` mientras todos los checks del `HEAD` actual estén verdes.

## 6. Separación de ambientes

### Producción de referencia

- Backend: `https://manecomb.onrender.com`
- Cloudflare Pages: `https://manecomb1.pages.dev`
- Dominio público: `https://manecomb.com`

### Sandbox/Preview de referencia

- Backend: `https://manecomb-backend-sandbox.onrender.com`
- Preview observado previamente: `https://ec2a866e.manecomb1.pages.dev`
- Base declarada previamente: `manecomb_sandbox`

Estas referencias provienen del contexto operativo previo y no fueron reprovisionadas ni reconfiguradas en esta auditoría Git. El código evita que CI dependa de ellas y documenta que API y Socket deben pertenecer al mismo ambiente.

## 7. Controles de seguridad

- No se agregaron tokens, contraseñas, URIs de Mongo, JWT, claves Mapbox, Resend, Twilio, TURN, Mercado Pago, CLABE ni keystores.
- Ningún workflow temporal con `contents: write` permanece en la rama.
- Los workflows permanentes usan `contents: read`.
- Los valores `VITE_*` y `MANECOMB_*` públicos están separados de secretos del servidor.
- Producción rechaza configuraciones críticas inválidas en el Backend.
- El audit de runtime bloquea hallazgos altos nuevos.
- No se ejecutó un upgrade mayor indiscriminado ni se deshabilitaron pruebas para obtener verde.

## 8. Límites de la certificación

Git y CI certifican código, contratos, builds y contenedores. No pueden demostrar por sí solos el valor real de secretos ni el estado actual de proveedores externos.

Después del merge/despliegue deben comprobarse externamente:

1. variables exactas de Render para Producción y Sandbox;
2. variables separadas de Cloudflare Production y Preview;
3. DNS, TLS y dominios personalizados;
4. conexión efectiva a la base Mongo correcta;
5. Redis/colas cuando estén activados;
6. envío real de Resend y Twilio;
7. TURN/WebRTC desde redes reales;
8. credenciales, webhook y estados de Mercado Pago si se reactiva ese proveedor;
9. CORS desde el dominio exacto desplegado;
10. logs y health posteriores al despliegue.

Estos puntos son gates operativos posteriores, no defectos pendientes del código de esta RC.

## 9. Procedimiento de merge y despliegue

1. Confirmar que `main` no avanzó después de la certificación; si avanzó, integrarlo y repetir CI.
2. Confirmar PR mergeable, sin conflictos y con todos los checks verdes.
3. Fusionar el PR `#13` desde GitHub.
4. Identificar el SHA exacto desplegado por Render y Cloudflare.
5. Comprobar `/api/health/live`, `/api/health`, `/api/commercial/plans`, login y Socket.IO.
6. Abrir y recargar `/reset-password?token=test` y `/portal` en Cloudflare.
7. Confirmar que Preview usa Sandbox y Producción usa Producción.
8. Observar logs durante la ventana de despliegue.
9. Ante regresión, revertir el merge y redesplegar el SHA previo de `main`; no editar datos ni secretos para ocultar el fallo.

## 10. Cierre

La topología del monorepo quedó reproducible, las conexiones por ambiente quedaron explícitas, los artefactos se prueban de forma independiente e integrada, Docker representa las dependencias reales y las dependencias de ejecución quedan vigiladas.

No se modificó Producción, no se cambiaron secretos y este reporte no autoriza un despliegue sin los gates operativos posteriores.

**Veredicto final de código:** `READY_FOR_REVIEW_AND_MERGE`  
**Merge ejecutado:** `NO`  
**Pendiente:** revisión humana, merge posterior y smoke del deployment real.
