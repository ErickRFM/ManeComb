import { ChatScreenView } from './chat/components/chat-screen-view';
import { useChatController } from './chat/hooks/use-chat-controller';

export function ChatScreen() {
  const controller = useChatController();

  return <ChatScreenView {...controller} />;
}
