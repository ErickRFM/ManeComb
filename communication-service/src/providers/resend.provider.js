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
        return { success: false, error: `Resend request failed (${response.status})`, status: response.status };
      }
      const data = await response.json();
      return { success: true, id: data?.id || null };
    } catch {
      return { success: false, error: "Resend request failed (network)", status: 0 };
    }
  }

  // Configuration-only check. Readiness must never send an email.
  async verifyConnection() {
    return Boolean(this.apiKey && this.fromEmail);
  }
}

module.exports = { ResendProvider };
