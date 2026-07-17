const { BaseProvider } = require("./base.provider");
const { PROVIDER } = require("../core/types");

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
    try {
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

      const result = await client.send(command);
      return { success: true, id: result?.MessageId || null };
    } catch (error) {
      return { success: false, error: error.message || String(error), status: 0 };
    }
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

module.exports = { SesProvider };
