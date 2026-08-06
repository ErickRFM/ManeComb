# ADR-001 — Límites de producto y autoridades del sistema

- **Estado:** Aceptado para implementación por fases
- **Fecha:** 2026-08-06
- **Base:** `main@557115f4d62a1ba9628c04e5e3da65545001a9e5`

## Contexto

ManeComb ya contiene un backend multiempresa, una aplicación móvil operativa, un portal de ventas y administración empresarial, un Admin Global, un paquete de comunicación y contratos compartidos.

La evolución por ramas dejó algunas decisiones repetidas en clientes. El caso más visible es la clasificación de cuentas empresariales en Ventas: el redirect usa una regla `OR`, mientras el acceso al Portal usa una regla `AND`. También quedaron rutas web `/mapa` y `/radio` como mecanismo temporal para orientar cuentas operativas.

Corregir cada síntoma por separado mantendría la duplicación. Antes de limpiar código se requiere declarar quién tiene la última palabra sobre cada decisión.

## Decisión

### Límites de producto

- `ventas/` es exclusivamente Ventas y Portal empresarial.
- `mobile/` es exclusivamente operación: mapa, GPS, Radio, Chat, RTC y Push.
- `admin-global/` es exclusivamente gobierno interno de ManeComb.
- `backend/` es la autoridad de identidad, tenant, capabilities y reglas de dominio.
- `communication-service/` se mantendrá como paquete interno especializado con una interfaz pública controlada.
- `shared/` contendrá contratos y vocabulario, nunca persistencia o autorización.

### Autoridades

- Backend resuelve el canal de cuenta.
- Backend valida capabilities y tenant para cada acción protegida.
- Los frontends consumen decisiones; no crean permisos.
- Assignments será el único escritor de la ruta activa.
- El catálogo comercial y los estados de suscripción son propiedad del backend.
- `mobile/app.json` es la fuente de versión móvil.
- Infraestructura gobierna contratos de entorno y acceso privado Platform.

### Canal de cuenta objetivo

```text
company_portal
mobile_operations
platform_admin
blocked
```

### Tratamiento de `/mapa` y `/radio` en Ventas

Se consideran rutas temporales de compatibilidad. La Fase 1 eliminará los redirects que dependen de ellas, preservará la intención de compra y bloqueará cuentas operativas en Ventas con un mensaje claro. Las rutas se retirarán después de certificar cero consumidores.

## Consecuencias positivas

- una cuenta obtiene el mismo resultado en todos los clientes;
- se reduce la duplicación de roles y permisos;
- se pueden eliminar adaptadores con evidencia;
- los dominios se prueban y despliegan de forma independiente;
- la conexión de dominios públicos ocurre sobre límites estables.

## Costes y riesgos

- el contexto de autenticación deberá evolucionar sin romper Mobile;
- algunos helpers de frontend serán reemplazados;
- endpoints legados deberán medirse antes de eliminarse;
- las pruebas deben cubrir combinaciones inválidas de `role` y `accountType`;
- la configuración externa de Admin Global sigue siendo un gate separado.

## Alternativas descartadas

### Mantener las decisiones en cada frontend

Descartada porque ya produjo reglas incompatibles.

### Convertir todo en una sola aplicación web

Descartada porque duplicaría el runtime operativo y debilitaría GPS, Radio, llamadas y permisos nativos.

### Crear nuevos microservicios antes de estabilizar

Descartada porque aumentaría despliegues, secretos y fallos sin resolver las autoridades actuales.

### Eliminar inmediatamente todo lo legado

Descartada porque todavía pueden existir consumidores instalados o configuración externa asociada.

## Criterio de cumplimiento

Este ADR se cumple cuando:

- el mapa de autoridades pasa CI;
- Fase 1 establece un contexto de canal canónico;
- Portal exige `company_portal`;
- Mobile exige `mobile_operations`;
- Admin Global exige `platform_admin` más Cloudflare Access;
- ningún frontend autoriza una operación únicamente mediante UI.
