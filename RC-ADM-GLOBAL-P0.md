# ADM-GLOBAL-P0 — Seguridad fail-closed y cobertura obligatoria

**Rama:** `fix/adm-global-p0-security`  
**Estado:** implementación técnica cerrada; revalidación de CI solicitada antes del merge  
**Alcance:** autenticación Platform, MFA, configuración productiva, CORS y CI

## Problema corregido

La política anterior calculaba MFA como requerido únicamente cuando la llave de cifrado estaba operativa. Si `PLATFORM_MFA_ENCRYPTION_KEY` faltaba o era inválida, un usuario Platform con contraseña válida podía recibir un access token completo y el middleware omitía la verificación MFA.

## Cierre aplicado

- El login responde `503` cuando el rol exige MFA y el servicio MFA no está operativo.
- La denegación no crea ni entrega una sesión, refresh token, challenge o access token.
- El refresh valida MFA antes de rotar el token.
- El middleware y `requireMfa` responden `503` ante configuración inválida.
- La configuración productiva aborta ante secretos Platform parciales o inválidos; con ambos ausentes Admin Global queda deshabilitado sin derribar el resto de ManeComb.
- CORS contempla `admin.manecomb.com` y el puerto local `5174`.
- Las suites Platform forman parte obligatoria de `npm test`.
- El contrato de entorno detecta la reaparición del patrón fail-open.

## Gate de integración

La rama debe ejecutar nuevamente CI y auditoría de dependencias sobre su head vigente antes del merge. No se fusionará únicamente por resultados históricos.

## Validación operativa posterior

1. Confirmar los dos secretos Platform sin exponer valores.
2. Confirmar el primer `platform_owner` en la base productiva correcta.
3. Confirmar `https://admin.manecomb.com` en el `CLIENT_ORIGIN` real.
4. Probar TOTP, recuperación, refresh y revocación con Mongo real.

No se modificaron secretos, MongoDB, Render, Cloudflare ni Producción desde esta rama.
