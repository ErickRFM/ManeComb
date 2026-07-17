function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowISO() {
  return new Date().toISOString();
}

function randomId(prefix = "") {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  sleep,
  nowISO,
  randomId
};
