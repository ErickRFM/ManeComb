## Problema / objetivo

Describe el síntoma o cambio y el usuario/superficie afectada.

## Causa raíz / autoridad

Explica qué autoridad manda sobre el estado o decisión y por qué el cambio no crea una segunda fuente de verdad.

## Regresión

Lista las pruebas o guards que demuestran el comportamiento, incluyendo carreras/reconnect/reordenamiento cuando apliquen.

## Integración / plataforma

Indica contratos tocados entre Backend, Mobile, Portal, Admin Global, sockets, cache, auth, Mapbox, FCM, Android/iOS/web u otras capas.

## Gate físico

Mientras falte prueba real, mantén el PR en **Draft**.

PHYSICAL_GATE: PENDING
PHYSICAL_EVIDENCE: Describe dispositivo/runtime y casos pendientes. Cuando cierre, cambia a PASS con evidencia concreta; usa N/A sólo si el PR no modifica comportamiento ni artifact de runtime y explica por qué.

## Certificación

No marcar Ready por CI verde solamente. El HEAD final debe pasar los gates aplicables y cualquier commit posterior invalida evidencia previa del artifact/runtime.
