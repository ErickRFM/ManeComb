import { Pressable, Text, TextInput, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { editableStatuses } from '../units.constants';
import { styles } from '../units.styles';
import type { UnitEditor } from '../units.types';

type PortalUnitFormProps = {
  editor: UnitEditor;
  editingId: string | null;
  isSubmitting: boolean;
  message: string | null;
  onCancel: () => void;
  onFieldChange: <T extends keyof UnitEditor>(field: T, value: UnitEditor[T]) => void;
  onSave: () => void;
  onStatusChange: (status: UnitEditor['status']) => void;
};

export function PortalUnitForm({
  editor,
  editingId,
  isSubmitting,
  message,
  onCancel,
  onFieldChange,
  onSave,
  onStatusChange,
}: PortalUnitFormProps) {
  return (
    <PortalSectionCard title={editingId ? 'Editar unidad' : 'Crear unidad'} subtitle={message || undefined}>
      <View style={styles.formGrid}>
        <TextInput
          value={editor.code}
          onChangeText={(value) => onFieldChange('code', value)}
          placeholder="Nombre de unidad"
          placeholderTextColor={palette.muted}
          style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
        />
        <TextInput
          value={editor.plate}
          onChangeText={(value) => onFieldChange('plate', value)}
          placeholder="Placas"
          placeholderTextColor={palette.muted}
          autoCapitalize="characters"
          style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
        />
        <TextInput
          value={editor.currentKilometers}
          onChangeText={(value) => onFieldChange('currentKilometers', value.replace(/[^0-9.]/g, ''))}
          placeholder="Kilometros actuales"
          placeholderTextColor={palette.muted}
          keyboardType="numeric"
          style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
        />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={[styles.segmentText, { color: palette.text }]}>Disponibilidad administrativa</Text>
        <Text style={[styles.segmentText, { color: palette.muted, fontWeight: '500' }]}>
          Define si la unidad puede operar. El estado en ruta, GPS y movimiento se calcula automáticamente y no se modifica aquí.
        </Text>
      </View>
      <View style={styles.segmentRow}>
        {editableStatuses.map((status) => (
          <Pressable
            key={status}
            accessibilityRole="button"
            accessibilityLabel={status === 'maintenance' ? 'Marcar unidad en mantenimiento' : 'Marcar unidad disponible para operar'}
            accessibilityState={{ selected: editor.status === status }}
            onPress={() => onStatusChange(status)}
            style={[
              styles.segment,
              {
                backgroundColor: editor.status === status ? palette.infoSoft : palette.surfaceAlt,
                borderColor: editor.status === status ? palette.info : palette.line,
              },
            ]}>
            <Text style={[styles.segmentText, { color: editor.status === status ? palette.info : palette.text }]}>
              {status === 'maintenance' ? 'Mantenimiento' : 'Disponible para operar'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        {editingId ? <PortalButton onPress={onCancel} variant="secondary">Cancelar</PortalButton> : null}
        <PortalButton icon={editingId ? 'content-save-outline' : 'bus-multiple'} loading={isSubmitting} onPress={onSave}>
          {editingId ? 'Guardar' : 'Crear unidad'}
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}
