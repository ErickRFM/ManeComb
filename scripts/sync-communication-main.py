from pathlib import Path
import json

controller = Path("mobile/src/screens/chat/hooks/use-chat-controller.ts")
text = controller.read_text()
text = text.replace(
    "        mode,\n        peerName: activeConversation.title,\n",
    "        mode,\n",
    1,
)
controller.write_text(text)

modal = Path("mobile/src/features/calls/components/active-call-modal.tsx")
text = modal.read_text()
store_import = "import { useCallStore } from '../call-store';"
if store_import not in text:
    raise SystemExit("ActiveCallModal store import not found")
text = text.replace(
    store_import,
    "import { useAppStore } from '@/src/store/use-app-store';\n" + store_import,
    1,
)
old_state = """  const callerName = useCallStore((state) => state.callerName);
  const direction = useCallStore((state) => state.direction);"""
new_state = """  const callerName = useCallStore((state) => state.callerName);
  const conversationId = useCallStore((state) => state.conversationId);
  const direction = useCallStore((state) => state.direction);
  const conversations = useAppStore((state) => state.conversations);
  const currentUserId = useAppStore((state) => state.user?.id || null);"""
if old_state not in text:
    raise SystemExit("ActiveCallModal state anchor not found")
text = text.replace(old_state, new_state, 1)
old_title = """  const title = direction === 'incoming'
    ? callerName || 'Contacto operativo'
    : 'Contacto operativo';"""
new_title = """  const conversation = conversations.find((entry) => entry.id === conversationId) || null;
  const peer = conversation?.participants.find((participant) => participant.id !== currentUserId) || null;
  const title = callerName || peer?.name || conversation?.title || 'Contacto operativo';"""
if old_title not in text:
    raise SystemExit("ActiveCallModal title anchor not found")
modal.write_text(text.replace(old_title, new_title, 1))

package_file = Path("mobile/package.json")
package_data = json.loads(package_file.read_text())
command = package_data["scripts"]["test"]
anchor = "src/utils/chat-e2ee.test.ts"
additions = "src/utils/chat-message-id.test.ts src/utils/chat-pagination.test.ts "
if "src/utils/chat-message-id.test.ts" not in command:
    if anchor not in command:
        raise SystemExit("mobile test anchor missing")
    command = command.replace(anchor, additions + anchor, 1)
package_data["scripts"]["test"] = command
package_file.write_text(json.dumps(package_data, indent=2, ensure_ascii=False) + "\n")
