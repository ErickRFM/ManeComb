import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { portalButtonGradient } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export function AppAdminSaveBar({
  dirty,
  saved,
  isSubmitting,
  onSave,
}: {
  dirty: boolean;
  saved: boolean;
  isSubmitting: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.saveBar}>
      {dirty && <View style={styles.dirtyDot} />}
      <Text style={styles.saveStatus}>
        {saved ? 'Guardado correctamente' : dirty ? 'Hay cambios sin guardar' : 'Sin cambios'}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={!dirty || isSubmitting}
        onPress={onSave}
        style={[styles.saveButton, (!dirty || isSubmitting) && styles.saveButtonDisabled, portalButtonGradient()]}
      >
        <MaterialCommunityIcons name="content-save" size={18} color="#FFFFFF" />
        <Text style={styles.saveButtonText}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Text>
      </Pressable>
    </View>
  );
}
