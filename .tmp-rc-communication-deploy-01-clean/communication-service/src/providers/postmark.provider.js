const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");

class PostmarkProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = PROVIDER.POSTMARK;
    this.serverToken = config.serverToken;
    this.fromEmail = config.fromEmail;
  }

  async send({ to, from, subject, html, text }) {
    try {
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
        return { success: false, error: `Postmark error ${response.status}: ${errorBody}`, status: response.status };
      }

      const data = await response.json();
      return { success: true, id: data?.MessageID || null };
    } catch (error) {
      return { success: false, error: error.message || String(error), status: 0 };
    }
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

module.exports = { PostmarkProvider };
