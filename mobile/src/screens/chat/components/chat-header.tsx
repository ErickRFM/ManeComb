import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { useChatController } from '../hooks/use-chat-controller';

type ChatHeaderProps = Pick<
  ReturnType<typeof useChatController>,
  'setAttachmentMenuOpen' | 'styles'
>;

export function ChatHeader({
  setAttachmentMenuOpen,
  styles,
}: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Text style={styles.title}>Mensajes</Text>
        <Pressable
          onPress={() => {
            setAttachmentMenuOpen(true);
          }}
          style={styles.headerActionButton}
          accessibilityLabel="Nueva accion operativa">
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
