const { buildBaseLayout } = require("./templates/base");
const { TEMPLATE_META } = require("./communication.types");

function renderTemplate(templateFn, data) {
  const bodyContent = templateFn(data);
  const meta = TEMPLATE_META[data._template] || {};
  const previewText = data.previewText || meta.subject || "";

  return buildBaseLayout({
    bodyContent,
    previewText
  });
}

function extractSubject(data) {
  const meta = TEMPLATE_META[data._template];
  if (data.subject) return data.subject;
  if (meta?.subject) return meta.subject;
  return "ManeComb";
}

module.exports = {
  renderTemplate,
  extractSubject
};
