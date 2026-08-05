export const apiPath = '/api';

export type RuntimeUrlKind = 'api' | 'socket';
export type RuntimeTarget = 'production' | 'configured';
export type RuntimeUrlSource = 'configured' | 'fallback';

export type ResolveRuntimeUrlOptions = {
  allowLocalHttp?: boolean;
};

function parseUrl(value: string | undefined | null) {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isLocalHostname(hostname: string | null | undefined) {
  if (!hostname) return true;

  const normalizedHostname = hostname.toLowerCase();
  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '0.0.0.0' ||
    normalizedHostname === 'tu_ip_local' ||
    normalizedHostname === '192.168.x.x' ||
    normalizedHostname.startsWith('127.') ||
    normalizedHostname.startsWith('10.') ||
    normalizedHostname.startsWith('192.168.')
  ) {
    return true;
  }

  const match = normalizedHostname.match(/^172\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isRenderProductionHost(hostname: string | null | undefined) {
  return Boolean(hostname && hostname.toLowerCase() === 'manecomb.onrender.com');
}

function isAllowedRuntimeUrl(url: URL, allowLocalHttp: boolean) {
  const localHostname = isLocalHostname(url.hostname);

  if (url.protocol === 'https:' && !localHostname) {
    return true;
  }

  return allowLocalHttp && localHostname && ['http:', 'https:'].includes(url.protocol);
}

function inferRuntimeTarget(hostname: string): RuntimeTarget {
  return isRenderProductionHost(hostname) ? 'production' : 'configured';
}

export function resolveRuntimeUrl(
  value: string | undefined,
  fallbackValue: string,
  kind: RuntimeUrlKind = 'api',
  options: ResolveRuntimeUrlOptions = {}
) {
  const fallbackUrl = parseUrl(fallbackValue);
  const explicitUrl = parseUrl(value);
  const explicitAllowed = Boolean(
    explicitUrl && isAllowedRuntimeUrl(explicitUrl, Boolean(options.allowLocalHttp))
  );
  const parsedUrl = explicitAllowed ? explicitUrl : fallbackUrl;

  if (!parsedUrl) {
    return {
      source: 'fallback' as RuntimeUrlSource,
      target: 'production' as RuntimeTarget,
      url: fallbackValue,
    };
  }

  const pathname = (
    parsedUrl.pathname && parsedUrl.pathname !== '/'
      ? parsedUrl.pathname
      : kind === 'api'
        ? apiPath
        : ''
  ).replace(/\/$/, '');

  return {
    source: (explicitAllowed ? 'configured' : 'fallback') as RuntimeUrlSource,
    target: inferRuntimeTarget(parsedUrl.hostname),
    url: `${parsedUrl.protocol}//${parsedUrl.host}${pathname}`,
  };
}
