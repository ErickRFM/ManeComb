const { PROVIDER } = require("../core/types");

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

module.exports = { BaseProvider };
