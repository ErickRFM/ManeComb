import { useEffect, useRef } from 'react';
import {
  FlatList,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { MessageListItem } from '../types';

type UseChatScrollOptions = {
  activeConversationKey: string | null;
  activeMessageItems: MessageListItem[];
};

export function useChatScroll({
  activeConversationKey,
  activeMessageItems,
}: UseChatScrollOptions) {
  const messagesListRef = useRef<FlatList<MessageListItem> | null>(null);
  const isNearMessagesBottomRef = useRef(true);
  const shouldScrollAfterSendRef = useRef(false);
  const previousMessageCountRef = useRef(0);

  const scrollMessagesToEnd = (animated = true) => {
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToEnd({ animated });
    });
  };

  const handleMessagesScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isNearMessagesBottomRef.current = distanceFromBottom < 96;
  };

  const handleMessagesLayout = () => {
    if (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current) {
      scrollMessagesToEnd(false);
    }
  };

  const handleMessagesContentSizeChange = () => {
    if (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current) {
      scrollMessagesToEnd(true);
      shouldScrollAfterSendRef.current = false;
    }
  };

  useEffect(() => {
    isNearMessagesBottomRef.current = true;
    shouldScrollAfterSendRef.current = true;
    previousMessageCountRef.current = 0;
    scrollMessagesToEnd(false);
  }, [activeConversationKey]);

  useEffect(() => {
    const messageCount = activeMessageItems.filter((item) => item.type === 'message').length;
    const hasNewMessage = messageCount > previousMessageCountRef.current;

    if (hasNewMessage && (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current)) {
      scrollMessagesToEnd(true);
      shouldScrollAfterSendRef.current = false;
    }

    previousMessageCountRef.current = messageCount;
  }, [activeMessageItems]);

  useEffect(() => {
    const handleKeyboardChange = () => {
      if (isNearMessagesBottomRef.current || shouldScrollAfterSendRef.current) {
        setTimeout(() => scrollMessagesToEnd(true), 80);
      }
    };
    const showSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardChange);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardChange);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return {
    handleMessagesContentSizeChange,
    handleMessagesLayout,
    handleMessagesScroll,
    isNearMessagesBottomRef,
    messagesListRef,
    scrollMessagesToEnd,
    shouldScrollAfterSendRef,
  };
}
