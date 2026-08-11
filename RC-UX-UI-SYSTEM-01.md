# RC-UX-UI-SYSTEM-01 — Pulido UX/UI avanzado de todo ManeComb

> Estado: EN CURSO
>
> Base inicial: `main@d7d3ed1bbcc0afd958c1a8c69a6dab8905ca6466`
>
> Alcance: Mobile operativo + Ventas/Landing + Portal empresarial + Admin Global. Backend, sockets, GPS, RTC, pagos, permisos y contratos de dominio solo se tocan si una corrección visual demuestra una incongruencia funcional real y se trata como cambio separado.

## 1. Principio de producto

ManeComb ya tiene identidad y lenguaje visual. Este trabajo **no es un rediseño**, no agrega pantallas por moda y no llena espacios con texto. La meta es que el sistema se vea más maduro, más claro y más consistente conservando su personalidad actual.

Regla principal:

> **Si una pieza no ayuda a entender el estado, tomar una decisión o ejecutar una acción, no se agrega.**

## 2. Reglas no negociables

1. **Nada de copy decorativo o inventado.**
   - No agregar slogans, subtítulos, ayudas o mensajes si el usuario ya entiende la pantalla sin ellos.
   - No mostrar estados que no provengan de datos reales.
   - No convertir nombres técnicos internos en texto visible.

2. **No duplicar información.**
   - Un estado, contador, nombre de canal, unidad, plan o acción se expresa una sola vez por contexto.
   - Si dos cifras parecen iguales pero representan cosas distintas, su significado debe ser inequívoco.

3. **Jerarquía antes que decoración.**
   - Primero: contexto y estado.
   - Segundo: acción primaria.
   - Tercero: información reciente o secundaria.
   - Navegación y configuración no compiten con la acción principal.

4. **Menos superficie, mejor densidad.**
   - Reducir tarjetas anidadas, bordes repetidos, chips redundantes y espacios muertos.
   - No compactar hasta dañar legibilidad o áreas táctiles.

5. **Componentes y tokens compartidos.**
   - Reusar `DesignSystem`, `AppTheme`, `StatusPill`, `AppCard`, botones, sheets y patrones existentes.
   - No crear `*V2`, `*New`, managers o estilos paralelos para resolver una diferencia visual.

6. **Estados reales, no UI optimista falsa.**
   - Loading, empty, error, offline, reconnecting, disabled, active y success deben corresponder al runtime real.
   - Una pantalla no debe aparentar que una acción terminó antes de que su autoridad lo confirme.

7. **Accesibilidad operativa.**
   - Áreas táctiles suficientes.
   - Labels accesibles para icon-only controls.
   - Contraste, font scale y reduced motion respetados.
   - Feedback háptico/visual solo cuando comunica estado, no como adorno.

8. **Responsive único por producto.**
   - Mobile usa los breakpoints canónicos actuales de `DesignSystem` (`phone=640`, `compact=1080`) salvo excepciones justificadas como Auth.
   - Portal/Ventas/Admin Global deben seguir sus propias autoridades compartidas; no introducir umbrales locales sin necesidad.

9. **Nada de tocar lógica sana para acomodar UI.**
   - La UI se adapta a la autoridad existente.
   - Si la autoridad está partida o contradice al backend, se documenta y se corrige estructuralmente en un cambio separado.

10. **Cada cambio visual debe poder explicarse.**
    - Qué problema elimina.
    - Qué información conserva.
    - Qué se quita y por qué.
    - Qué estado real consume.
    - Cómo se valida en teléfono/tablet/web según corresponda.

## 3. Baseline actual ya resuelto

La estandarización móvil previa ya dejó avances que no deben rehacerse:

- escala de radios ampliada para valores de facto;
- títulos y secciones normalizados;
- breakpoints móviles unificados en `DesignSystem`;
- chips/handles/sheets revisados;
- rojo de marca del login alineado;
- estados compartidos mediante componentes canónicos donde aplica.

Por tanto esta fase se concentra en **arquitectura de información, jerarquía, densidad, flujo y estados**, no en repetir swaps de tokens ya cerrados.

Ventas/Portal ya pasó una limpieza donde se eliminaron navegación vacía, estados ficticios, mensajes redundantes y responsabilidades duplicadas. La nueva pasada debe mantener esa disciplina: mejorar sin volver a inflar la interfaz.

## 4. Criterios de auditoría por pantalla

Para cada superficie se revisa:

- objetivo principal de la pantalla;
- acción primaria y acciones secundarias;
- información repetida;
- texto prescindible;
- orden visual y lectura en 3 segundos;
- loading / empty / error / offline / reconnect;
- disabled y permisos;
- touch targets y accesibilidad;
- jerarquía tipográfica;
- densidad de cards/chips/dividers;
- responsive y font scaling;
- consistencia con pantallas hermanas;
- fuente de verdad de cada contador/estado;
- navegación de ida y regreso;
- feedback de acciones destructivas;
- comportamiento con datos largos, vacíos y extremos.

## 5. Orden de trabajo

### Fase A — Sistema transversal

Revisar shells, headers, navegación, tokens, cards, botones, sheets, dialogs, badges, empty states, estados de carga/error y breakpoints. Solo se cambian patrones cuya mejora beneficie a varias pantallas sin alterar lógica.

### Fase B — Mobile operativo

Orden sugerido por criticidad de uso:

1. Radio
2. Mapa / Seguimiento
3. Chat / llamadas
4. Control / jornadas / rutas
5. Incidencias
6. Directorio / unidades
7. Perfil / documentos
8. Auth / estados de cuenta

### Fase C — Portal empresarial

Dashboard, navegación, Equipo, Unidades, Rutas, Documentos, Incidencias, Perfil, Plan, Facturación y Métodos de pago. Mantener responsabilidades separadas y no reintroducir contenido que RC-01 eliminó por redundante.

### Fase D — Ventas / acceso / checkout

Claridad de propuesta, flujo, errores de formulario, recuperación, checkout, responsive y accesibilidad. No inventar claims ni contenido comercial que no esté respaldado por el producto.

### Fase E — Admin Global

Priorizar lectura rápida, seguridad operacional, tablas/filtros, estados de empresa, acciones destructivas y trazabilidad. No mezclar capacidades tenant con autoridad global.

### Fase F — Certificación

- typecheck/lint/tests/build correspondientes;
- `git diff --check`;
- revisión de regresiones de contratos;
- matriz visual mínima por breakpoints;
- validación física para gestos/audio/mapa/teclado cuando el cambio lo requiera.

## 6. Primera corrección concreta — Radio

La captura física confirma una jerarquía mejorable sin necesidad de rediseño:

- `Radio general / conectados / salida` aparece como metadato inferior cuando es contexto previo a transmitir.
- `miembros` y `conectados` pueden percibirse como repetición si provienen del mismo conjunto.
- el PTT debe seguir siendo el protagonista;
- el último audio es útil y se conserva;
- `Canales / Radio / Audios` se conserva como arquitectura principal;
- no se agregan explicaciones adicionales dentro de la consola.

Dirección:

1. mover el contexto operativo necesario hacia la zona superior de la consola/header;
2. eliminar la fila inferior redundante cuando la misma información ya esté visible arriba;
3. reducir espacio muerto sin comprimir el PTT;
4. conservar el selector de salida real y su estado nativo;
5. mantener los textos actuales de PTT salvo corrección de claridad demostrable;
6. no tocar floor control, captura, playback, Socket.IO, lifecycle ni routing de audio en esta fase visual.

## 7. Concurrencia Git

Al iniciar esta RC existen trabajos paralelos abiertos sobre llamadas y Directorio. Esta rama no debe pisar sus archivos de forma ciega. Antes de tocar una superficie en conflicto:

1. comprobar el `main` vigente;
2. comprobar PRs abiertos;
3. esperar o reconciliar contra la autoridad más nueva;
4. evitar cherry-picks de estados viejos;
5. ejecutar validación completa después de cada integración.

## 8. Definition of Done

La RC global no se considera terminada porque “se vea bonita”. Debe cumplir:

- menos duplicación visible;
- ningún texto nuevo sin función;
- ninguna capacidad ficticia;
- acciones primarias evidentes;
- estados consistentes con datos reales;
- navegación coherente;
- accesibilidad y responsive certificados;
- cero regresiones funcionales conocidas;
- cambios integrados sobre el `main` vigente y con CI verde.
