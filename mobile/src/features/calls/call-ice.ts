// RC-MOBILE-CALLS-PRODUCTION-01 Bloque C.4 — ICE config OBLIGATORIA (sin fallback silencioso a STUN).
// Puro/testeable: la obtencion real (GET /api/rtc/config) se inyecta.

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export interface RawIceConfig {
  iceServers?: IceServer[];
  turnEnabled?: boolean;
}
export type IceConfigResult =
  | { ok: true; iceServers: IceServer[]; turnEnabled: boolean }
  | { ok: false; code: 'rtc_config_unavailable' };

function hasUrls(server: IceServer): boolean {
  if (!server || server.urls == null) return false;
  if (Array.isArray(server.urls)) return server.urls.length > 0;
  return String(server.urls).trim().length > 0;
}

// Valida la config del backend. STUN-only y STUN+TURN son validos; vacia/invalida => no disponible.
export function validateIceConfig(config: RawIceConfig | null | undefined): IceConfigResult {
  if (!config || !Array.isArray(config.iceServers)) return { ok: false, code: 'rtc_config_unavailable' };
  const iceServers = config.iceServers.filter(hasUrls);
  if (iceServers.length === 0) return { ok: false, code: 'rtc_config_unavailable' };
  return { ok: true, iceServers, turnEnabled: Boolean(config.turnEnabled) };
}

// Diagnostico sanitizado (NUNCA credenciales/urls completas de TURN).
export function iceConfigDiagnostics(result: IceConfigResult): { turnEnabled: boolean; iceServerCount: number } {
  if (!result.ok) return { turnEnabled: false, iceServerCount: 0 };
  return { turnEnabled: result.turnEnabled, iceServerCount: result.iceServers.length };
}

// Resuelve la config esperando explicitamente al backend. Cualquier fallo/timeout => no disponible
// (NO se inventa STUN). El peer NO debe crearse si esto no es ok.
export async function resolveIceConfig(
  fetchConfig: () => Promise<RawIceConfig>
): Promise<IceConfigResult> {
  try {
    const raw = await fetchConfig();
    return validateIceConfig(raw);
  } catch {
    return { ok: false, code: 'rtc_config_unavailable' };
  }
}
