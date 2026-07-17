const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");

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
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        auth: this.auth
      });

      const info = await transporter.sendMail({
        from: from || this.fromEmail,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
        text: text || ""
      });

      return { success: true, id: info?.messageId || null };
    } catch (error) {
      return { success: false, error: error.message || String(error), status: 0 };
    }
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

module.exports = { SmtpProvider };
