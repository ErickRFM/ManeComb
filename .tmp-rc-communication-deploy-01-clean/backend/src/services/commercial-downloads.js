const jwt = require("jsonwebtoken");
const {
  APP_URL,
  COMMERCIAL_BRAND_NAME,
  COMMERCIAL_LEGAL_NAME,
  COMMERCIAL_SUPPORT_EMAIL,
  COMMERCIAL_SUPPORT_PHONE,
  JWT_SECRET
} = require("../config/env");

const DOWNLOAD_AUDIENCE = "combis-commercial-download";
const DOWNLOAD_ISSUER = "combis-api";
const DOWNLOAD_PURPOSE = "commercial_download";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "Pendiente";
  }

  const safeDate = new Date(value);

  if (Number.isNaN(safeDate.getTime())) {
    return "Pendiente";
  }

  return safeDate.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function getCommercialBrandName() {
  return COMMERCIAL_BRAND_NAME || "ManeComb";
}

function getCommercialLegalName() {
  return COMMERCIAL_LEGAL_NAME || getCommercialBrandName();
}

function hasActivatedAccess(order) {
  const activationStatus = String(order?.activationStatus || "").trim();
  const paymentStatus = String(order?.paymentStatus || "").trim();
  const status = String(order?.status || "").trim();

  return (
    activationStatus === "active" ||
    activationStatus === "ready_for_activation" ||
    paymentStatus === "paid" ||
    paymentStatus === "trial_active" ||
    status === "active" ||
    status === "paid"
  );
}

function buildCommercialInvoiceSummary(order) {
  const needsInvoice = Boolean(order?.needsInvoice);
  const paymentStatus = String(order?.paymentStatus || "").trim();
  const issuedAt =
    order?.paymentApprovedAt ||
    order?.activatedAt ||
    order?.trialStartedAt ||
    order?.createdAt ||
    null;
  const status = !needsInvoice
    ? "not_requested"
    : paymentStatus === "paid"
      ? "ready"
      : paymentStatus === "trial_active"
        ? "trial"
        : "pending_payment";

  return {
    status,
    label:
      status === "ready"
        ? "Factura lista"
        : status === "trial"
          ? "Factura en modo prueba"
          : status === "pending_payment"
            ? "Factura en espera de pago"
            : "Factura no solicitada",
    invoiceNumber: `FAC-${String(order?.referenceCode || "MNCB-0000").trim()}`,
    issuedAt,
    needsInvoice,
    legalName:
      String(order?.billingProfile?.legalName || "").trim() ||
      String(order?.companyName || "").trim() ||
      "Sin razón social",
    taxId: String(order?.billingProfile?.taxId || "").trim(),
    billingEmail:
      normalizeEmail(order?.billingProfile?.billingEmail) || normalizeEmail(order?.email),
    billingAddress: String(order?.billingProfile?.billingAddress || "").trim(),
    total: Number(order?.totalPrice || 0),
    currency: "MXN"
  };
}

function signCommercialDownloadToken({ assetCode, order, user }) {
  const ownerUserId = String(order?.ownerUserId || user?.id || "").trim() || null;
  const ownerEmail =
    normalizeEmail(order?.ownerAccountEmail) ||
    normalizeEmail(order?.email) ||
    normalizeEmail(user?.email);

  return jwt.sign(
    {
      purpose: DOWNLOAD_PURPOSE,
      assetCode: String(assetCode || "").trim(),
      orderId: String(order?.id || "").trim(),
      referenceCode: String(order?.referenceCode || "").trim(),
      ownerUserId,
      ownerEmail
    },
    JWT_SECRET,
    {
      audience: DOWNLOAD_AUDIENCE,
      expiresIn: "7d",
      issuer: DOWNLOAD_ISSUER,
      subject: ownerUserId || ownerEmail || String(order?.referenceCode || "").trim()
    }
  );
}

function verifyCommercialDownloadToken(token) {
  const payload = jwt.verify(String(token || "").trim(), JWT_SECRET, {
    audience: DOWNLOAD_AUDIENCE,
    issuer: DOWNLOAD_ISSUER
  });

  if (payload?.purpose !== DOWNLOAD_PURPOSE) {
    throw new Error("Token de descarga inválido");
  }

  return payload;
}

function isCommercialDownloadAuthorized(order, payload) {
  const payloadOwnerUserId = String(payload?.ownerUserId || "").trim();
  const payloadOwnerEmail = normalizeEmail(payload?.ownerEmail);
  const orderOwnerUserId = String(order?.ownerUserId || "").trim();
  const orderOwnerEmail = normalizeEmail(order?.ownerAccountEmail) || normalizeEmail(order?.email);

  if (payloadOwnerUserId && orderOwnerUserId && payloadOwnerUserId === orderOwnerUserId) {
    return true;
  }

  return Boolean(payloadOwnerEmail && orderOwnerEmail && payloadOwnerEmail === orderOwnerEmail);
}

function buildCommercialDownloadables(order, user = null) {
  const invoiceSummary = buildCommercialInvoiceSummary(order);
  const starterFleet = Array.isArray(order?.starterFleet) ? order.starterFleet : [];
  const canDownloadActivationKit = hasActivatedAccess(order);

  return [
    {
      code: "activation-kit",
      title: "Kit de activación",
      description: "Guía de acceso, credenciales comerciales y siguiente paso operativo.",
      fileName: `${order.referenceCode}-kit-activacion.html`,
      kind: "html",
      available: canDownloadActivationKit
    },
    {
      code: "starter-fleet",
      title: "Plantilla de flotilla",
      description: "CSV con la base sugerida de unidades, turnos y choferes.",
      fileName: `${order.referenceCode}-flotilla.csv`,
      kind: "csv",
      available: starterFleet.length > 0
    },
    {
      code: "invoice-summary",
      title: invoiceSummary.needsInvoice ? "Factura comercial" : "Comprobante comercial",
      description: "Resumen fiscal y detalle de la orden asociado a tu cuenta.",
      fileName: `${order.referenceCode}-${invoiceSummary.needsInvoice ? "factura" : "comprobante"}.html`,
      kind: "html",
      available: true
    }
  ].map((asset) => {
    const token = user && asset.available ? signCommercialDownloadToken({ assetCode: asset.code, order, user }) : null;

    return {
      ...asset,
      token,
      urlPath: token ? `/api/commercial/downloads/${encodeURIComponent(token)}` : null
    };
  });
}

function buildActivationKitHtml(order) {
  const companyName = escapeHtml(order?.companyName || "Cliente");
  const contactName = escapeHtml(order?.contactName || "Equipo");
  const supportEmail = escapeHtml(COMMERCIAL_SUPPORT_EMAIL || "soporte@manecomb.app");
  const supportPhone = escapeHtml(COMMERCIAL_SUPPORT_PHONE || "Pendiente");
  const portalUrl = escapeHtml(`${APP_URL.replace(/\/$/, "")}/portal`);
  const legalName = escapeHtml(getCommercialLegalName());
  const brandName = escapeHtml(getCommercialBrandName());

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(order?.referenceCode)} - Kit de activación</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px; }
    .sheet { max-width: 820px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 32px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08); }
    .eyebrow { color: #be123c; font-size: 12px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; }
    h1 { margin: 8px 0 18px; font-size: 34px; }
    p, li { line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin: 24px 0; }
    .card { border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px; background: #f8fafc; }
    .label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
    .value { font-size: 18px; font-weight: 700; }
    .steps { margin-top: 28px; padding-left: 18px; }
    .footer { margin-top: 28px; font-size: 14px; color: #475569; }
    a { color: #be123c; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="eyebrow">${brandName}</div>
    <h1>Kit de activación</h1>
    <p>Hola ${contactName}, este archivo confirma que la cuenta comercial de <strong>${companyName}</strong> ya tiene acceso al paquete <strong>${escapeHtml(order?.planName || "Plan contratado")}</strong>.</p>
    <div class="grid">
      <div class="card">
        <div class="label">Referencia</div>
        <div class="value">${escapeHtml(order?.referenceCode)}</div>
      </div>
      <div class="card">
        <div class="label">Estado</div>
        <div class="value">${escapeHtml(order?.activationStatus || order?.paymentStatus || "Pendiente")}</div>
      </div>
      <div class="card">
        <div class="label">Portal del cliente</div>
        <div class="value"><a href="${portalUrl}">${portalUrl}</a></div>
      </div>
      <div class="card">
        <div class="label">Soporte</div>
        <div class="value">${supportEmail}<br />${supportPhone}</div>
      </div>
    </div>
    <h2>Siguientes pasos</h2>
    <ol class="steps">
      <li>Ingresa al portal del cliente y confirma perfil, contacto y facturación.</li>
      <li>Descarga la plantilla de flotilla si quieres arrancar con una base sugerida.</li>
      <li>Comparte esta referencia con tu equipo si requieren seguimiento comercial.</li>
      <li>Si necesitas soporte, responde al canal oficial de ${legalName}.</li>
    </ol>
    <p class="footer">Archivo emitido para la cuenta asociada a ${escapeHtml(normalizeEmail(order?.ownerAccountEmail) || normalizeEmail(order?.email))}.</p>
  </div>
</body>
</html>`;
}

function buildInvoiceHtml(order) {
  const summary = buildCommercialInvoiceSummary(order);
  const billingAddress = escapeHtml(summary.billingAddress || "Pendiente");
  const billingEmail = escapeHtml(summary.billingEmail || "Pendiente");
  const legalName = escapeHtml(summary.legalName);
  const taxId = escapeHtml(summary.taxId || "Pendiente");
  const brandName = escapeHtml(getCommercialBrandName());

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(summary.invoiceNumber)} - ${brandName}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #fff7ed; color: #111827; margin: 0; padding: 32px; }
    .sheet { max-width: 780px; margin: 0 auto; background: white; border-radius: 24px; padding: 32px; box-shadow: 0 18px 42px rgba(17, 24, 39, 0.08); }
    .top { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .pill { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #fee2e2; color: #b91c1c; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .table { width: 100%; border-collapse: collapse; margin-top: 28px; }
    .table th, .table td { text-align: left; padding: 14px 12px; border-bottom: 1px solid #e5e7eb; }
    .muted { color: #6b7280; }
    .total { font-size: 28px; font-weight: 700; text-align: right; margin-top: 22px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="muted">${brandName}</div>
        <h1>${escapeHtml(summary.invoiceNumber)}</h1>
        <p class="muted">Emitido: ${escapeHtml(formatDate(summary.issuedAt))}</p>
      </div>
      <div class="pill">${escapeHtml(summary.label)}</div>
    </div>
    <h2>Facturación</h2>
    <p><strong>${legalName}</strong><br />RFC / ID fiscal: ${taxId}<br />${billingEmail}<br />${billingAddress}</p>
    <table class="table">
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Referencia</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(order?.planName || "Plan comercial")}</td>
          <td>${escapeHtml(order?.referenceCode || "Sin referencia")}</td>
          <td>${escapeHtml(formatCurrency(summary.total))}</td>
        </tr>
      </tbody>
    </table>
    <div class="total">Total: ${escapeHtml(formatCurrency(summary.total))}</div>
    <p class="muted">Documento ligado a la cuenta ${escapeHtml(normalizeEmail(order?.ownerAccountEmail) || normalizeEmail(order?.email))}.</p>
  </div>
</body>
</html>`;
}

function buildStarterFleetCsv(order) {
  const rows = Array.isArray(order?.starterFleet) ? order.starterFleet : [];
  const header = ["vehicleCode", "label", "status", "suggestedDriver", "suggestedShift"];
  const contentRows = rows.map((item) =>
    [
      item.vehicleCode,
      item.label,
      item.status,
      item.suggestedDriver,
      item.suggestedShift
    ]
      .map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`)
      .join(",")
  );

  return [header.join(","), ...contentRows].join("\n");
}

function buildCommercialDownloadResponse(order, assetCode) {
  const safeAssetCode = String(assetCode || "").trim();

  if (safeAssetCode === "activation-kit") {
    if (!hasActivatedAccess(order)) {
      throw new Error("La orden aún no tiene acceso a este archivo");
    }

    return {
      contentType: "text/html; charset=utf-8",
      body: buildActivationKitHtml(order),
      fileName: `${order.referenceCode}-kit-activacion.html`
    };
  }

  if (safeAssetCode === "starter-fleet") {
    if (!Array.isArray(order?.starterFleet) || !order.starterFleet.length) {
      throw new Error("No hay una plantilla de flotilla disponible para esta orden");
    }

    return {
      contentType: "text/csv; charset=utf-8",
      body: buildStarterFleetCsv(order),
      fileName: `${order.referenceCode}-flotilla.csv`
    };
  }

  if (safeAssetCode === "invoice-summary") {
    return {
      contentType: "text/html; charset=utf-8",
      body: buildInvoiceHtml(order),
      fileName: `${order.referenceCode}-factura.html`
    };
  }

  throw new Error("Activo de descarga no soportado");
}

module.exports = {
  buildCommercialDownloadables,
  buildCommercialDownloadResponse,
  buildCommercialInvoiceSummary,
  isCommercialDownloadAuthorized,
  verifyCommercialDownloadToken
};
