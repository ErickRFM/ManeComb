const { PROVIDER } = require("../core/types");
const { ResendProvider } = require("./resend.provider");
const { SmtpProvider } = require("./smtp.provider");
const { SesProvider } = require("./ses.provider");
const { MailgunProvider } = require("./mailgun.provider");
const { PostmarkProvider } = require("./postmark.provider");
const { SendGridProvider } = require("./sendgrid.provider");
const { BaseProvider } = require("./base.provider");

const PROVIDER_CLASSES = {
  [PROVIDER.RESEND]: ResendProvider,
  [PROVIDER.SMTP]: SmtpProvider,
  [PROVIDER.SES]: SesProvider,
  [PROVIDER.MAILGUN]: MailgunProvider,
  [PROVIDER.POSTMARK]: PostmarkProvider,
  [PROVIDER.SENDGRID]: SendGridProvider
};

function createProvider(type, config) {
  const ProviderClass = PROVIDER_CLASSES[type];
  if (!ProviderClass) {
    throw new Error(`Proveedor desconocido: ${type}`);
  }
  return new ProviderClass(config);
}

module.exports = {
  createProvider,
  BaseProvider,
  PROVIDER_CLASSES,
  ResendProvider,
  SmtpProvider,
  SesProvider,
  MailgunProvider,
  PostmarkProvider,
  SendGridProvider
};
