# Ventas / Portal empresarial — auditoría de producto 2026-08-10

## Baseline y aislamiento

- Baseline: `origin/main@0ac4b306cfc34bf1a2acdd236c66eaeea3429f14`.
- Rama: `codex/ventas-portal-product-evolution-20260810`.
- Alcance de implementación: `ventas/`.
- No se modifica Admin Global. Mobile, Backend y Communication Service permanecen como autoridades externas.
- No había PRs abiertos al iniciar. Las ramas remotas antiguas que tocan Ventas no se integran individualmente. El contrato latest-wins de planeación ya está en `main` y pasa `verify:route-plan-authority`.

## Arquitectura encontrada

| Capa | Autoridad y responsabilidad | Hallazgo |
| --- | --- | --- |
| Sesión | `useAppStore`, `/auth/*` y sesión del backend | El backend decide canal, capabilities y acceso. Ventas conserva sesión/UI. |
| Portal | `usePortalStore` + endpoints `/portal`, `/account`, `/admin` | Zustand almacena server state heterogéneo con TTL, error, loading y submitting globales. |
| Operación | snapshots/endpoints backend + Socket.IO | Dashboard reconcilia snapshots; el frontend no debe inventar GPS, jornadas, incidencias ni asignaciones. |
| Comercial | catálogo/checkout backend + adaptadores comerciales | El frontend orquesta intención e idempotencia, no decide pago ni activación. |
| Rutas | backend/Mapbox; `latest-route-plan-authority` en cliente | La respuesta más reciente gana. El gate existe y está verde. |
| Navegación | router web propio + `PORTAL_ROUTE_REGISTRY` | Guards y permisos están centralizados, pero la IA repetía Perfil como Empresa, Seguridad y Soporte. |

## Inventario de superficies

| Superficie | Propósito / usuario | Fuente y mutaciones | Estados y riesgos principales |
| --- | --- | --- | --- |
| Landing | Explicar producto y llevar a registro/checkout | Catálogo comercial público | Buen lazy loading; chunk de 184.51 KB. Contenido extenso. |
| Login/registro | Crear o restaurar identidad | Auth backend | Conserva canal y checkout intent. Debe resistir 401/429 sin destruir sesión válida. |
| Recuperación | Recuperar acceso | Auth backend + sesión efímera local | Rutas profundas presentes; no persistir secretos. |
| Checkout/retornos | Iniciar trial o pago | Comercial backend; idempotency key | Backend decide estado durable. Proteger doble click, pending y retorno tardío. |
| Términos/privacidad/404 | Cierre legal y navegación segura | Estático | Contenido actual mínimo; requiere revisión legal fuera de código. |
| Dashboard | Entender operación y atención inmediata | overview, unidades, rutas, snapshots y socket | Es la superficie más densa. Tiene caches locales legítimos, pero loading local y global conviven. |
| Equipo | Administrar lifecycle permitido | users/assignments backend | No crea conductores fuera del contrato de activación. Falta master-detail persistente en desktop. |
| Unidades | Gestionar activo central de flota | vehicles y autoridad operacional | Lista contextual útil; mutaciones comparten submitting global de AppStore. |
| Rutas | Diseñar, asignar y revisar | navegación backend + Mapbox | Latest-wins correcto. Pantalla de 723 LOC y mapa de 911 LOC; separar sólo responsabilidades demostradas. |
| Documentos | Revisar evidencia asociada | documents backend | Búsqueda/filtros presentes. No debe convertirse en autoridad documental. |
| Incidencias | Priorizar y resolver | incidents backend + capabilities | Lista/detalle y status autorizado. Error global puede contaminar otros módulos. |
| App móvil | Descargar/administrar release permitido | app info backend | Separación de capability existente. |
| Plan | Entender/cambiar suscripción | account subscription backend | Correctamente separado de pagos y facturación. |
| Pagos | Método/estado/pending/SPEI | payment backend | Manual evidence es durable; evitar promesas de proveedor. |
| Facturación | Comprobantes/descarga | invoices backend | Un fallo de descarga no debe ensuciar Dashboard. |
| Perfil/empresa/seguridad/soporte | Cuenta y organización | user, company profile, sessions | Las secciones existen, pero estaban duplicadas como destinos de navegación de primer nivel. |
| Onboarding | Activación real de flota | onboarding + activation keys | Respeta cupos y lifecycle. |

## Prioridades

### P0

No se encontró un bypass de acceso, duplicación de autoridad de pago/GPS/RTC ni pérdida demostrada de datos dentro de Ventas en el baseline.

### P1

1. **Estado asíncrono global entre dominios.** `isLoading`, `isSubmitting` y `error` pertenecen a todo el Portal. Una operación de un módulo puede bloquear otro y un fallo irrelevante puede aparecer en otra pantalla.
2. **Carga amplia desde layout.** `PortalLayout -> loadAll` solicita overview, subscription, onboarding, activation keys, invoices opcionales y sesiones aun cuando la ruta no necesita todo.
3. **Riesgo de respuesta vieja.** `loadAll` evita duplicados con una promesa global, pero no versiona cada recurso; un refetch amplio puede sobrescribir una actualización socket más reciente.
4. **Mapa de dependencias pesado.** Mapbox (~981 KB sin gzip) es justificable y debe seguir lazy; la fuente completa de iconos (~1.12 MB) domina el payload estático.

### P2

1. Navegación con Cuenta/Administración/Ayuda mezclaba operación, billing y tres enlaces al mismo Perfil.
2. Dashboard, Routes, `operations-map` y `portal-layout` concentran responsabilidades reales; requieren extracción selectiva, no fragmentación por LOC.
3. Responsive usa pocos breakpoints funcionales. Debe verificarse en 360/390/430/768/1024/1280/1440/1920, baja altura, zoom y texto largo.
4. Los feedbacks de error son principalmente globales; conviene acercarlos a la acción que falló.

## Benchmark aplicable

- **Motive:** lista de vehículos con búsqueda/filtros y perfil detallado; resumen de conductor con acciones pendientes y actividad reciente. Aplicación: master-detail para Equipo/Unidades usando únicamente datos existentes. No copiar scores, HOS ni métricas que ManeComb no produce.
- **Samsara:** prioriza alertas accionables y consolida estado/historial por activo. Aplicación: action center del Dashboard y ficha contextual. No copiar mantenimiento predictivo ni IA inexistente.
- **Fleetio:** dashboards configurables para reducir sobrecarga y visibilidad por rol. Aplicación: jerarquía y permisos, no widgets decorativos ni personalización sin demanda.

Fuentes oficiales consultadas:

- https://helpcenter.gomotive.com/hc/en-us/articles/30922645387037-Vehicle-Lists
- https://helpcenter.gomotive.com/hc/en-us/articles/31437528306461-Driver-Summary
- https://www.samsara.com/uk/products/telematics/fleet-maintenance
- https://www.fleetio.com/features/fleet-management-dashboards

## Métricas baseline

- Build Vite: 643 módulos, 6.46 s en la estación de auditoría.
- `dist`: 3312.54 KB sin comprimir.
- Entry compartido: 583.51 KB / 182.51 KB gzip.
- Mapbox chunk: 1004.98 KB / 281.79 KB gzip.
- Fuente Material Community Icons: 1147.84 KB.
- Rutas: 46.57 KB / 12.56 KB gzip.
- Dashboard: 44.03 KB / 12.19 KB gzip.

## Decisiones

- No adoptar TanStack Query de forma masiva. Primero aislar estado por recurso y demostrar la necesidad restante.
- No añadir Radix, charts, forms ni virtualización sin un caso medido.
- Mantener Zustand para sesión/UI y evitar que la misma entidad authoritative viva en dos caches.
- Mantener Mapbox y el contrato latest-wins.
- Agrupar navegación por trabajo: Operación, Gestión, Suscripción y Cuenta.

## Incremento implementado

- `PortalLayout` ya no ejecuta una carga total al entrar en cada pantalla. Una política explícita decide entre cuenta, billing, overview o ninguna precarga; las pantallas operativas conservan sus loaders especializados.
- La navegación elimina tres destinos duplicados a Perfil y separa Operación, Gestión, Suscripción y Cuenta.
- Perfil incorpora un Centro de Cuenta basado exclusivamente en usuario, empresa y suscripción existentes, con accesos a seguridad, plan, pagos, facturación y soporte.
- El contrato automatizado certifica el alcance por ruta y evita reintroducir el `loadAll` global.

## Resultado medido

- Build Vite: 645 módulos, 6.30 s en la misma estación.
- Entry compartido: 583.42 KB / 182.48 KB gzip (sin regresión material).
- Mapbox permanece lazy y sin cambios: 1004.98 KB / 281.79 KB gzip.
- El chunk de Perfil crece de 16.44 KB a 20.86 KB por el Centro de Cuenta; no afecta el entry inicial.
- QA web sin overflow horizontal en 360×740, 390×844, 768×1024, 1024×768 y 1440×900. En la sesión local con API inválida, 360/390 permanecieron temporalmente en sincronización de sesión; requiere repetir con backend real.

## Gates manuales pendientes

- Teclado/focus y lectores de pantalla en navegador real.
- Matriz responsive y zoom.
- Mapbox resize/fit/gestos y respuestas lentas.
- Offline/reconnect/socket con pestañas múltiples.
- 401/403/409/429/500 y expiración de sesión contra backend desplegado.
- Descarga real de factura/documento y retorno real de pago.
