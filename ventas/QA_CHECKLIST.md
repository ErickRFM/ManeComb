# ManeComb Ventas QA Checklist

## Build y entorno
- Ejecutar `VITE_API_URL=https://manecomb.onrender.com/api VITE_SOCKET_URL=https://manecomb.onrender.com npm run build`.
- Confirmar que Cloudflare tenga `VITE_API_URL=https://manecomb.onrender.com/api`.
- Confirmar que Render tenga `APP_URL=https://manecomb1.pages.dev` y `PUBLIC_WEBHOOK_BASE_URL=https://manecomb.onrender.com`.
- Confirmar que Render tenga `MERCADO_PAGO_ACCESS_TOKEN` configurado.

## Rutas principales
- Abrir `/ventas/` y confirmar landing visible.
- Abrir `/ventas/login` y confirmar formulario de login.
- Abrir `/ventas/registro` y confirmar formulario de registro.
- Abrir `/ventas/pago?planId=<plan>` con sesion activa de cliente.
- Abrir `/portal`, `/portal/plan`, `/portal/pagos`, `/portal/facturacion`, `/portal/onboarding`.
- Abrir `/login` y confirmar que funciona como alias de `/ventas/login`.

## Compra con Mercado Pago
- Desde landing, elegir un plan y continuar a pago.
- Confirmar que el boton de tarjeta diga "Continuar a Mercado Pago".
- Confirmar que no se piden datos completos de tarjeta en ManeComb.
- Confirmar que el backend responde con `checkoutUrl`.
- Confirmar redireccion al checkout seguro de Mercado Pago.
- En retorno aprobado, abrir `/ventas/?checkout=success` y confirmar mensaje de pago aprobado.
- En retorno pendiente, abrir `/ventas/?checkout=pending` y confirmar mensaje de pago pendiente.
- En retorno fallido, abrir `/ventas/?checkout=failure` y confirmar opcion de reintento.

## Portal de pagos
- Confirmar que "Agregar referencia de tarjeta" solo pide ultimos 4 digitos.
- Confirmar que no se envia `portal-token`.
- Confirmar que crear, editar, marcar principal y eliminar referencia muestran exito/error.

## Backend
- Ejecutar `npm test` en `backend/`.
- Confirmar que `/api/commercial/confirm` rechaza confirmaciones visuales en produccion.
- Confirmar webhook de Mercado Pago actualiza orden y plan activo.
- Confirmar `/api/auth/me` refleja `canAccessMobile` correcto tras activacion.

## Soporte y links
- Probar email de contacto desde footer.
- Probar telefono del footer.
- Probar footer: Planes, Funciones, Demo, Nosotros, Contacto, Centro de ayuda, Documentacion, Estado del sistema, Privacidad, Terminos, Cookies.
