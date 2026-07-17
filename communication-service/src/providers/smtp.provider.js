const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");
const connectionManager = require("../connection");
const { withTimeout, getTimeoutMs } = require("../timeout");

class SmtpProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.SMTP;
    this.host = config.host;
    this.port = config.port;
    this.secure = config.secure;
    this.auth = config.auth;
    this.fromEmail = config.fromEmail;
    this.transportType = `smtp:${this.host}:${this.port}`;
  }

  async send({ to, from, subject, html, text }) {
    try {
      const nodemailer = require("nodemailer");
      const timeoutMs = getTimeoutMs(0, 30000);

      const transporter = await connectionManager.acquire(this.transportType, async () => {
        return nodemailer.createTransport({
          host: this.host,
          port: this.port,
          secure: this.secure,
          auth: this.auth,
          connectionTimeout: timeoutMs,
          greetingTimeout: timeoutMs,
          socketTimeout: timeoutMs,
          pool: true,
          maxConnections: 5,
          maxMessages: 100
        });
      });

      const info = await withTimeout(
        () => transporter.sendMail({
          from: from || this.fromEmail,
          to: Array.isArray(to) ? to.join(", ") : to,
          subject,
          html,
          text: text || ""
        }),
        timeoutMs,
        "SMTP sendMail"
      );

      connectionManager.release(this.transportType, transporter);

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
        auth: this.auth,
        connectionTimeout: 10000,
        greetingTimeout: 10000
      });
      await transporter.verify();
      await transporter.close();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { SmtpProvider };
