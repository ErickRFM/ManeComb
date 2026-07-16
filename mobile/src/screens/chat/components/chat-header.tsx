import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { useChatController } from '../hooks/use-chat-controller';

type ChatHeaderProps = Pick<
  ReturnType<typeof useChatController>,
  'openDirectoryMenu' | 'styles'
>;

export function ChatHeader({
  openDirectoryMenu,
  styles,
}: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <Text style={styles.title}>Mensajes</Text>
        <Pressable
          onPress={openDirectoryMenu}
          style={styles.headerActionButton}
          accessibilityLabel="Nuevo chat">
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
