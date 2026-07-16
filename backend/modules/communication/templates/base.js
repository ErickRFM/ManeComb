function buildBaseLayout({ bodyContent, previewText }) {
  const escapedPreview = (previewText || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>ManeComb</title>
  <style type="text/css">
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }

    body {
      margin: 0;
      padding: 0;
      background-color: #F6F7FB;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    table {
      border-collapse: collapse;
    }

    td {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    a {
      color: #E31E24;
      text-decoration: none;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background-color: #0D1117 !important;
      }
      .email-container {
        background-color: #0D1117 !important;
      }
      .email-content {
        background-color: #141A22 !important;
      }
      .email-text {
        color: #F4F7FB !important;
      }
      .email-muted {
        color: #A8B1C2 !important;
      }
      .email-line {
        border-color: #374151 !important;
      }
      .email-surface {
        background-color: #1B2430 !important;
      }
      .email-card {
        background-color: #1B2430 !important;
        border-color: #374151 !important;
      }
    }

    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-padding {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      .email-button {
        width: 100% !important;
        display: block !important;
      }
      .email-button a {
        width: 100% !important;
        display: block !important;
        box-sizing: border-box !important;
      }
      .email-stack {
        display: block !important;
        width: 100% !important;
      }
      .email-hide-mobile {
        display: none !important;
      }
    }

    @media only screen and (max-width: 420px) {
      .email-content {
        border-radius: 0 !important;
      }
    }

    .gmail-fix {
      display: none;
      display: none !important;
    }

    .apple-link a {
      color: inherit !important;
      text-decoration: none !important;
    }
  </style>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style type="text/css">
    table { border-collapse: collapse; }
    td { font-family: 'Segoe UI', Arial, sans-serif; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #F6F7FB; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased;">
  <!--[if mso]>
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F7FB;">
  <tr><td align="center">
  <![endif]-->
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background-color: #F6F7FB;">
    <tr>
      <td align="center" style="padding: 0;">
        <!--[if mso]>
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="600">
        <tr><td>
        <![endif]-->
        <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" class="email-container" style="max-width: 600px; width: 100%; background-color: #F6F7FB;">
          <tr>
            <td align="center" style="padding: 0;">
              <!-- Preview text -->
              <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; line-height: 1px; font-size: 1px;">
                ${escapedPreview}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
              </div>
              <!-- Main content -->
              <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" class="email-content" style="background-color: #FFFFFF; border-radius: 0;">
                ${bodyContent}
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
  <!--[if mso]>
  </td></tr>
  </table>
  <![endif]-->
</body>
</html>`;
}

module.exports = { buildBaseLayout };
