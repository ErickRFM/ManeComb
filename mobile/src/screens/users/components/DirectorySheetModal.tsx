import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { DirectoryStyles } from '../users-screen.styles';

/**
 * Hoja grande del Directorio: cabecera con titulo, subtitulo y cierre, sobre un
 * cuerpo desplazable.
 *
 * La repetian el visor de documentos y las dos asignaciones. Solo cambia el
 * contenido, que entra por `children`, asi que aqui no hay ninguna regla de
 * dominio ni estado propio: la visibilidad y el cierre los sigue poseyendo la
 * pantalla.
 */
export function DirectorySheetModal({
  children,
  closeDisabled = false,
  onClose,
  styles,
  subtitle,
  title,
  visible,
}: {
  children: ReactNode;
  closeDisabled?: boolean;
  onClose: () => void;
  styles: DirectoryStyles;
  subtitle: string;
  title: string;
  visible: boolean;
}) {
  const { theme } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeDisabled ? undefined : onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalLarge}>
          <View style={styles.modalHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Text style={styles.sectionSubtitle}>{subtitle}</Text>
            </View>
            <Pressable disabled={closeDisabled} onPress={onClose} style={styles.iconButton}>
              <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
