import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { useChatController } from '../hooks/use-chat-controller';

type ChatHeaderProps = Pick<
  ReturnType<typeof useChatController>,
  'setActionCategory' | 'setAttachmentMenuOpen' | 'styles' | 'theme'
>;

export function ChatHeader({
  setActionCategory,
  setAttachmentMenuOpen,
  styles,
  theme,
}: ChatHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Mensajeria operativa</Text>
          <View style={styles.headerStatusRow}>
            <View style={styles.liveDot} />
            <Text style={styles.headerStatusText}>Conectado</Text>
            <MaterialCommunityIcons name="lock-outline" size={15} color={theme.colors.success} />
            <Text style={styles.headerSecureText}>Cifrado activo</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            setAttachmentMenuOpen(true);
            setActionCategory('root');
          }}
          style={styles.headerActionButton}
          accessibilityLabel="Nueva accion operativa">
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
