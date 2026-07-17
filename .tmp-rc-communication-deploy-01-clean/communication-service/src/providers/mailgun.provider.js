const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");

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
    try {
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
        return { success: false, error: `Mailgun error ${response.status}: ${errorBody}`, status: response.status };
      }

      const data = await response.json();
      return { success: true, id: data?.id || null };
    } catch (error) {
      return { success: false, error: error.message || String(error), status: 0 };
    }
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

module.exports = { MailgunProvider };
