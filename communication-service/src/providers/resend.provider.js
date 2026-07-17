const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");

class ResendProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.RESEND;
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName || "ManeComb";
    this.replyTo = config.replyTo || "";
  }

  async send({ to, from, subject, html, text }) {
    try {
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
          text: text || "",
          ...(this.replyTo ? { reply_to: this.replyTo } : {})
        })
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return { success: false, error: `Resend error ${response.status}: ${errorBody}`, status: response.status };
      }

      const data = await response.json();
      return { success: true, id: data?.id || null };
    } catch (error) {
      return { success: false, error: error.message || String(error), status: 0 };
    }
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

module.exports = { ResendProvider };
