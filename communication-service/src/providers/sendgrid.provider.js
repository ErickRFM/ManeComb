const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");

class SendGridProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.SENDGRID;
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName || "ManeComb";
  }

  async send({ to, from, subject, html, text }) {
    try {
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
        return { success: false, error: `SendGrid error ${response.status}: ${errorBody}`, status: response.status };
      }

      return { success: true, id: null };
    } catch (error) {
      return { success: false, error: error.message || String(error), status: 0 };
    }
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

module.exports = { SendGridProvider };
