from pathlib import Path
import json
import re

controller = Path("mobile/src/screens/chat/hooks/use-chat-controller.ts")
text = controller.read_text()
clean_prefix = """import { DesignSystem } from '@/constants/theme';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from '@/src/native/audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useShallow } from 'zustand/react/shallow';
import { canConversationStartCall } from '@/src/features/calls/call-selectors';
import { useCallStore } from '@/src/features/calls/call-store';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
} from '@/src/native/image-picker';
"""
text, import_count = re.subn(
    r"\A.*?(?=import \{ useAppTheme \} from '@/src/hooks/use-app-theme';)",
    clean_prefix,
    text,
    count=1,
    flags=re.S,
)
if import_count != 1:
    raise SystemExit("Chat controller import prefix could not be normalized")
text = text.replace(
    "        mode,\n        peerName: activeConversation.title,\n",
    "        mode,\n",
    1,
)
plain_scroll = """  const handleChatMessagesScroll = (
    event: Parameters<typeof handleMessagesScroll>[0]
  ) => {
    handleMessagesScroll(event);
    if (
      event.nativeEvent.contentOffset.y <= 80 &&
      activeConversation &&
      activeChatPageInfo?.hasMore &&
      !isLoadingOlderMessages
    ) {
      void loadOlderChatMessages(activeConversation.id);
    }
  };"""
scroll_start = text.find("  const handleChatMessagesScroll = useCallback(")
if scroll_start >= 0:
    scroll_end_marker = "\n\n  const startRecordingTicker = () => {"
    scroll_end = text.find(scroll_end_marker, scroll_start)
    if scroll_end < 0:
        raise SystemExit("Chat pagination scroll end marker not found")
    text = text[:scroll_start] + plain_scroll + text[scroll_end:]
elif plain_scroll not in text:
    raise SystemExit("Chat pagination scroll wrapper not found")
controller.write_text(text)

modal = Path("mobile/src/features/calls/components/active-call-modal.tsx")
text = modal.read_text()
text = text.replace("import { useAppStore } from '@/src/store/use-app-store';\n", "")
webrtc_import = "import { RTCViewComponent } from '@/src/native/webrtc';"
if webrtc_import not in text:
    raise SystemExit("ActiveCallModal WebRTC import not found")
text = text.replace(
    webrtc_import,
    "import { useAppStore } from '@/src/store/use-app-store';\n" + webrtc_import,
    1,
)
old_state = """  const callerName = useCallStore((state) => state.callerName);
  const direction = useCallStore((state) => state.direction);"""
new_state = """  const callerName = useCallStore((state) => state.callerName);
  const conversationId = useCallStore((state) => state.conversationId);
  const conversations = useAppStore((state) => state.conversations);
  const currentUserId = useAppStore((state) => state.user?.id || null);"""
if old_state in text:
    text = text.replace(old_state, new_state, 1)
elif new_state not in text:
    raise SystemExit("ActiveCallModal state anchor not found")
old_title = """  const title = direction === 'incoming'
    ? callerName || 'Contacto operativo'
    : 'Contacto operativo';"""
new_title = """  const conversation = conversations.find((entry) => entry.id === conversationId) || null;
  const peer = conversation?.participants.find((participant) => participant.id !== currentUserId) || null;
  const title = callerName || peer?.name || conversation?.title || 'Contacto operativo';"""
if old_title in text:
    text = text.replace(old_title, new_title, 1)
elif new_title not in text:
    raise SystemExit("ActiveCallModal title anchor not found")
modal.write_text(text)

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
