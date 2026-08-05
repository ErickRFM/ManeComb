from pathlib import Path
import re


def replace_once(path, old, new, label):
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    target.write_text(text.replace(old, new, 1))


Path("mobile/src/utils/chat-message-id.ts").write_text(
    """export function createClientMessageId(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeClientMessageId(value: unknown): string {
  const normalized = String(value || '').trim();
  return /^[A-Za-z0-9:_-]{8,128}$/.test(normalized) ? normalized : '';
}
"""
)

Path("mobile/src/utils/chat-message-id.test.ts").write_text(
    """import { createClientMessageId, normalizeClientMessageId } from './chat-message-id';

describe('chat-message-id', () => {
  it('crea identidades validas y distintas', () => {
    const first = createClientMessageId();
    const second = createClientMessageId();
    expect(normalizeClientMessageId(first)).toBe(first);
    expect(first).not.toBe(second);
  });

  it('rechaza identidades inseguras', () => {
    expect(normalizeClientMessageId('x')).toBe('');
    expect(normalizeClientMessageId('mensaje con espacios')).toBe('');
  });
});
"""
)

# Remove legacy RTC-only screen types and retain one optimistic-message contract.
types = Path("mobile/src/screens/chat/types.ts")
text = types.read_text()
text, count = re.subn(
    r"export type CallPhase =.*?export type MessageDeliveryStatus",
    "export type MessageDeliveryStatus",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("legacy CallPhase block not found")
text, count = re.subn(
    r"export type RtcParticipant =.*?export type DirectoryListItem",
    "export type DirectoryListItem",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("legacy RTC participant/session block not found")
old = "  retryText: string;\n};"
new = "  retryText: string;\n  clientMessageId: string;\n};"
if old not in text:
    raise SystemExit("LocalTextMessage block not found")
types.write_text(text.replace(old, new, 1))

replace_once(
    "mobile/src/api/offline-cache.ts",
    "        conversationId: string;\n        text: string;",
    "        conversationId: string;\n        text: string;\n        clientMessageId?: string;",
    "offline queue client id",
)

replace_once(
    "mobile/src/api/client.ts",
    "    textPreview?: string;\n    e2eeEnvelope?: {",
    "    textPreview?: string;\n    clientMessageId?: string;\n    e2eeEnvelope?: {",
    "API client message id",
)

root = Path("mobile/src/store/root-store.ts")
text = root.read_text()
replace_import = "import { isRealtimeAuthError } from '@/src/utils/realtime-state';"
if replace_import not in text:
    raise SystemExit("root-store realtime import not found")
text = text.replace(
    replace_import,
    replace_import
    + "\nimport { createClientMessageId, normalizeClientMessageId } from '@/src/utils/chat-message-id';",
    1,
)
old_signature = (
    "  sendMessage: (conversationId: string, text: string) => "
    "Promise<ActionResult & { messageRecord?: ChatMessage }>;"
)
new_signature = (
    "  sendMessage: (conversationId: string, text: string, clientMessageId?: string) => "
    "Promise<ActionResult & { messageRecord?: ChatMessage }>;"
)
if old_signature not in text:
    raise SystemExit("root-store sendMessage signature not found")
text = text.replace(old_signature, new_signature, 1)
old_sync = """          await sendMessageRequest(
            operation.payload.conversationId,
            await buildTextMessagePayload({
              conversation: state.conversations.find(
                (entry) => entry.id === operation.payload.conversationId
              ) || null,
              user: state.user,
              text: operation.payload.text,
            })
          );"""
new_sync = """          const durableClientMessageId =
            normalizeClientMessageId(operation.payload.clientMessageId) || operation.id;
          await sendMessageRequest(
            operation.payload.conversationId,
            {
              ...(await buildTextMessagePayload({
                conversation: state.conversations.find(
                  (entry) => entry.id === operation.payload.conversationId
                ) || null,
                user: state.user,
                text: operation.payload.text,
              })),
              clientMessageId: durableClientMessageId,
            }
          );"""
if old_sync not in text:
    raise SystemExit("pending chat sync block not found")
text = text.replace(old_sync, new_sync, 1)
old_handler = "  sendMessage: async (cid, t) => {"
new_handler = """  sendMessage: async (cid, t, requestedClientMessageId) => {
    const clientMessageId =
      normalizeClientMessageId(requestedClientMessageId) || createClientMessageId();"""
if old_handler not in text:
    raise SystemExit("root-store sendMessage handler not found")
text = text.replace(old_handler, new_handler, 1)
old_send = """      const m = await sendMessageRequest(
        cid,
        await buildTextMessagePayload({ conversation, user, text: t })
      );"""
new_send = """      const m = await sendMessageRequest(
        cid,
        {
          ...(await buildTextMessagePayload({ conversation, user, text: t })),
          clientMessageId,
        }
      );"""
if old_send not in text:
    raise SystemExit("root-store sendMessage request block not found")
text = text.replace(old_send, new_send, 1)
old_queue = "            conversationId: cid,\n            text: t.trim(),"
new_queue = "            conversationId: cid,\n            text: t.trim(),\n            clientMessageId,"
if old_queue not in text:
    raise SystemExit("root-store offline message payload not found")
root.write_text(text.replace(old_queue, new_queue, 1))

controller = Path("mobile/src/screens/chat/hooks/use-chat-controller.ts")
text = controller.read_text()
old_import = "import { getPresenceStatus } from '@/src/utils/presence';"
if old_import not in text:
    raise SystemExit("chat controller presence import missing")
text = text.replace(
    old_import,
    old_import + "\nimport { createClientMessageId } from '@/src/utils/chat-message-id';",
    1,
)
old_state = "  const [activeAudioMessageId, setActiveAudioMessageId] = useState<string | null>(null);"
if old_state not in text:
    raise SystemExit("chat controller audio state missing")
text = text.replace(
    old_state,
    old_state + "\n  const [typingClock, setTypingClock] = useState(() => Date.now());",
    1,
)
old_load = """  useEffect(() => {
    loadChatContacts();
  }, [loadChatContacts]);"""
new_load = old_load + """

  useEffect(() => {
    const timer = setInterval(() => setTypingClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);"""
if old_load not in text:
    raise SystemExit("chat contacts effect missing")
text = text.replace(old_load, new_load, 1)
old_local_id = "    const localId = `local-${activeConversation.id}-${Date.now()}`;"
new_local_id = """    const clientMessageId = createClientMessageId();
    const localId = `local-${clientMessageId}`;"""
if old_local_id not in text:
    raise SystemExit("optimistic local id missing")
text = text.replace(old_local_id, new_local_id, 1)
old_local_message = "      retryText: text,\n    };"
new_local_message = "      retryText: text,\n      clientMessageId,\n    };"
if old_local_message not in text:
    raise SystemExit("optimistic local message missing")
text = text.replace(old_local_message, new_local_message, 1)
old_initial_send = "      const result = await sendMessage(activeConversation.id, text);"
if old_initial_send not in text:
    raise SystemExit("initial text send missing")
text = text.replace(
    old_initial_send,
    "      const result = await sendMessage(activeConversation.id, text, clientMessageId);",
    1,
)
old_retry = "    const result = await sendMessage(message.conversationId, message.retryText);"
new_retry = """    const result = await sendMessage(
      message.conversationId,
      message.retryText,
      message.clientMessageId
    );"""
if old_retry not in text:
    raise SystemExit("retry send missing")
text = text.replace(old_retry, new_retry, 1)
marker = "  const showDirectoryPanel = !isCompact || mobilePane === 'directory';"
active_typing = """  const activeTypingUsers = useMemo(
    () =>
      activeConversation
        ? (typingByConversation[activeConversation.id] || []).filter(
            (entry) => typingClock - entry.startedAt < 5000
          )
        : [],
    [activeConversation, typingByConversation, typingClock]
  );

"""
if marker not in text:
    raise SystemExit("typing insertion marker not found")
text = text.replace(marker, active_typing + marker, 1)
return_marker = "    typingByConversation,\n    messagesListRef,"
if return_marker not in text:
    raise SystemExit("chat controller return typing marker not found")
text = text.replace(return_marker, "    activeTypingUsers,\n    messagesListRef,", 1)
controller.write_text(text)

view = Path("mobile/src/screens/chat/components/chat-screen-view.tsx")
text = view.read_text()
old_destructure = "    typingByConversation,\n    user,"
if old_destructure not in text:
    raise SystemExit("chat view typing destructure not found")
text = text.replace(old_destructure, "    activeTypingUsers,\n    user,", 1)
old_typing = """                {typingByConversation[activeConversation.id]?.length ? (
                  <View style={styles.typingIndicator}>
                    <Text style={styles.typingIndicatorText}>
                      {typingByConversation[activeConversation.id]
                        .map((entry) => entry.userName)
                        .join(', ')}
                      {typingByConversation[activeConversation.id].length === 1
                        ? ' esta escribiendo...'
                        : ' estan escribiendo...'}
                    </Text>
                  </View>
                ) : null}"""
new_typing = """                {activeTypingUsers.length ? (
                  <View style={styles.typingIndicator}>
                    <Text style={styles.typingIndicatorText}>
                      {activeTypingUsers.map((entry) => entry.userName).join(', ')}
                      {activeTypingUsers.length === 1
                        ? ' esta escribiendo...'
                        : ' estan escribiendo...'}
                    </Text>
                  </View>
                ) : null}"""
if old_typing not in text:
    raise SystemExit("typing view block not found")
view.write_text(text.replace(old_typing, new_typing, 1))

routes = Path("backend/src/modules/chat/routes.js")
text = routes.read_text()
old_router_import = 'const { Router } = require("express");'
if old_router_import not in text:
    raise SystemExit("chat router import missing")
text = text.replace(
    old_router_import,
    'const { createHash } = require("crypto");\n' + old_router_import,
    1,
)
helper_marker = "const MAX_VOICE_NOTE_SECONDS = 60;\n"
helpers = '''const MAX_VOICE_NOTE_SECONDS = 60;
const CLIENT_MESSAGE_ID_PATTERN = /^[A-Za-z0-9:_-]{8,128}$/;

function normalizeClientMessageId(value) {
  const normalized = String(value || "").trim();
  return CLIENT_MESSAGE_ID_PATTERN.test(normalized) ? normalized : "";
}

function buildChatMessageId({ organizationId, conversationId, senderId, clientMessageId }) {
  return `chat-${createHash("sha256")
    .update(`${organizationId}:${conversationId}:${senderId}:${clientMessageId}`)
    .digest("hex")}`;
}
'''
if helper_marker not in text:
    raise SystemExit("chat route helper marker missing")
text = text.replace(helper_marker, helpers, 1)
route_pattern = (
    r'router\.post\("/conversations/:conversationId/messages", authenticate, async '
    r'\(req, res\) => \{.*?\n\}\);\n\nrouter\.post\(\n  '
    r'"/conversations/:conversationId/audio"'
)
replacement = '''router.post("/conversations/:conversationId/messages", authenticate, async (req, res) => {
  const { text, e2eeEnvelope, textPreview, clientMessageId } = req.body;

  if (!text?.trim() && !e2eeEnvelope?.ciphertext) {
    return res.status(400).json({ ok: false, message: "El mensaje no puede ir vacio" });
  }

  const safeClientMessageId = normalizeClientMessageId(clientMessageId);
  if (clientMessageId && !safeClientMessageId) {
    return res.status(400).json({ ok: false, message: "Identidad de mensaje invalida" });
  }

  const conversation = await req.app.locals.store.getConversationById(req.params.conversationId);
  if (!conversation || !(await req.app.locals.store.canUserAccessConversation(req.user.id, conversation))) {
    return res.status(404).json({ ok: false, message: "Conversacion no disponible" });
  }

  if (e2eeEnvelope?.ciphertext) {
    const recipientIds = conversation.participants.filter((participantId) => participantId !== req.user.id);
    const validDirectEnvelope =
      conversation.kind === "direct" &&
      conversation.channelMode !== "radio" &&
      conversation.participants.length === 2 &&
      recipientIds.length === 1 &&
      e2eeEnvelope.recipientId === recipientIds[0] &&
      isValidE2eePublicKey(e2eeEnvelope.senderPublicKey) &&
      e2eeEnvelope.senderPublicKey === req.user.e2eePublicKey;
    if (!validDirectEnvelope) {
      return res.status(400).json({ ok: false, message: "El sobre E2EE no corresponde a este chat directo" });
    }
  }

  const messageId = safeClientMessageId
    ? buildChatMessageId({
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        senderId: req.user.id,
        clientMessageId: safeClientMessageId
      })
    : undefined;
  const message = await req.app.locals.store.addMessage(
    req.params.conversationId,
    req.user.id,
    e2eeEnvelope?.ciphertext
      ? {
          kind: "text",
          text: "",
          textPreview: String(textPreview || "").trim() || "Mensaje cifrado de extremo a extremo",
          e2eeEnvelope,
          messageId
        }
      : { kind: "text", text: text.trim(), messageId }
  );
  const deduplicated = Boolean(message?.deduplicated);
  const responseMessage = message ? { ...message } : null;
  if (responseMessage) delete responseMessage.deduplicated;

  if (!deduplicated) emitConversationUpdate(req, conversation, responseMessage);

  const recipientIds = conversation.participants.filter((participantId) => participantId !== req.user.id);
  const isDirectChat = conversation.kind === "direct" && conversation.channelMode !== "radio";
  if (!deduplicated && recipientIds.length) {
    await deliverOperationalNotification({
      io: req.app.locals.io,
      store: req.app.locals.store,
      persist: conversation.channelMode === "radio",
      payload: {
        organizationId: conversation.organizationId,
        title:
          conversation.channelMode === "radio"
            ? `Radio: ${conversation.title}`
            : isDirectChat
              ? `Mensaje directo de ${req.user.name}`
              : `Nuevo mensaje en ${conversation.title}`,
        body:
          conversation.channelMode === "radio"
            ? "Hay un mensaje operativo nuevo en el canal de radio."
            : e2eeEnvelope?.ciphertext
              ? "Recibiste un mensaje cifrado de extremo a extremo."
              : String(text || "").trim().slice(0, 140) || "Tienes un mensaje nuevo.",
        level: conversation.channelMode === "radio" ? "warning" : "info",
        category: conversation.channelMode === "radio" ? "radio" : "chat",
        targetUserIds: recipientIds,
        data: {
          conversationId: conversation.id,
          channelMode: conversation.channelMode,
          kind: "text",
          encrypted: Boolean(e2eeEnvelope?.ciphertext)
        },
        deepLink: `/chat?conversationId=${encodeURIComponent(conversation.id)}&channelMode=${encodeURIComponent(conversation.channelMode)}`
      }
    });
  }

  return res.status(deduplicated ? 200 : 201).json({
    ok: true,
    data: responseMessage,
    deduplicated
  });
});

router.post(
  "/conversations/:conversationId/audio"'''
text, count = re.subn(route_pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f"text message route replacement count={count}")
routes.write_text(text)

# Mongo: mark duplicate and normal result without changing transaction/order logic.
mongo = Path("backend/src/data/mongo-store.js")
text = mongo.read_text()
match = re.search(
    r"  async function addMessage\(conversationId, senderId, input\) \{.*?\n  \}\n\n  async function",
    text,
    flags=re.S,
)
if not match:
    raise SystemExit("mongo addMessage function not found")
block = match.group(0)
duplicate_anchor = "return {\n        ...serializeChatMessageEntry(duplicate, conversationId),"
if duplicate_anchor not in block:
    raise SystemExit("mongo duplicate return not found")
block = block.replace(
    duplicate_anchor,
    "return {\n        deduplicated: true,\n        ...serializeChatMessageEntry(duplicate, conversationId),",
    1,
)
positions = [item.start() for item in re.finditer(r"\n    return \{", block)]
if not positions:
    raise SystemExit("mongo normal return not found")
position = positions[-1]
block = block[:position] + block[position:].replace(
    "\n    return {",
    "\n    return {\n      deduplicated: false,",
    1,
)
text = text[: match.start()] + block + text[match.end() :]
mongo.write_text(text)

# Embedded store: return the same persisted record without touching aggregates twice.
embedded = Path("backend/src/data/store.js")
text = embedded.read_text()
match = re.search(
    r"  function addMessage\(conversationId, senderId, text\) \{.*?\n  \}\n\n  function",
    text,
    flags=re.S,
)
if not match:
    raise SystemExit("embedded addMessage function not found")
block = match.group(0)
access_anchor = '''    if (!canUserAccessConversation(senderId, conversation)) {
      return null;
    }
'''
if access_anchor not in block:
    raise SystemExit("embedded access anchor missing")
dedupe = '''    const requestedMessageId =
      text && typeof text === "object" ? String(text.messageId || "").trim() : "";
    const existingMessage = requestedMessageId
      ? state.chatMessages.find(
          (entry) => entry.id === requestedMessageId && entry.conversationId === conversationId
        )
      : null;
    if (existingMessage) {
      return {
        ...clone(serializeConversationMessage(existingMessage, conversationId)),
        deduplicated: true
      };
    }
'''
block = block.replace(access_anchor, access_anchor + dedupe, 1)
return_matches = list(re.finditer(r"\n    return clone\((.*?)\);", block, flags=re.S))
if not return_matches:
    raise SystemExit("embedded normal clone return missing")
normal = return_matches[-1]
expression = normal.group(1)
block = (
    block[: normal.start()]
    + f"\n    return {{ ...clone({expression}), deduplicated: false }};"
    + block[normal.end() :]
)
text = text[: match.start()] + block + text[match.end() :]
embedded.write_text(text)

Path("backend/test/chat-message-idempotency.test.js").write_text(
    """const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routes = fs.readFileSync(path.resolve(__dirname, '../src/modules/chat/routes.js'), 'utf8');
const mongo = fs.readFileSync(path.resolve(__dirname, '../src/data/mongo-store.js'), 'utf8');
const embedded = fs.readFileSync(path.resolve(__dirname, '../src/data/store.js'), 'utf8');

assert.match(routes, /clientMessageId/);
assert.match(routes, /buildChatMessageId/);
assert.match(routes, /deduplicated \? 200 : 201/);
assert.match(mongo, /deduplicated: true/);
assert.match(mongo, /deduplicated: false/);
assert.match(embedded, /requestedMessageId/);
assert.match(embedded, /deduplicated: true/);
console.log('ok - chat conserva una identidad durable y no repite efectos');
"""
)
