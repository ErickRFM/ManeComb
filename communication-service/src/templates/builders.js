const C = require("./components");

function buildContent(sections) {
  return sections.filter(Boolean).join("");
}

function welcome(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Bienvenido a ManeComb" }),
    C.greeting(data.name),
    C.textBlock("Gracias por confiar en ManeComb. Estamos emocionados de darte la bienvenida a la plataforma que transformará la administración operativa de tu flotilla."),
    C.textBlock("Tu cuenta ha sido creada exitosamente. Ahora puedes comenzar a gestionar tus unidades, conductores y rutas desde un solo lugar."),
    C.button({ text: "Comenzar", url: data.dashboardUrl || "https://manecomb.com" }),
    C.separator(),
    C.callout({
      icon: "\uD83D\uDCA1",
      title: "Primeros pasos",
      message: "Agrega tus vehículos, invita a tus conductores y configura tus rutas en minutos. Nuestro centro de ayuda te guiará en cada paso."
    }),
    C.helpBlock({ email: data.supportEmail, docsUrl: data.docsUrl })
  ]);
}

function accountActivation(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Activa tu cuenta de ManeComb" }),
    C.greeting(data.name),
    C.textBlock("Para comenzar a usar ManeComb, necesitas activar tu cuenta haciendo clic en el siguiente botón:"),
    C.button({ text: "Activar cuenta", url: data.activationUrl }),
    C.alert({
      variant: "info",
      message: "Este enlace expira en 24 horas. Si no solicitaste esta activación, ignora este mensaje."
    }),
    C.spacer({ height: 8 }),
    C.textBlock("Una vez activada, podrás acceder a todas las funcionalidades de la plataforma."),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function passwordReset(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Recuperación de contraseña" }),
    C.greeting(data.name),
    C.textBlock("Recibimos una solicitud para restablecer la contraseña de tu cuenta de ManeComb."),
    C.textBlock("Para crear una nueva contraseña, haz clic en el siguiente botón:"),
    C.button({ text: "Restablecer contraseña", url: data.resetUrl }),
    C.alert({
      variant: "warning",
      message: "Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este mensaje y tu contraseña permanecerá igual."
    }),
    C.spacer({ height: 8 }),
    C.textBlock("¿No solicitaste esto? Recomendamos revisar la actividad reciente de tu cuenta."),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function passwordChanged(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Contraseña actualizada" }),
    C.greeting(data.name),
    C.textBlock("Te confirmamos que la contraseña de tu cuenta de ManeComb ha sido cambiada exitosamente."),
    C.alert({
      variant: "success",
      message: "Si realizaste este cambio, no necesitas hacer nada más."
    }),
    C.spacer({ height: 8 }),
    C.textBlock("Si no fuiste tú, contacta a soporte de inmediato para asegurar tu cuenta."),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function emailChanged(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Correo electrónico actualizado" }),
    C.greeting(data.name),
    C.textBlock(`Te confirmamos que el correo electrónico de tu cuenta ha sido actualizado a ${C.escapeHtml(data.newEmail)}.`),
    C.alert({
      variant: "success",
      message: "A partir de ahora, todas las comunicaciones de ManeComb llegarán a esta dirección."
    }),
    C.spacer({ height: 8 }),
    C.textBlock("Si no realizaste este cambio, contacta a soporte de inmediato."),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function companyInvitation(data) {
  return buildContent([
    C.logo(),
    C.header({ title: `Has sido invitado a ${C.escapeHtml(data.companyName || "ManeComb")}` }),
    C.greeting(data.name),
    C.textBlock(`${C.escapeHtml(data.invitedBy || "Un administrador")} te ha invitado a unirte a ${C.escapeHtml(data.companyName || "su empresa")} en ManeComb.`),
    C.textBlock("Al aceptar la invitación, podrás colaborar con tu equipo en la administración de la flotilla."),
    C.button({ text: "Aceptar invitación", url: data.invitationUrl }),
    C.alert({
      variant: "info",
      message: "Esta invitación expira en 7 días. Si tienes dudas, contacta a quién te invitó."
    }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function adminInvitation(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Invitación de administrador" }),
    C.greeting(data.name),
    C.textBlock(`Has sido invitado como administrador de ${C.escapeHtml(data.companyName || "ManeComb")} por ${C.escapeHtml(data.invitedBy || "el propietario")}.`),
    C.textBlock("Como administrador, podrás gestionar usuarios, vehículos, rutas y configuraciones de la empresa."),
    C.button({ text: "Aceptar invitación", url: data.invitationUrl }),
    C.alert({
      variant: "info",
      message: "Esta invitación expira en 7 días."
    }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function driverInvitation(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Invitación de conductor" }),
    C.greeting(data.name),
    C.textBlock(`Has sido registrado como conductor en ManeComb por ${C.escapeHtml(data.companyName || "tu empresa")}.`),
    C.textBlock("Descarga la aplicación móvil y activa tu cuenta para comenzar a registrar tus viajes y recibir indicaciones."),
    C.button({ text: "Activar cuenta", url: data.activationUrl }),
    C.infoLine({ label: "Empresa", value: data.companyName }),
    C.infoLine({ label: "Rol", value: "Conductor" }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function paymentApproved(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Pago aprobado", subtitle: `Referencia: ${C.escapeHtml(data.referenceCode || "")}` }),
    C.greeting(data.name),
    C.alert({
      variant: "success",
      message: "Tu pago ha sido procesado exitosamente. Gracias por tu confianza."
    }),
    C.textBlock("Los detalles de tu transacción:"),
    C.card({
      title: "Resumen de pago",
      items: [
        ["Plan", data.planName],
        ["Monto", data.amount],
        ["Método de pago", data.paymentMethod],
        ["Fecha", data.date]
      ]
    }),
    C.textBlock("Tu plan ya está activo. Puedes comenzar a usar todas las funcionalidades de ManeComb."),
    C.button({ text: "Ir al panel", url: data.dashboardUrl || "https://manecomb.com" }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function paymentRejected(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Pago rechazado", subtitle: `Referencia: ${C.escapeHtml(data.referenceCode || "")}` }),
    C.greeting(data.name),
    C.alert({
      variant: "error",
      message: "No pudimos procesar tu pago. Tu servicio no se verá interrumpido aún, pero te recomendamos intentar de nuevo."
    }),
    C.textBlock("Posibles causas:"),
    C.bulletList([
      "Fondos insuficientes",
      "Datos de tarjeta incorrectos",
      "Bloqueo bancario temporal",
      "Límite de transacción excedido"
    ]),
    C.textBlock("Puedes intentar con otro método de pago o contactar a tu banco para más información."),
    C.button({ text: "Intentar de nuevo", url: data.retryUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function orderCreated(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Orden registrada", subtitle: `Referencia: ${C.escapeHtml(data.referenceCode || "")}` }),
    C.greeting(data.name),
    C.textBlock("Tu orden fue registrada correctamente. Conserva esta referencia para cualquier aclaración."),
    C.card({
      title: "Resumen de la orden",
      items: [["Plan", data.planName], ["Monto", data.amount], ["Estado", data.statusLabel || "Pendiente"]]
    }),
    data.checkoutUrl ? C.button({ text: "Continuar con el pago", url: data.checkoutUrl }) : "",
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function paymentPending(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Pago pendiente", subtitle: `Referencia: ${C.escapeHtml(data.referenceCode || "")}` }),
    C.greeting(data.name),
    C.alert({ variant: "warning", message: "Tu pago todavía no ha sido confirmado." }),
    C.card({ title: "Resumen", items: [["Plan", data.planName], ["Monto", data.amount], ["Estado", "Pendiente"]] }),
    data.checkoutUrl ? C.button({ text: "Completar pago", url: data.checkoutUrl }) : "",
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function subscriptionActivated(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Suscripción activada" }),
    C.greeting(data.name),
    C.alert({ variant: "success", message: "Tu suscripción de ManeComb ya está activa." }),
    C.card({ title: "Plan activo", items: [["Plan", data.planName], ["Referencia", data.referenceCode]] }),
    C.button({ text: "Ir al panel", url: data.dashboardUrl || "https://manecomb.com" }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function subscriptionCancelled(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Suscripción cancelada" }),
    C.greeting(data.name),
    C.textBlock("Confirmamos la cancelación de tu suscripción de ManeComb."),
    C.card({ title: "Detalle", items: [["Plan", data.planName], ["Referencia", data.referenceCode], ["Fecha", data.date]] }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function invoiceAvailable(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Factura disponible" }),
    C.greeting(data.name),
    C.textBlock("Tu factura ya está lista para descargar. Aquí tienes un resumen:"),
    C.invoiceSummary({
      reference: data.referenceCode,
      amount: data.amount,
      date: data.date,
      items: data.items
    }),
    C.button({ text: "Descargar factura", url: data.invoiceUrl }),
    C.helpBlock({ email: data.billingEmail || data.supportEmail })
  ]);
}

function planRenewal(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Plan renovado exitosamente" }),
    C.greeting(data.name),
    C.textBlock("Tu plan de ManeComb ha sido renovado. Tu servicio continúa activo sin interrupciones."),
    C.card({
      title: "Detalles de renovación",
      items: [
        ["Plan", data.planName],
        ["Periodo", data.period],
        ["Monto", data.amount],
        ["Próxima facturación", data.nextBillingDate]
      ]
    }),
    C.button({ text: "Gestionar plan", url: data.manageUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function planExpiring(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Tu plan está por vencer" }),
    C.greeting(data.name),
    C.alert({
      variant: "warning",
      message: `Tu plan de ManeComb vence el ${C.escapeHtml(data.expirationDate || "próximamente")}.`
    }),
    C.textBlock("Para evitar la interrupción del servicio, te recomendamos renovar tu plan antes de la fecha de vencimiento."),
    C.card({
      title: "Plan actual",
      items: [
        ["Plan", data.planName],
        ["Vence", data.expirationDate],
        ["Renovación", data.renewalAmount]
      ]
    }),
    C.button({ text: "Renovar ahora", url: data.renewalUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function trialExpiring(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Tu periodo de prueba está por vencer" }),
    C.greeting(data.name),
    C.alert({
      variant: "warning",
      message: `Tu periodo de prueba gratuita vence el ${C.escapeHtml(data.expirationDate || "próximamente")}.`
    }),
    C.textBlock("Para seguir disfrutando de ManeComb sin interrupciones, elige un plan y completa tu suscripción."),
    C.textBlock("Al suscribirte, conservarás toda la información y configuraciones que has creado durante la prueba."),
    C.button({ text: "Elegir plan", url: data.plansUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function accountSuspended(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Cuenta suspendida" }),
    C.greeting(data.name),
    C.alert({
      variant: "error",
      message: data.reason || "Tu cuenta de ManeComb ha sido suspendida temporalmente."
    }),
    C.textBlock("Durante este periodo, no podrás acceder a la plataforma. A continuación te explicamos los detalles:"),
    C.card({
      title: "Información",
      items: [
        ["Motivo", data.reason],
        ["Fecha de suspensión", data.suspensionDate],
        ["Contacto", data.supportEmail]
      ]
    }),
    C.textBlock("Si consideras que esto es un error o necesitas más información, contáctanos."),
    C.button({ text: "Contactar soporte", url: `mailto:${C.escapeHtml(data.supportEmail || "soporte@manecomb.com")}` }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function accountReactivated(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Cuenta reactivada" }),
    C.greeting(data.name),
    C.alert({
      variant: "success",
      message: "Tu cuenta de ManeComb ha sido reactivada exitosamente."
    }),
    C.textBlock("Ya puedes acceder a la plataforma con todas tus funcionalidades. Tus datos y configuraciones se han conservado."),
    C.button({ text: "Ir al panel", url: data.dashboardUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function weeklyReport(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Reporte semanal", subtitle: `${C.escapeHtml(data.period || "")}` }),
    C.greeting(data.name),
    C.textBlock("Aquí tienes un resumen de la actividad de tu flotilla durante la última semana:"),
    C.card({
      title: "Resumen",
      items: [
        ["Viajes realizados", data.totalTrips],
        ["Kilómetros recorridos", data.totalDistance],
        ["Conductores activos", data.activeDrivers],
        ["Vehículos en operación", data.activeVehicles],
        ["Incidencias reportadas", data.incidents]
      ]
    }),
    data.highlights && data.highlights.length
      ? C.bulletList(data.highlights.map((h) => `Destacado: ${h}`))
      : "",
    C.button({ text: "Ver reporte completo", url: data.reportUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function monthlyReport(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Reporte mensual", subtitle: `${C.escapeHtml(data.period || "")}` }),
    C.greeting(data.name),
    C.textBlock("Aquí tienes el resumen mensual de la operación de tu flotilla:"),
    C.card({
      title: "Indicadores del mes",
      items: [
        ["Viajes totales", data.totalTrips],
        ["Kilómetros recorridos", data.totalDistance],
        ["Horas de operación", data.totalHours],
        ["Conductores activos", data.activeDrivers],
        ["Vehículos registrados", data.totalVehicles],
        ["Incidencias", data.incidents],
        ["Tasa de cumplimiento", data.complianceRate]
      ]
    }),
    data.highlights && data.highlights.length
      ? C.bulletList(data.highlights.map((h) => `Destacado: ${h}`))
      : "",
    C.button({ text: "Ver reporte completo", url: data.reportUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function criticalIncident(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Incidencia crítica", subtitle: data.incidentType || "Alerta del sistema" }),
    C.alert({
      variant: "error",
      message: data.summary || "Se ha detectado una incidencia que requiere atención inmediata."
    }),
    C.card({
      title: "Detalles de la incidencia",
      items: [
        ["Tipo", data.incidentType],
        ["Vehículo", data.vehicleName || "—"],
        ["Conductor", data.driverName || "—"],
        ["Ubicación", data.location || "—"],
        ["Fecha y hora", data.timestamp],
        ["Prioridad", "Crítica"]
      ]
    }),
    data.description ? C.textBlock(C.escapeHtml(data.description)) : "",
    C.button({ text: "Ver incidencia", url: data.incidentUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function newDeviceConnected(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Nuevo dispositivo conectado" }),
    C.greeting(data.name),
    C.alert({
      variant: "info",
      message: "Se ha conectado un nuevo dispositivo a tu cuenta de ManeComb."
    }),
    C.card({
      title: "Información del dispositivo",
      items: [
        ["Dispositivo", data.deviceName || "Desconocido"],
        ["Sistema operativo", data.os || "—"],
        ["Navegador", data.browser || "—"],
        ["Ubicación aproximada", data.location || "—"],
        ["IP", data.ip],
        ["Fecha y hora", data.timestamp]
      ]
    }),
    C.textBlock("Si fuiste tú, no necesitas hacer nada. Si no reconoces este dispositivo, cambia tu contraseña y contacta a soporte."),
    C.button({ text: "Revisar actividad", url: data.securityUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function suspiciousLogin(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Inicio de sesión sospechoso" }),
    C.greeting(data.name),
    C.alert({
      variant: "error",
      message: "Detectamos un intento de inicio de sesión inusual en tu cuenta de ManeComb."
    }),
    C.card({
      title: "Intento de acceso",
      items: [
        ["Ubicación", data.location || "Desconocida"],
        ["IP", data.ip],
        ["Dispositivo", data.device || "Desconocido"],
        ["Fecha y hora", data.timestamp]
      ]
    }),
    C.textBlock("Si no fuiste tú, te recomendamos:"),
    C.bulletList([
      "Cambiar tu contraseña inmediatamente",
      "Revisar los dispositivos conectados",
      "Activar la verificación en dos pasos"
    ]),
    C.button({ text: "Asegurar cuenta", url: data.securityUrl }),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

function identityVerification(data) {
  return buildContent([
    C.logo(),
    C.header({ title: "Verificación de identidad" }),
    C.greeting(data.name),
    C.textBlock("Por motivos de seguridad, necesitamos verificar tu identidad antes de continuar."),
    C.textBlock("Usa el siguiente código de verificación:"),
    `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
      <tr>
        <td align="center" style="padding: 16px 24px;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td align="center" style="padding: 16px 32px; border-radius: 12px; background-color: #F6F7FB; border: 2px dashed #E31E24; letter-spacing: 8px;">
                <span style="font-size: 32px; font-weight: 900; color: #E31E24; font-family: 'Courier New', Courier, monospace;">${C.escapeHtml(data.code)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`,
    C.alert({
      variant: "info",
      message: `Este código expira en ${C.escapeHtml(data.expiresIn || "10 minutos")}. No compartas este código con nadie.`
    }),
    C.textBlock("Si no solicitaste esta verificación, cambia tu contraseña y contacta a soporte."),
    C.helpBlock({ email: data.supportEmail })
  ]);
}

const TEMPLATE_BUILDERS = {
  "welcome": welcome,
  "account-activation": accountActivation,
  "password-reset": passwordReset,
  "password-changed": passwordChanged,
  "email-changed": emailChanged,
  "company-invitation": companyInvitation,
  "admin-invitation": adminInvitation,
  "driver-invitation": driverInvitation,
  "payment-approved": paymentApproved,
  "payment-rejected": paymentRejected,
  "order-created": orderCreated,
  "payment-pending": paymentPending,
  "subscription-activated": subscriptionActivated,
  "subscription-cancelled": subscriptionCancelled,
  "invoice-available": invoiceAvailable,
  "plan-renewal": planRenewal,
  "plan-expiring": planExpiring,
  "trial-expiring": trialExpiring,
  "account-suspended": accountSuspended,
  "account-reactivated": accountReactivated,
  "weekly-report": weeklyReport,
  "monthly-report": monthlyReport,
  "critical-incident": criticalIncident,
  "new-device-connected": newDeviceConnected,
  "suspicious-login": suspiciousLogin,
  "identity-verification": identityVerification
};

function getTemplateBuilder(name) {
  return TEMPLATE_BUILDERS[name];
}

function hasTemplate(name) {
  return Boolean(TEMPLATE_BUILDERS[name]);
}

function getTemplateNames() {
  return Object.keys(TEMPLATE_BUILDERS);
}

module.exports = {
  getTemplateBuilder,
  hasTemplate,
  getTemplateNames,
  TEMPLATE_BUILDERS
};
