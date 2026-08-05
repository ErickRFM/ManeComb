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
const appStoreImport = "import { useAppStore } from '@/src/store/use-app-store';";
const relativeImport = "import { useCallStore } from '../call-store';";
modal = modal.replace(`${appStoreImport}\n`, '');
if (!modal.includes(relativeImport)) throw new Error('ActiveCallModal relative store import not found');
modal = modal.replace(relativeImport, `${appStoreImport}\n${relativeImport}`);
const appStoreIndex = modal.indexOf(appStoreImport);
const relativeIndex = modal.indexOf(relativeImport);
if (!(appStoreIndex >= 0 && appStoreIndex < relativeIndex)) {
  throw new Error('ActiveCallModal imports are not ordered');
}
fs.writeFileSync(modalPath, modal);
