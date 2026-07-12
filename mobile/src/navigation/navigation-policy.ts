type NavigationParams = Record<string, unknown> | undefined;

export const NAVIGATION_DEDUP_WINDOW_MS = 600;

function stableParams(params: NavigationParams) {
  if (!params) {
    return '';
  }

  return JSON.stringify(
    Object.keys(params)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = params[key];
        return result;
      }, {})
  );
}

export function createNavigationSignature(name: string, params?: NavigationParams) {
  return `${name}:${stableParams(params)}`;
}

export class NavigationRequestGuard {
  private lastRequest: { signature: string; timestamp: number } | null = null;

  shouldIgnore(input: {
    currentName?: string;
    currentParams?: NavigationParams;
    destinationName: string;
    destinationParams?: NavigationParams;
    now?: number;
  }) {
    const now = input.now ?? Date.now();
    const destinationSignature = createNavigationSignature(
      input.destinationName,
      input.destinationParams
    );
    const currentSignature = input.currentName
      ? createNavigationSignature(input.currentName, input.currentParams)
      : null;

    if (currentSignature === destinationSignature) {
      return true;
    }

    if (
      this.lastRequest?.signature === destinationSignature &&
      now - this.lastRequest.timestamp < NAVIGATION_DEDUP_WINDOW_MS
    ) {
      return true;
    }

    this.lastRequest = { signature: destinationSignature, timestamp: now };
    return false;
  }

  clear() {
    this.lastRequest = null;
  }
}

export class LatestNavigationRequest {
  private sequence = 0;

  begin() {
    this.sequence += 1;
    return this.sequence;
  }

  isLatest(request: number) {
    return request === this.sequence;
  }
}

const SECONDARY_MODULE_ROOTS = new Set([
  '/incidencias',
  '/usuarios',
  '/chat',
  '/radio',
  '/checklist',
  '/perfil',
]);

export function shouldReturnToMapOnAndroidBack(currentRoute?: string) {
  return Boolean(currentRoute && SECONDARY_MODULE_ROOTS.has(currentRoute));
}
