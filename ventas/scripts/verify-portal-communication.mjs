import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ventasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(ventasRoot, '..');
const read = (base, relative) => fs.readFileSync(path.join(base, relative), 'utf8').replace(/\r\n/g, '\n');

const app = read(ventasRoot, 'src/App.tsx');
const routeRegistry = read(ventasRoot, 'features/portal/navigation/portal-route-registry.ts');
const access = read(ventasRoot, 'features/portal/utils/access.ts');
const appStore = read(ventasRoot, 'src/store/use-app-store.ts');
const runtime = read(ventasRoot, 'features/portal/communication/communication-runtime.tsx');
const callRuntime = read(ventasRoot, 'features/portal/communication/web-call-runtime.ts');
const callStore = read(ventasRoot, 'features/portal/communication/call-store.ts');
const chatStore = read(ventasRoot, 'features/portal/communication/communication-store.ts');
const e2eeStore = read(ventasRoot, 'features/portal/communication/e2ee-store.ts');
const media = read(ventasRoot, 'features/portal/communication/authenticated-media.tsx');
const api = read(ventasRoot, 'features/portal/communication/api.ts');
const headers = read(ventasRoot, 'public/_headers');
const backendCapabilities = read(repoRoot, 'backend/src/services/enterprise-capabilities.js');
const backendChat = read(repoRoot, 'backend/src/modules/chat/routes.js');
const backendRtc = read(repoRoot, 'backend/src/modules/rtc/routes.js');

function assert(condition, message) {
  if (!condition) throw new Error(`[portal-communication] ${message}`);
}

assert(routeRegistry.includes("'/portal/comunicacion'"), 'falta ruta canónica /portal/comunicacion');
assert(routeRegistry.includes("permission: 'communication'"), 'la ruta no exige capacidad de comunicación');
assert(app.includes('PortalCommunicationRuntime'), 'el runtime global no está montado');
assert(app.includes('PortalCommunicationScreen'), 'la pantalla de Comunicación no está registrada');
assert(access.includes("communication: 'communication.chat.access'"), 'Portal no consume communication.chat.access');
assert(access.includes("communication.rtc.access"), 'Portal no consume communication.rtc.access');

assert(appStore.includes('getSharedPortalRealtimeSocket'), 'el socket canónico del Portal no se expone');
assert(appStore.includes('subscribeSharedPortalRealtimeSocket'), 'falta suscripción al socket canónico');
const communicationDir = path.join(ventasRoot, 'features/portal/communication');
const communicationFiles = fs.readdirSync(communicationDir).filter((name) => /\.(ts|tsx)$/.test(name));
for (const file of communicationFiles) {
  const source = read(communicationDir, file);
  assert(!/\bio\s*\(/.test(source), `${file} crea un segundo Socket.IO`);
}
assert(runtime.includes('subscribeSharedPortalRealtimeSocket'), 'Comunicación no se enlaza al socket compartido');

assert(callRuntime.includes('getPortalRtcIceConfig'), 'WebRTC no obtiene ICE/TURN del backend');
assert(!/stun:|turn:/i.test(callRuntime), 'WebRTC contiene STUN/TURN hardcodeado');
assert(callRuntime.includes("socket.emit('rtc:join', { callId }"), 'WebRTC no hace join por callId autoritativo');
assert(callRuntime.includes('evaluateConnected'), 'CONNECTED no usa la policy compartida');
assert(callRuntime.includes('remoteAudioSignals'), 'CONNECTED no exige audio remoto vivo');
assert(callStore.includes('emitStartCall'), 'la llamada saliente no usa signaling compartido');
assert(callStore.includes('emitAccept'), 'aceptar no espera ACK compartido');

assert(chatStore.includes("socket.emit('chat:delivered'"), 'falta ACK delivered');
assert(chatStore.includes("socket.emit('chat:read'"), 'falta ACK read');
assert(chatStore.includes("message.senderId === currentUserId"), 'los recibos no excluyen mensajes propios');
assert(chatStore.includes("socket.emit('conversation:join'"), 'Chat no se une a sus conversaciones');
assert(chatStore.includes('nextCursor'), 'historial no usa el cursor real del backend');

assert(e2eeStore.includes('indexedDB'), 'el vault E2EE no usa almacenamiento cifrado del navegador');
assert(e2eeStore.includes("extractable=false") || e2eeStore.includes('false,\n    [\'encrypt\', \'decrypt\']'), 'la wrapping key debe ser no extraíble');
assert(!e2eeStore.includes('localStorage'), 'una llave privada E2EE no debe guardarse en localStorage');
assert(e2eeStore.includes('Desbloquea el cifrado'), 'E2EE no falla cerrado al enviar');
assert(e2eeStore.includes('envelope.senderPublicKey'), 'historial cifrado no conserva la llave del remitente');

assert(api.includes('new URL(String(sourceUrl'), 'media privada no valida origen');
assert(api.includes("responseType: 'blob'"), 'media privada no se descarga autenticada');
assert(media.includes('URL.revokeObjectURL'), 'object URLs de media no se liberan');
assert(!api.includes("'Content-Type': 'multipart/form-data'"), 'el browser debe generar el boundary multipart');

assert(/Permissions-Policy:.*camera=\(self\).*microphone=\(self\)/.test(headers), 'camera/microphone deben permitirse solo a self');
assert(/media-src[^\n]*blob:/.test(headers), 'CSP debe permitir media blob local autenticada');

assert(backendCapabilities.includes('communication.chat.access'), 'backend no define capacidad Chat');
assert(backendCapabilities.includes('communication.rtc.access'), 'backend no define capacidad RTC');
assert(backendChat.includes('requireChatAccess'), 'REST Chat no exige capacidad de Chat');
assert(backendRtc.includes('requireRtcAccess'), 'REST RTC no exige capacidad de RTC');

console.log('portal communication architecture gate passed');
