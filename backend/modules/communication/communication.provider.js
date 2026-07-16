const { PROVIDER } = require("./communication.types");
const logger = require("../../src/services/logger");

class BaseProvider {
  constructor(config) {
    this.config = config;
    this.name = "base";
  }

  async send({ to, from, subject, html, text }) {
    throw new Error("send() debe ser implementado por el proveedor");
  }

  async verifyConnection() {
    throw new Error("verifyConnection() debe ser implementado por el proveedor");
  }
}

class ResendProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.RESEND;
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName || "ManeComb";
  }

  async send({ to, from, subject, html, text }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: from || `${this.fromName} <${this.fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || ""
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Resend error ${response.status}: ${errorBody}`);
    }

    return response.json();
  }

  async verifyConnection() {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: this.fromEmail,
          subject: "Prueba de conexión",
          html: "<p>Prueba</p>"
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

class SmtpProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.SMTP;
    this.host = config.host;
    this.port = config.port;
    this.secure = config.secure;
    this.auth = config.auth;
    this.fromEmail = config.fromEmail;
  }

  async send({ to, from, subject, html, text }) {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: this.auth
    });

    return await transporter.sendMail({
      from: from || this.fromEmail,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
      text: text || ""
    });
  }

  async verifyConnection() {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        auth: this.auth
      });
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}

class SesProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.SES;
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.fromEmail = config.fromEmail;
  }

  async send({ to, from, subject, html, text }) {
    const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
    const client = new SESClient({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey
      }
    });

    const command = new SendEmailCommand({
      Source: from || this.fromEmail,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to]
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: html },
          Text: { Data: text || "" }
        }
      }
    });

    return await client.send(command);
  }

  async verifyConnection() {
    try {
      const { SESClient, GetSendQuotaCommand } = require("@aws-sdk/client-ses");
      const client = new SESClient({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey
        }
      });
      await client.send(new GetSendQuotaCommand());
      return true;
    } catch {
      return false;
    }
  }
}

class MailgunProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.MAILGUN;
    this.domain = config.domain;
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.region = config.region || "us";
  }

  async send({ to, from, subject, html, text }) {
    const url = `https://api${this.region === "eu" ? ".eu" : ""}.mailgun.net/v3/${this.domain}/messages`;
    const formData = new URLSearchParams();
    formData.append("from", from || this.fromEmail);
    if (Array.isArray(to)) to.forEach((t) => formData.append("to", t));
    else formData.append("to", to);
    formData.append("subject", subject);
    formData.append("html", html);
    if (text) formData.append("text", text);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Mailgun error ${response.status}: ${errorBody}`);
    }

    return response.json();
  }

  async verifyConnection() {
    try {
      const url = `https://api${this.region === "eu" ? ".eu" : ""}.mailgun.net/v3/${this.domain}/messages`;
      const formData = new URLSearchParams();
      formData.append("from", this.fromEmail);
      formData.append("to", this.fromEmail);
      formData.append("subject", "Prueba");
      formData.append("text", "Prueba");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

class PostmarkProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.POSTMARK;
    this.serverToken = config.serverToken;
    this.fromEmail = config.fromEmail;
  }

  async send({ to, from, subject, html, text }) {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": this.serverToken,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        From: from || this.fromEmail,
        To: Array.isArray(to) ? to.join(", ") : to,
        Subject: subject,
        HtmlBody: html,
        TextBody: text || ""
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Postmark error ${response.status}: ${errorBody}`);
    }

    return response.json();
  }

  async verifyConnection() {
    try {
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": this.serverToken,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          From: this.fromEmail,
          To: this.fromEmail,
          Subject: "Prueba",
          HtmlBody: "<p>Prueba</p>"
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

class SendGridProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.SENDGRID;
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName || "ManeComb";
  }

  async send({ to, from, subject, html, text }) {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: (Array.isArray(to) ? to : [to]).map((addr) => ({ email: addr })),
            subject
          }
        ],
        from: { email: from || this.fromEmail, name: this.fromName },
        content: [
          { type: "text/html", value: html },
          { type: "text/plain", value: text || "" }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`SendGrid error ${response.status}: ${errorBody}`);
    }

    return response.json();
  }

  async verifyConnection() {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: this.fromEmail }], subject: "Prueba" }],
          from: { email: this.fromEmail },
          content: [{ type: "text/plain", value: "Prueba" }]
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

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
  PROVIDER_CLASSES
};
