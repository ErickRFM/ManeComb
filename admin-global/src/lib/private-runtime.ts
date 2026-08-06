export type PrivateAdminRuntimeInput = {
  production: boolean;
  accessRequired: string | boolean | undefined;
  apiUrl: string | undefined;
  expectedApiHost: string | undefined;
  currentAdminHost?: string | undefined;
  expectedAdminHost?: string | undefined;
};

export type PrivateAdminRuntimeStatus = {
  production: boolean;
  accessRequired: boolean;
  apiUrl: string;
  apiHost: string;
  adminHost: string;
  ready: boolean;
};

function parseBoolean(value: string | boolean | undefined) {
  return value === true || /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function normalizeHostname(value: string | undefined) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

export function validatePrivateAdminRuntime(input: PrivateAdminRuntimeInput): PrivateAdminRuntimeStatus {
  const accessRequired = parseBoolean(input.accessRequired);
  const apiUrl = String(input.apiUrl || '').trim();
  const expectedApiHost = normalizeHostname(input.expectedApiHost || 'admin-api.manecomb.com');
  const expectedAdminHost = normalizeHostname(input.expectedAdminHost || 'admin.manecomb.com');
  const currentAdminHost = normalizeHostname(input.currentAdminHost);

  if (!input.production) {
    return {
      production: false,
      accessRequired,
      apiUrl,
      apiHost: apiUrl ? new URL(apiUrl).hostname : '',
      adminHost: currentAdminHost,
      ready: true,
    };
  }

  if (!accessRequired) {
    throw new Error('Admin Global requiere VITE_PLATFORM_ACCESS_REQUIRED=true en producción.');
  }
  if (!apiUrl) {
    throw new Error('Admin Global requiere VITE_API_URL en producción.');
  }
  if (!expectedAdminHost || currentAdminHost !== expectedAdminHost) {
    throw new Error(`Admin Global solo puede ejecutarse en el hostname privado ${expectedAdminHost}.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error('VITE_API_URL no es una URL válida.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('VITE_API_URL debe usar HTTPS en producción.');
  }
  if (!expectedApiHost || normalizeHostname(parsed.hostname) !== expectedApiHost) {
    throw new Error(`VITE_API_URL debe apuntar al hostname privado ${expectedApiHost}.`);
  }

  return {
    production: true,
    accessRequired: true,
    apiUrl: parsed.toString().replace(/\/$/, ''),
    apiHost: normalizeHostname(parsed.hostname),
    adminHost: currentAdminHost,
    ready: true,
  };
}

export function assertPrivateAdminRuntimeConfiguration() {
  return validatePrivateAdminRuntime({
    production: import.meta.env.PROD,
    accessRequired: import.meta.env.VITE_PLATFORM_ACCESS_REQUIRED,
    apiUrl: import.meta.env.VITE_API_URL,
    expectedApiHost: import.meta.env.VITE_PLATFORM_API_HOST,
    currentAdminHost: globalThis.location?.hostname,
    expectedAdminHost: import.meta.env.VITE_PLATFORM_ADMIN_HOST,
  });
}
