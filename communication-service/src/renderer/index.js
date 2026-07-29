const { buildBaseLayout } = require("../templates/base");
const { TEMPLATE_META } = require("../core/types");

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

function renderText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderEmail(templateFn, data) {
  const html = renderTemplate(templateFn, data);
  return { subject: extractSubject(data), html, text: renderText(html) };
}

module.exports = {
  renderTemplate,
  renderEmail,
  renderText,
  extractSubject
};
