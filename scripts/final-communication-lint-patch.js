const fs = require('node:fs');

const controllerPath = 'mobile/src/screens/chat/hooks/use-chat-controller.ts';
let controller = fs.readFileSync(controllerPath, 'utf8');
const scrollStart = controller.indexOf('  const handleChatMessagesScroll = useCallback(');
if (scrollStart >= 0) {
  const scrollEndMarker = '\n\n  const startRecordingTicker = () => {';
  const scrollEnd = controller.indexOf(scrollEndMarker, scrollStart);
  if (scrollEnd < 0) throw new Error('Chat pagination scroll end marker not found');
  const replacement = `  const handleChatMessagesScroll = (\n    event: Parameters<typeof handleMessagesScroll>[0]\n  ) => {\n    handleMessagesScroll(event);\n    if (\n      event.nativeEvent.contentOffset.y <= 80 &&\n      activeConversation &&\n      activeChatPageInfo?.hasMore &&\n      !isLoadingOlderMessages\n    ) {\n      void loadOlderChatMessages(activeConversation.id);\n    }\n  };`;
  controller = controller.slice(0, scrollStart) + replacement + controller.slice(scrollEnd);
}
controller = controller.replace(
  '        mode,\n        peerName: activeConversation.title,\n',
  '        mode,\n'
);
if (controller.includes('const handleChatMessagesScroll = useCallback(')) {
  throw new Error('Chat pagination handler still uses useCallback');
}
fs.writeFileSync(controllerPath, controller);

const modalPath = 'mobile/src/features/calls/components/active-call-modal.tsx';
let modal = fs.readFileSync(modalPath, 'utf8');
modal = modal.replace("import { useAppStore } from '@/src/store/use-app-store';\n", '');
const formatImport = "import { formatDuration } from '@/src/screens/chat/utils/conversation';";
if (!modal.includes(formatImport)) throw new Error('ActiveCallModal format import not found');
modal = modal.replace(
  formatImport,
  `${formatImport}\nimport { useAppStore } from '@/src/store/use-app-store';`
);
const formatIndex = modal.indexOf(formatImport);
const appStoreIndex = modal.indexOf("import { useAppStore } from '@/src/store/use-app-store';");
const relativeIndex = modal.indexOf("import { useCallStore } from '../call-store';");
if (!(formatIndex < appStoreIndex && appStoreIndex < relativeIndex)) {
  throw new Error('ActiveCallModal imports are not ordered');
}
fs.writeFileSync(modalPath, modal);
