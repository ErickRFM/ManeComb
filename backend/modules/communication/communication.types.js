const PRIORITY = {
  CRITICAL: 10,
  HIGH: 5,
  NORMAL: 1,
  LOW: 0
};

const PRIORITY_LABEL = {
  10: "critical",
  5: "high",
  1: "normal",
  0: "low"
};

const CHANNEL = {
  EMAIL: "email",
  WHATSAPP: "whatsapp",
  PUSH: "push",
  SMS: "sms"
};

const PROVIDER = {
  RESEND: "resend",
  SMTP: "smtp",
  SES: "ses",
  MAILGUN: "mailgun",
  POSTMARK: "postmark",
  SENDGRID: "sendgrid"
};

const STATUS = {
  QUEUED: "queued",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  OPENED: "opened",
  CLICKED: "clicked",
  FAILED: "failed",
  BOUNCED: "bounced",
  REJECTED: "rejected",
  CANCELLED: "cancelled"
};

const JOB_STATUS = {
  WAITING: "waiting",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  DELAYED: "delayed",
  CANCELLED: "cancelled"
};

const TEMPLATE = {
  WELCOME: "welcome",
  ACCOUNT_ACTIVATION: "account-activation",
  PASSWORD_RESET: "password-reset",
  PASSWORD_CHANGED: "password-changed",
  EMAIL_CHANGED: "email-changed",
  COMPANY_INVITATION: "company-invitation",
  ADMIN_INVITATION: "admin-invitation",
  DRIVER_INVITATION: "driver-invitation",
  PAYMENT_APPROVED: "payment-approved",
  PAYMENT_REJECTED: "payment-rejected",
  INVOICE_AVAILABLE: "invoice-available",
  PLAN_RENEWAL: "plan-renewal",
  PLAN_EXPIRING: "plan-expiring",
  TRIAL_EXPIRING: "trial-expiring",
  ACCOUNT_SUSPENDED: "account-suspended",
  ACCOUNT_REACTIVATED: "account-reactivated",
  WEEKLY_REPORT: "weekly-report",
  MONTHLY_REPORT: "monthly-report",
  CRITICAL_INCIDENT: "critical-incident",
  NEW_DEVICE_CONNECTED: "new-device-connected",
  SUSPICIOUS_LOGIN: "suspicious-login",
  IDENTITY_VERIFICATION: "identity-verification"
};

const TEMPLATE_PRIORITY = {};
TEMPLATE_PRIORITY[TEMPLATE.PASSWORD_RESET] = PRIORITY.CRITICAL;
TEMPLATE_PRIORITY[TEMPLATE.IDENTITY_VERIFICATION] = PRIORITY.CRITICAL;
TEMPLATE_PRIORITY[TEMPLATE.SUSPICIOUS_LOGIN] = PRIORITY.CRITICAL;
TEMPLATE_PRIORITY[TEMPLATE.NEW_DEVICE_CONNECTED] = PRIORITY.CRITICAL;
TEMPLATE_PRIORITY[TEMPLATE.PAYMENT_APPROVED] = PRIORITY.HIGH;
TEMPLATE_PRIORITY[TEMPLATE.PAYMENT_REJECTED] = PRIORITY.HIGH;
TEMPLATE_PRIORITY[TEMPLATE.ACCOUNT_ACTIVATION] = PRIORITY.HIGH;
TEMPLATE_PRIORITY[TEMPLATE.ADMIN_INVITATION] = PRIORITY.HIGH;
TEMPLATE_PRIORITY[TEMPLATE.DRIVER_INVITATION] = PRIORITY.HIGH;
TEMPLATE_PRIORITY[TEMPLATE.COMPANY_INVITATION] = PRIORITY.HIGH;
TEMPLATE_PRIORITY[TEMPLATE.WELCOME] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.PASSWORD_CHANGED] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.EMAIL_CHANGED] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.INVOICE_AVAILABLE] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.PLAN_RENEWAL] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.ACCOUNT_REACTIVATED] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.WEEKLY_REPORT] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.MONTHLY_REPORT] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.CRITICAL_INCIDENT] = PRIORITY.NORMAL;
TEMPLATE_PRIORITY[TEMPLATE.PLAN_EXPIRING] = PRIORITY.LOW;
TEMPLATE_PRIORITY[TEMPLATE.TRIAL_EXPIRING] = PRIORITY.LOW;
TEMPLATE_PRIORITY[TEMPLATE.ACCOUNT_SUSPENDED] = PRIORITY.LOW;

const TEMPLATE_META = {};
TEMPLATE_META[TEMPLATE.WELCOME] = { category: "onboarding", subject: "Bienvenido a ManeComb" };
TEMPLATE_META[TEMPLATE.ACCOUNT_ACTIVATION] = { category: "security", subject: "Activa tu cuenta de ManeComb" };
TEMPLATE_META[TEMPLATE.PASSWORD_RESET] = { category: "security", subject: "Recuperación de contraseña - ManeComb" };
TEMPLATE_META[TEMPLATE.PASSWORD_CHANGED] = { category: "security", subject: "Tu contraseña ha sido cambiada - ManeComb" };
TEMPLATE_META[TEMPLATE.EMAIL_CHANGED] = { category: "security", subject: "Correo electrónico actualizado - ManeComb" };
TEMPLATE_META[TEMPLATE.COMPANY_INVITATION] = { category: "invitation", subject: "Has sido invitado a ManeComb" };
TEMPLATE_META[TEMPLATE.ADMIN_INVITATION] = { category: "invitation", subject: "Invitación de administrador - ManeComb" };
TEMPLATE_META[TEMPLATE.DRIVER_INVITATION] = { category: "invitation", subject: "Invitación de conductor - ManeComb" };
TEMPLATE_META[TEMPLATE.PAYMENT_APPROVED] = { category: "billing", subject: "Pago aprobado - ManeComb" };
TEMPLATE_META[TEMPLATE.PAYMENT_REJECTED] = { category: "billing", subject: "Pago rechazado - ManeComb" };
TEMPLATE_META[TEMPLATE.INVOICE_AVAILABLE] = { category: "billing", subject: "Factura disponible - ManeComb" };
TEMPLATE_META[TEMPLATE.PLAN_RENEWAL] = { category: "billing", subject: "Tu plan ha sido renovado - ManeComb" };
TEMPLATE_META[TEMPLATE.PLAN_EXPIRING] = { category: "billing", subject: "Tu plan está por vencer - ManeComb" };
TEMPLATE_META[TEMPLATE.TRIAL_EXPIRING] = { category: "billing", subject: "Tu periodo de prueba está por vencer - ManeComb" };
TEMPLATE_META[TEMPLATE.ACCOUNT_SUSPENDED] = { category: "account", subject: "Cuenta suspendida - ManeComb" };
TEMPLATE_META[TEMPLATE.ACCOUNT_REACTIVATED] = { category: "account", subject: "Tu cuenta ha sido reactivada - ManeComb" };
TEMPLATE_META[TEMPLATE.WEEKLY_REPORT] = { category: "report", subject: "Reporte semanal - ManeComb" };
TEMPLATE_META[TEMPLATE.MONTHLY_REPORT] = { category: "report", subject: "Reporte mensual - ManeComb" };
TEMPLATE_META[TEMPLATE.CRITICAL_INCIDENT] = { category: "alert", subject: "Incidencia crítica - ManeComb" };
TEMPLATE_META[TEMPLATE.NEW_DEVICE_CONNECTED] = { category: "security", subject: "Nuevo dispositivo conectado - ManeComb" };
TEMPLATE_META[TEMPLATE.SUSPICIOUS_LOGIN] = { category: "security", subject: "Inicio de sesión sospechoso - ManeComb" };
TEMPLATE_META[TEMPLATE.IDENTITY_VERIFICATION] = { category: "security", subject: "Verificación de identidad - ManeComb" };

const MAX_RETRIES = {
  CRITICAL: 5,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};

const RETRY_DELAYS = {
  [PRIORITY.CRITICAL]: [1000, 5000, 15000, 60000, 300000],
  [PRIORITY.HIGH]: [2000, 10000, 30000],
  [PRIORITY.NORMAL]: [5000, 30000],
  [PRIORITY.LOW]: [10000]
};

const QUEUE_NAMES = {
  EMAILS: "emails",
  WHATSAPP: "whatsapp",
  PUSH: "push"
};

module.exports = {
  PRIORITY,
  PRIORITY_LABEL,
  CHANNEL,
  PROVIDER,
  STATUS,
  JOB_STATUS,
  TEMPLATE,
  TEMPLATE_PRIORITY,
  TEMPLATE_META,
  MAX_RETRIES,
  RETRY_DELAYS,
  QUEUE_NAMES
};
