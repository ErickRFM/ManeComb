function escapeHtml(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function logo() {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td align="center" style="padding: 40px 0 30px 0;">
        <img
          src="https://manecomb1.pages.dev/logo-email.png"
          alt="ManeComb"
          width="160"
          height="auto"
          style="display: block; width: 160px; height: auto; border: 0; outline: none;"
        />
      </td>
    </tr>
  </table>`;
}

function header({ title, subtitle }) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td align="center" style="padding: 10px 24px 20px 24px;">
        <h1 style="margin: 0; font-size: 24px; line-height: 32px; font-weight: 700; color: #171A20; mso-line-height-rule: exactly; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          ${escapeHtml(title)}
        </h1>
        ${subtitle ? `<p style="margin: 8px 0 0 0; font-size: 15px; line-height: 22px; color: #71788A; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(subtitle)}</p>` : ""}
      </td>
    </tr>
  </table>`;
}

function textBlock(content) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 6px 24px;">
        <p style="margin: 0; font-size: 15px; line-height: 24px; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          ${content}
        </p>
      </td>
    </tr>
  </table>`;
}

function button({ text, url, variant }) {
  const isPrimary = variant !== "secondary";
  const bgColor = isPrimary ? "#E31E24" : "transparent";
  const textColor = isPrimary ? "#FFFFFF" : "#E31E24";
  const border = isPrimary ? "none" : "2px solid #E31E24";

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td align="center" style="padding: 16px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="border-radius: 8px; background-color: ${bgColor};" bgcolor="${bgColor}">
              <a href="${escapeHtml(url)}" target="_blank"
                style="display: inline-block; padding: 13px 32px; border-radius: 8px; font-size: 15px; line-height: 20px; font-weight: 600; text-decoration: none; color: ${textColor}; background-color: ${bgColor}; border: ${border}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; mso-hide: all;">
                ${escapeHtml(text)}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function alert({ variant, message }) {
  const colors = {
    info: { bg: "#EBF0FF", border: "#2F6FF3", text: "#1a3a7a" },
    success: { bg: "#E6F7ED", border: "#1C9B53", text: "#0d5c2f" },
    warning: { bg: "#FFF8E6", border: "#C98A14", text: "#7a5200" },
    error: { bg: "#FDECEC", border: "#D83B3B", text: "#8a1a1a" }
  };
  const c = colors[variant] || colors.info;

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 10px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-radius: 8px; background-color: ${c.bg}; border-left: 4px solid ${c.border};" bgcolor="${c.bg}">
          <tr>
            <td style="padding: 14px 18px; font-size: 14px; line-height: 20px; color: ${c.text}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
              ${escapeHtml(message)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function card({ title, items }) {
  const rows = (items || [])
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding: 6px 0; font-size: 14px; line-height: 20px; color: #71788A; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(label)}</td>
          <td style="padding: 6px 0; font-size: 14px; line-height: 20px; color: #171A20; font-weight: 600; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(String(value))}</td>
        </tr>`
    )
    .join("");

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 10px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-radius: 12px; background-color: #F6F7FB; border: 1px solid #E8EBF0;" bgcolor="#F6F7FB">
          ${title ? `<tr><td style="padding: 18px 18px 6px 18px; font-size: 15px; line-height: 20px; font-weight: 700; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(title)}</td></tr>` : ""}
          <tr>
            <td style="padding: ${title ? "6px" : "18px"} 18px 18px 18px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                ${rows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function separator() {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 10px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
          <tr>
            <td style="border-bottom: 1px solid #E8EBF0; line-height: 1px; font-size: 1px;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function spacer({ height }) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 0; line-height: 1px; font-size: 1px;" height="${height || 16}">&nbsp;</td>
    </tr>
  </table>`;
}

function badge({ text, variant }) {
  const colors = {
    success: { bg: "#E6F7ED", text: "#1C9B53" },
    warning: { bg: "#FFF8E6", text: "#C98A14" },
    error: { bg: "#FDECEC", text: "#D83B3B" },
    info: { bg: "#EBF0FF", text: "#2F6FF3" }
  };
  const c = colors[variant] || colors.info;

  return `<span style="display: inline-block; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 700; line-height: 16px; color: ${c.text}; background-color: ${c.bg}; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(text)}</span>`;
}

function callout({ icon, title, message }) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 10px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-radius: 12px; background-color: #F6F7FB;" bgcolor="#F6F7FB">
          <tr>
            <td style="padding: 18px;">
              ${icon ? `<p style="margin: 0 0 6px 0; font-size: 20px;">${icon}</p>` : ""}
              ${title ? `<p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(title)}</p>` : ""}
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71788A; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(message)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function summaryTable(headers, rows) {
  const headerCells = headers.map((h) => `<th style="padding: 8px 12px; font-size: 12px; font-weight: 700; color: #71788A; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; border-bottom: 2px solid #E8EBF0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(h)}</th>`).join("");
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell) =>
              `<td style="padding: 10px 12px; font-size: 14px; line-height: 20px; color: #171A20; border-bottom: 1px solid #E8EBF0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(String(cell))}</td>`
          )
          .join("")}</tr>`
    )
    .join("");

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 10px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: collapse;">
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </td>
    </tr>
  </table>`;
}

function invoiceSummary({ reference, amount, date, items }) {
  const itemRows = (items || [])
    .map(
      (item) => `<tr>
        <td style="padding: 8px 0; font-size: 14px; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(item.description)}</td>
        <td style="padding: 8px 0; font-size: 14px; color: #71788A; text-align: right; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(item.quantity || "1")}</td>
        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #171A20; text-align: right; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(item.amount)}</td>
      </tr>`
    )
    .join("");

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 10px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-radius: 12px; border: 1px solid #E8EBF0;" bgcolor="#FFFFFF">
          <tr>
            <td style="padding: 18px;">
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
                <tr>
                  <td style="font-size: 12px; color: #71788A; padding-bottom: 4px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Referencia</td>
                  <td style="font-size: 12px; color: #71788A; padding-bottom: 4px; text-align: right; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(date || "")}</td>
                </tr>
                <tr>
                  <td style="font-size: 18px; font-weight: 700; color: #171A20; padding-bottom: 16px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(reference)}</td>
                  <td style="font-size: 18px; font-weight: 700; color: #E31E24; padding-bottom: 16px; text-align: right; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(amount)}</td>
                </tr>
              </table>
              ${items && items.length ? `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="border-collapse: collapse; border-top: 1px solid #E8EBF0;">
                <thead>
                  <tr>
                    <th style="padding: 8px 0; font-size: 12px; font-weight: 700; color: #71788A; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Concepto</th>
                    <th style="padding: 8px 0; font-size: 12px; font-weight: 700; color: #71788A; text-align: right; text-transform: uppercase; letter-spacing: 0.5px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Cant.</th>
                    <th style="padding: 8px 0; font-size: 12px; font-weight: 700; color: #71788A; text-align: right; text-transform: uppercase; letter-spacing: 0.5px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">Monto</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function helpBlock({ email, docsUrl }) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td align="center" style="padding: 16px 24px 8px 24px;">
        <p style="margin: 0; font-size: 13px; line-height: 20px; color: #71788A; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          ¿Necesitas ayuda?
          ${email ? `<br/><a href="mailto:${escapeHtml(email)}" style="color: #E31E24; text-decoration: none; font-weight: 600;">${escapeHtml(email)}</a>` : ""}
          ${docsUrl ? `<br/><a href="${escapeHtml(docsUrl)}" style="color: #E31E24; text-decoration: none; font-weight: 600;">Centro de ayuda</a>` : ""}
        </p>
      </td>
    </tr>
  </table>`;
}

function footer({ year, legalName }) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 24px 24px 32px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
          <tr>
            <td style="padding-bottom: 16px; border-bottom: 1px solid #E8EBF0; line-height: 1px; font-size: 1px;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding-top: 16px;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #9CA3AF; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                &copy; ${year || new Date().getFullYear()} ${legalName || "ManeComb"}. Todos los derechos reservados.
              </p>
              <p style="margin: 4px 0 0 0; font-size: 12px; line-height: 18px; color: #9CA3AF; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                Este correo fue enviado automáticamente. Si tienes dudas, contacta a soporte.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function greeting(name) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 8px 24px;">
        <p style="margin: 0; font-size: 15px; line-height: 24px; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          Hola ${escapeHtml(name || "usuario")},
        </p>
      </td>
    </tr>
  </table>`;
}

function bulletList(items) {
  const lis = (items || [])
    .map(
      (item) =>
        `<tr>
          <td style="padding: 4px 0 4px 16px; font-size: 14px; line-height: 20px; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            <span style="color: #E31E24; margin-right: 8px;">&bull;</span>${escapeHtml(item)}
          </td>
        </tr>`
    )
    .join("");

  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 6px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">${lis}</table>
      </td>
    </tr>
  </table>`;
}

function infoLine({ label, value }) {
  return `<table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
    <tr>
      <td style="padding: 4px 24px;">
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%">
          <tr>
            <td style="font-size: 14px; color: #71788A; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding-right: 12px; white-space: nowrap;">${escapeHtml(label)}</td>
            <td style="font-size: 14px; font-weight: 600; color: #171A20; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">${escapeHtml(String(value))}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

const LIGHT_BG = "#FFFFFF";
const LIGHT_SURFACE = "#F6F7FB";
const LIGHT_TEXT = "#171A20";
const LIGHT_MUTED = "#71788A";
const LIGHT_LINE = "#E8EBF0";

const DARK_BG = "#0D1117";
const DARK_SURFACE = "#141A22";
const DARK_TEXT = "#F4F7FB";
const DARK_MUTED = "#A8B1C2";
const DARK_LINE = "#374151";

const ACCENT = "#E31E24";
const ACCENT_STRONG = "#C4171C";
const SUCCESS = "#1C9B53";
const WARNING = "#C98A14";
const DANGER = "#D83B3B";
const INFO = "#2F6FF3";

module.exports = {
  escapeHtml,
  logo,
  header,
  textBlock,
  button,
  alert,
  card,
  separator,
  spacer,
  badge,
  callout,
  summaryTable,
  invoiceSummary,
  helpBlock,
  footer,
  greeting,
  bulletList,
  infoLine,
  LIGHT_BG,
  LIGHT_SURFACE,
  LIGHT_TEXT,
  LIGHT_MUTED,
  LIGHT_LINE,
  DARK_BG,
  DARK_SURFACE,
  DARK_TEXT,
  DARK_MUTED,
  DARK_LINE,
  ACCENT,
  ACCENT_STRONG,
  SUCCESS,
  WARNING,
  DANGER,
  INFO
};
