# RC-UX-UI-SYSTEM-02 — Auditoría avanzada de jerarquía, densidad y coherencia

> Estado: AUDITORÍA BASE CERRADA / IMPLEMENTACIÓN VISUAL AÚN NO INICIADA
>
> Rama: `ux/global-polish-clean-20260811`
>
> Base: `main@d7d3ed1bbcc0afd958c1a8c69a6dab8905ca6466`

## 1. Dictamen

ManeComb **no necesita un rediseño global**. El sistema ya tiene identidad, tokens, patrones y varias pasadas de limpieza. El siguiente salto de calidad debe venir de:

- mejor jerarquía de información;
- menos repetición;
- menos superficie visual innecesaria;
- estados más cercanos a la acción;
- misma semántica entre Mobile, Portal y Admin Global;
- conservar la acción principal limpia y obvia;
- no agregar copy si no resuelve una duda real.

La regla de esta RC es **editar primero por sustracción y reordenamiento**. Solo se agrega un componente o texto nuevo si falta una capacidad perceptible o una explicación necesaria.

## 2. Lo que ya está bien y se congela

### Mobile

El sistema visual móvil ya cuenta con una base canónica:

- `DesignSystem` central para tipografía, spacing, radios, controles, motion y breakpoints;
- breakpoints compartidos `phone=640` y `compact=1080`;
- escala de radios ampliada para los valores realmente usados;
- títulos, sheets, handles, chips y estados ya pasaron por normalización previa;
- `StatusPill` y otros componentes compartidos ya cubren buena parte de los estados.

**Decisión:** no volver a hacer una migración masiva de tokens ni cambiar tamaños porque sí. Se tocarán valores solo cuando haya un problema perceptible demostrado.

### Modelo operacional

El problema histórico de varias representaciones de una unidad ya tiene contrato compartido `OperationalUnitSnapshot`. Mobile consume `@shared/operational-contract` y el Portal actual también importa el snapshot y su reconciliación para realtime.

**Decisión:** las mejoras de UI de Mapa, Seguimiento, Control, Unidades e Incidencias deben proyectar ese contrato; no crear otra interpretación local del estado.

### Ventas / Portal

Ya existe una limpieza reciente de navegación y producto:

- se eliminaron destinos duplicados;
- se redujo carga global indiscriminada;
- Perfil concentra accesos de cuenta;
- Mapbox sigue lazy;
- no se añadieron librerías o widgets decorativos sin necesidad.

**Decisión:** conservar esa dirección. La nueva pasada es de claridad, feedback local, densidad y responsive; no volver a inflar el Portal.

## 3. Hallazgos actuales verificados

### UX-P1-01 — Radio repite el mismo contexto tres veces

En la consola actual:

- el nombre del canal ya aparece como título del header;
- el header ya muestra el número de miembros;
- el selector real de salida de audio ya está arriba y es interactivo;
- la fila inferior vuelve a mostrar canal, conectados y salida.

Además, `miembros` y `conectados` usan actualmente el mismo origen: `activeChannel.participants.length`.

**Impacto:** la fila inferior consume altura, repite contexto y hace que información secundaria compita con PTT y último audio.

**Corrección aprobada:** eliminar la repetición inferior, conservar la información superior y el selector de salida real, y redistribuir el espacio sin reducir la prioridad táctil del PTT.

**No se toca:** floor control, captura, playback, lifecycle, Socket.IO, haptics, audio routing nativo ni la máquina de estados.

### UX-P1-02 — El trabajo visual no puede crear nuevas autoridades operacionales

Mobile y Portal ya tienen contrato de snapshot/reconciliación. Cualquier tarjeta nueva, badge, contador o CTA que represente jornada/GPS/ruta/incidencia debe consumir la autoridad existente.

**Corrección de proceso:** cada PR visual que toque operación debe identificar explícitamente de qué campo/selector proviene el estado mostrado.

### UX-P2-01 — Admin Global fuerza copy secundario en el shell

`AdminShell` exige `subtitle: string` para todas las pantallas y además muestra un eyebrow fijo `ADMIN GLOBAL`. Esto no es un bug por sí mismo, pero convierte el subtítulo en requisito estructural incluso cuando una pantalla puede explicarse solo con su título y acciones.

**Dirección:** auditar pantalla por pantalla. Hacer `subtitle` opcional solo si se demuestra copy de relleno. No eliminar explicaciones útiles de seguridad, MFA, acciones destructivas o alcance global.

### UX-P2-02 — Resumen de Admin Global puede repetir “módulos”

Cuando no existe el bloque de órdenes comerciales, el cuarto KPI se convierte en `Módulos habilitados`; más abajo existe también la tarjeta `Módulos disponibles` con badges de capacidades.

**Impacto:** dos superficies pueden responder la misma pregunta en la misma pantalla.

**Dirección:** dejar una sola representación si la revisión visual confirma la duplicidad en ese estado de capabilities.

### UX-P2-03 — Copy opcional debe seguir siendo opcional en Mobile

`AppShell` ya permite `mobileSubtitle` opcional y headers propios. Esto encaja con la dirección de producto.

**Decisión:** no convertir subtítulos, badges o mensajes descriptivos en un estándar obligatorio. Una pantalla simple puede quedarse con título + estado + acción.

## 4. Arquitectura visual objetivo

El sistema se evaluará con una estructura común, no con un template visual rígido:

**Contexto → estado necesario → acción principal → información reciente/resultado → acciones secundarias.**

Ejemplos:

- Radio: canal/estado/salida → PTT → última transmisión → navegación.
- Mapa: mapa/contexto → estado de unidad seleccionada → acción de jornada/seguimiento → detalle bajo demanda.
- Chat: conversación → estado de conexión/llamada solo cuando aplica → mensajes → composer.
- Portal: objetivo de pantalla → acción primaria → datos accionables → detalle.
- Admin Global: alcance global → riesgo/estado → acción autorizada → evidencia/trazabilidad.

No todas las pantallas necesitan las cinco capas visibles.

## 5. Reglas de copy

Se conserva texto solo cuando cumple al menos una condición:

1. identifica el objeto actual;
2. explica un estado no obvio;
3. evita una acción peligrosa;
4. indica qué hacer después de un error/empty state;
5. diferencia dos conceptos que visualmente podrían confundirse.

Se elimina o no se agrega cuando:

- repite el título;
- repite un badge;
- describe lo que ya muestra la UI;
- es marketing dentro de una consola operativa;
- usa nombres internos del sistema;
- promete una capacidad no respaldada por backend.

## 6. Orden de implementación

### Fase 1 — Mobile crítico

- Radio.
- Mapa / Seguimiento.
- Control / jornadas / rutas.
- Incidencias.

### Fase 2 — Comunicación y personas

- Chat / llamadas.
- Directorio / unidades.
- Perfil / documentos.

Los archivos afectados por PRs paralelos no se pisan; se rebaselina después de su integración.

### Fase 3 — Portal empresarial

- Dashboard y centro de acción.
- Equipo / Unidades.
- Rutas / mapa.
- Documentos / Incidencias.
- Plan / Pagos / Facturación / Perfil.

### Fase 4 — Ventas

- Landing.
- Login / registro / recovery.
- Checkout / retornos.
- Legal / 404.

### Fase 5 — Admin Global

- Shell/navegación.
- Resumen global.
- Empresas.
- Operaciones.
- Gobernanza.
- Pagos manuales.
- Auth/MFA.

## 7. Validación por cambio

Cada incremento debe pasar:

- revisión de duplicidad de información;
- revisión de copy nuevo;
- touch targets y accesibilidad;
- font scaling / texto largo;
- estados loading, empty, error, offline/reconnect cuando apliquen;
- responsive del producto;
- typecheck/lint/tests/build;
- `git diff --check`;
- pruebas físicas cuando haya mapa, audio, teclado, gestos o ciclo de vida Android.

## 8. Criterio de cierre

El resultado correcto debe sentirse como **el mismo ManeComb, pero mejor ordenado**.

No se considera mejora si únicamente:

- agrega más tarjetas;
- agrega más texto;
- agrega más badges;
- cambia radios/colores sin resolver una necesidad;
- copia módulos de competidores que ManeComb no necesita;
- mueve datos sin respetar su fuente de verdad.

La mejora sí cuenta cuando el usuario entiende más rápido qué está pasando y qué puede hacer, con menos elementos compitiendo por su atención.
