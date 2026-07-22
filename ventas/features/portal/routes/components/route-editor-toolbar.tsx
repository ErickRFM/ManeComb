import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { palette } from '@/constants/theme';
import { portalPalette } from '../../portal-theme';
import { styles } from '../routes.styles';

type Props = {
  editorTool: 'select' | 'checkpoint' | 'insert';
  onToolChange: (tool: 'select' | 'checkpoint' | 'insert') => void;
  selectedPointId: string | null;
  onDeleteSelected: () => void;
  onClearRoute: () => void;
};

export const RouteEditorToolbar = ({
  editorTool,
  onToolChange,
  selectedPointId,
  onDeleteSelected,
  onClearRoute,
}: Props) => (
  <View style={styles.editorTools}>
    <Text style={styles.sectionEyebrow}>Herramientas</Text>
    <Pressable onPress={() => onToolChange('select')} style={[styles.toolButton, editorTool === 'select' ? styles.toolButtonActive : undefined]}>
      <MaterialCommunityIcons name="cursor-default" size={18} color={portalPalette.text} />
      <Text style={styles.toolText}>Seleccionar / mover</Text>
    </Pressable>
    <Pressable onPress={() => onToolChange('checkpoint')} style={[styles.toolButton, editorTool === 'checkpoint' ? styles.toolButtonActive : undefined]}>
      <MaterialCommunityIcons name="flag-plus" size={18} color={portalPalette.info} />
      <Text style={styles.toolText}>Agregar checkpoint</Text>
    </Pressable>
    <Pressable onPress={() => onToolChange('insert')} style={[styles.toolButton, editorTool === 'insert' ? styles.toolButtonActive : undefined]}>
      <MaterialCommunityIcons name="vector-polyline-plus" size={18} color={portalPalette.accent} />
      <Text style={styles.toolText}>Insertar entre puntos</Text>
    </Pressable>
    <Pressable disabled={!selectedPointId} onPress={onDeleteSelected} style={[styles.toolButton, !selectedPointId ? styles.disabledButton : undefined]}>
      <MaterialCommunityIcons name="delete-outline" size={18} color={palette.warning} />
      <Text style={styles.toolText}>Eliminar seleccionado</Text>
    </Pressable>
    <Pressable onPress={onClearRoute} style={styles.toolButton}>
      <MaterialCommunityIcons name="delete-sweep" size={18} color={palette.warning} />
      <Text style={styles.toolText}>Limpiar ruta</Text>
    </Pressable>
    <View style={styles.editorLegend}>
      <Text style={styles.legendText}>● Verde: origen</Text>
      <Text style={styles.legendText}>● Azul: checkpoint</Text>
      <Text style={styles.legendText}>● Rojo: destino</Text>
    </View>
  </View>
);
