# RC-MOBILE-ALERT-FEEDBACK-01 — Matriz de prueba física

**Rama:** `claude/operational-alert-feedback-20260810`
**Por qué existe:** los tests verdes prueban que la política elige el canal
correcto y que el dedup no suena dos veces. **No prueban** que un SOS se
distinga de un mensaje de chat en un teléfono real, con su altavoz y su volumen.
Eso sólo se comprueba escuchando y sintiendo.

## Preparación

1. Instalar el APK de debug standalone en un Android real.
2. Dos cuentas de **empresa A**: un conductor y un supervisor con
   `canManageIncidents`.
3. Una cuenta de **empresa B** con `canManageIncidents`, en un segundo teléfono
   si es posible.
4. Volumen de notificaciones a la mitad. No usar auriculares para las primeras
   pruebas: se busca reconocer el patrón por el altavoz.

> Los tres tonos son `alert_sos`, `alert_high` y `alert_standard`, generados por
> `mobile/scripts/generate-alert-sounds.py`. Si quieres oírlos aislados antes de
> empezar, reproduce los `.wav` de `android/app/src/main/res/raw/`.

## Matriz

| # | Caso | Acción | Resultado esperado | Evidencia | PASS/FAIL |
|---|---|---|---|---|---|
| 1 | low | Conductor reporta `severity: low` | Tono breve (`alert_standard`), vibración corta, canal *Incidencias* | Vídeo con audio | |
| 2 | medium | Reportar `severity: medium` | Igual que #1: backend resuelve `level=info` para todo lo que no es high/critical | Vídeo | |
| 3 | high | Reportar `severity: high` | Dos pulsos ascendentes (`alert_high`), vibración doble, canal *Incidencias de alta prioridad* | Vídeo | |
| 4 | critical / SOS | Reportar `severity: critical` | Sirena de dos tonos ×3 (`alert_sos`), vibración larga e insistente, canal *Alertas SOS* | Vídeo | |
| 5 | Distinguibilidad | Encadenar #1, #3 y #4 | Los tres se reconocen sin mirar la pantalla | Vídeo | |
| 6 | vs chat | Recibir un mensaje de chat justo después de #4 | El chat suena claramente distinto del SOS | Vídeo | |
| 7 | vs llamada RTC | Recibir una llamada tras #4 | El ringtone de llamada es el de siempre y no se confunde con el SOS | Vídeo | |
| 8 | Foreground | Supervisor con ManeComb **abierto** en el mapa; conductor lanza SOS | Suena y vibra, y la incidencia aparece en la lista | Vídeo | |
| 9 | Background | App en segundo plano | Notificación en el canal correcto, con su sonido | Captura + audio | |
| 10 | Lockscreen | Teléfono bloqueado | Se anuncia la alerta **sin** mostrar la descripción completa | Foto del lockscreen | |
| 11 | Socket conectado | Con red estable | Una sola reacción | Vídeo | |
| 12 | Socket reconectando + FCM | Activar avión 20 s, desactivar, lanzar SOS durante la reconexión | Una sola reacción, no dos | Vídeo | |
| 13 | Socket + FCM simultáneos | Lanzar SOS justo mientras se manda la app a background | **Una sola** alerta audible | Vídeo | |
| 14 | Dos incidentes seguidos | Dos incidencias distintas en < 3 s | Dos alertas, dos notificaciones | Vídeo | |
| 15 | Mismo vehículo | Dos incidencias distintas de la misma unidad | Dos alertas: no se deduplican | Vídeo | |
| 16 | Mismo título | Dos incidencias distintas con título idéntico | Dos notificaciones coexisten; ninguna reemplaza a la otra | Captura | |
| 17 | Empresa A vs B | Empresa A lanza SOS | El teléfono de empresa B **no** suena, no vibra y no recibe contenido | Vídeo de ambos | |
| 18 | Sin `canManageIncidents` | Sesión de conductor o `viewer` | No recibe la alerta | Captura | |
| 19 | Conductor reportante | El propio conductor que lanza el SOS | **No** recibe eco de su alerta | Vídeo | |
| 20 | Deep link | Tocar la notificación | Abre exactamente esa incidencia | Vídeo | |
| 21 | Deep link ajeno | Tocar una notificación de una incidencia ya borrada | Falla cerrado, sin filtrar datos | Captura | |
| 22 | Cambio de estado | Marcar `in_progress` | **Cero** sirena | Vídeo | |
| 23 | Resolución | Marcar `resolved` | **Cero** sonido de emergencia | Vídeo | |
| 24 | Reinicio de app | Cerrar y abrir; lanzar SOS | Sigue sonando correctamente | Vídeo | |
| 25 | Reinicio de teléfono | Reiniciar; lanzar SOS | Llega por FCM con su canal | Vídeo | |
| 26 | Permiso Android 13+ | Denegar el permiso de notificaciones | No revienta; sin notificación en background | Captura | |
| 27 | Permiso concedido después | Conceder y repetir | Vuelve a funcionar | Vídeo | |
| 28 | Instalación previa | Instalar **encima** de una versión anterior que ya tenía `operacion-sos` | Los canales `-v2` aparecen con su sonido, sin borrar datos ni reinstalar | Captura de Ajustes → Notificaciones | |
| 29 | Canales antiguos | Revisar Ajustes | `operacion-sos`, `operacion-incidentes` y `operacion-emergencias` siguen existiendo, no se borraron | Captura | |
| 30 | Silencio | Teléfono en silencio | No suena. Vibración según el modo | Vídeo | |
| 31 | Solo vibración | Modo vibración | Vibra, no suena | Vídeo | |
| 32 | DND | No molestar activo | Se respeta la política del sistema; la app no la salta | Vídeo | |
| 33 | Volumen | Bajar el volumen de notificaciones | La app **no** lo sube por su cuenta | Vídeo | |
| 34 | Canal silenciado | Silenciar *Incidencias* desde Ajustes | Se respeta; SOS sigue con su propio canal | Captura | |
| 35 | Release/standalone | Repetir #4, #9 y #13 sobre el APK standalone | Igual comportamiento | Vídeo | |

## Qué invalida la fase

Cualquier FAIL en **13** (doble sonido), **17** (fuga entre empresas), **19**
(eco al reportante), **22/23** (sirena en cambio de estado) o **28** (los canales
v2 no llegan a una instalación previa) invalida la certificación, aunque el resto
esté en verde.
