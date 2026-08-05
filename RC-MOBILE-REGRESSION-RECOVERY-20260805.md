# RC-MOBILE-REGRESSION-RECOVERY-20260805 — Auditoría y recuperación

**Fecha:** 2026-08-05  
**Estado:** Código listo; certificación física pendiente  
**PR:** `#1`

## Motivo

El APK volvió a mostrar “Servidor no disponible” mientras otras solicitudes seguían funcionando. Al comparar `main`, ramas remotas, documentos RC y firmas reales de código se confirmó que algunas RC habían dejado documentación en el árbol, pero sus commits y ramas de implementación ya no existían.

## Regresiones confirmadas

### 1. Recuperación de autenticación Socket.IO

El documento `RC-MOBILE-SOCKETAUTH-01.md` referenciaba `b9ee08b`, objeto ausente. En `main` tampoco existían el clasificador de errores auth, el refresh single-flight ni el estado `unauthorized`.

**Recuperado:** refresh controlado, socket nuevo con token vigente, anti-loop, epoch de sesión y banner correcto.

### 2. Timbrado de llamada entrante

`RC-MOBILE-CALL-RING-01.md` referenciaba `1b65a6f`, `9cba219`, `b9ee08b` y `db81394`, todos ausentes. Tampoco existían los eventos de backend, estado mobile ni modal de llamada entrante.

**Recuperado:** registro de llamada pendiente, salas personales, aceptar/rechazar/cancelar/timeout, bloqueo de concurrencia, limpieza en desconexión, modal mobile y entrada al RTC room únicamente tras iniciar o aceptar.

## Elementos revisados que sí permanecían

- Marcadores Mapbox mediante `MarkerView`.
- Scroll acotado del modal de rutas.
- Recuperación de contraseña mobile.
- Banner de actualización.
- Fuente canónica `operationalUnits`.
- Modelo de asignación múltiple de rutas.
- Ciclo documental conductor/admin y pantalla `mis-documentos`.
- Aprendizaje automático de rutas y candidatos persistidos.

No se reimplementaron ni duplicaron estos módulos.

## Rama pendiente encontrada

`codex/mp-sandbox-02` estaba dos commits por delante de `main` con correcciones de idempotencia para no reutilizar una preferencia de Mercado Pago ya redirigida. Se abrió el PR `#2` para validarlo e integrarlo por separado, evitando mezclar checkout con RTC.

## Validaciones

- Backend completo: aprobado.
- Registro RTC dirigido: aprobado.
- Mobile TypeScript: aprobado.
- Mobile ESLint enfocado: aprobado.
- Mobile completo: aprobado.

## Pendientes físicos

- Reauth del socket en APK con token realmente expirado.
- Llamada entre dos dispositivos: aceptar, rechazar, cancelar y timeout.
- Audio/video entre redes diferentes.
- TURN en redes restrictivas.

## Prevención

Las RC activas ya no declaran como vigente una rama histórica inexistente. Los contratos recuperados cuentan con pruebas automatizadas y documentación actualizada para que una futura integración no se dé por cerrada solo porque el archivo RC continúa presente.
