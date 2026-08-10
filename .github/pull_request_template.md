## Problema / objetivo

Describe el síntoma o cambio y el usuario/superficie afectada.

## Causa raíz / autoridad

Explica qué autoridad manda sobre el estado o decisión y por qué el cambio no crea una segunda fuente de verdad.

## Regresión

Lista las pruebas o guards que demuestran el comportamiento, incluyendo carreras/reconnect/reordenamiento cuando apliquen.

## Integración / plataforma

Indica contratos tocados entre Backend, Mobile, Portal, Admin Global, sockets, cache, auth, Mapbox, FCM, Android/iOS/web u otras capas.

## Gate físico

Mientras falte prueba real, el estado normal de trabajo es **Draft + PENDING**.

PHYSICAL_GATE: PENDING
PHYSICAL_EVIDENCE: Describe dispositivo/runtime y casos pendientes. Cuando cierre, cambia a PASS con evidencia concreta; usa N/A sólo si el PR no modifica comportamiento ni artifact de runtime y explica por qué.

Si el código/CI ya está certificado y el propietario necesita integrar primero para instalar/probar exactamente el release consolidado, puede usarse **ACCEPTED_PENDING** sin fingir PASS:

PHYSICAL_GATE: ACCEPTED_PENDING
PHYSICAL_EVIDENCE: Describe exactamente la matriz física que sigue pendiente.
PHYSICAL_ACCEPTANCE: Registra quién/por qué acepta el merge antes de completar esa prueba física.

`ACCEPTED_PENDING` no equivale a PASS y la matriz física sigue abierta hasta aportar evidencia real.

## Certificación

No marcar PASS por CI verde solamente. El HEAD final debe pasar los gates aplicables y cualquier commit posterior invalida evidencia previa del artifact/runtime.
