import { Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { palette } from '@/constants/theme';
import { portalPalette } from '../../portal-theme';
import { styles } from '../routes.styles';
import type { NavigationStop, GeoPoint } from '@/src/types/app';

type Props = {
  routeName: string;
  onRouteNameChange: (value: string) => void;
  originLabel: string;
  onOriginLabelChange: (value: string) => void;
  destinationLabel: string;
  onDestinationLabelChange: (value: string) => void;
  editorMetrics: { distanceMeters: number; durationSeconds: number; durationInTrafficSeconds: number };
  editorStops: NavigationStop[];
  editablePoints: Array<{ id: string; kind: 'origin' | 'destination' | 'checkpoint'; point: GeoPoint }>;
  selectedPointId: string | null;
  onSelectPoint: (id: string | null) => void;
  draggedStopId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (targetId: string) => void;
  selectedSegmentIndex: number | null;
  onInsertAtSegment: (segmentIndex: number) => void;
  catalogBusy: boolean;
  onClearDraggedStop: () => void;
};

export function RouteEditorDetails({
  routeName,
  onRouteNameChange,
  originLabel,
  onOriginLabelChange,
  destinationLabel,
  onDestinationLabelChange,
  editorMetrics,
  editorStops,
  editablePoints,
  selectedPointId,
  onSelectPoint,
  draggedStopId,
  onDragStart,
  onDrop,
  selectedSegmentIndex,
  onInsertAtSegment,
  catalogBusy,
  onClearDraggedStop,
}: Props) {
  return (
    <View style={styles.editorDetails}>
      <Text style={styles.editorTitle}>Detalles de la ruta</Text>
      <TextInput accessibilityLabel="Nombre de la ruta" value={routeName} onChangeText={onRouteNameChange} placeholder="Nombre de la ruta" placeholderTextColor={palette.muted} style={[styles.input, styles.editorInput, { borderColor: palette.lineStrong, color: palette.text }]} />
      <TextInput accessibilityLabel="Origen de la ruta" value={originLabel} onChangeText={onOriginLabelChange} placeholder="Origen" placeholderTextColor={palette.muted} style={[styles.input, styles.editorInput, { borderColor: palette.lineStrong, color: palette.text }]} />
      <TextInput accessibilityLabel="Destino de la ruta" value={destinationLabel} onChangeText={onDestinationLabelChange} placeholder="Destino" placeholderTextColor={palette.muted} style={[styles.input, styles.editorInput, { borderColor: palette.lineStrong, color: palette.text }]} />
      <View style={styles.metricsRow}>
        <Text style={styles.metricText}>{(editorMetrics.distanceMeters / 1000).toFixed(1)} km</Text>
        <Text style={styles.metricText}>{Math.round(editorMetrics.durationSeconds / 60)} min</Text>
        <Text style={styles.metricText}>{editorStops.length} checkpoints</Text>
      </View>
      <Text style={styles.sectionEyebrow}>Paradas y checkpoints</Text>
      <View style={styles.pointList}>
        {editablePoints.map((entry, index) => (
          <View
            key={entry.id}
            {...({ draggable: entry.kind === 'checkpoint', onDragStart: () => onDragStart(entry.id), onDragOver: (event: DragEvent) => event.preventDefault(), onDrop: () => { if (draggedStopId && entry.kind === 'checkpoint') onDrop(entry.id); onClearDraggedStop(); } } as any)}
            style={[styles.pointRow, selectedPointId === entry.id ? styles.pointRowActive : undefined]}>
            <Pressable onPress={() => onSelectPoint(entry.id)} style={styles.pointRowMain}>
              <MaterialCommunityIcons name={entry.kind === 'checkpoint' ? 'flag-outline' : 'map-marker'} size={17} color={entry.kind === 'origin' ? '#22c55e' : entry.kind === 'destination' ? '#ef4444' : '#38bdf8'} />
              <View style={styles.routeBody}>
                <Text style={styles.pointTitle}>{entry.kind === 'origin' ? 'Origen' : entry.kind === 'destination' ? 'Destino' : `Checkpoint ${index}`}</Text>
                <Text style={styles.coordText}>{entry.point.latitude.toFixed(5)}, {entry.point.longitude.toFixed(5)}</Text>
              </View>
              {entry.kind === 'checkpoint' ? <MaterialCommunityIcons name="drag" size={18} color={portalPalette.muted} /> : null}
            </Pressable>
            {index < editablePoints.length - 1 ? (
              <Pressable accessibilityLabel={`Insertar checkpoint después de ${index + 1}`} onPress={() => { onSelectPoint(null); onInsertAtSegment(index); }} style={[styles.insertSegmentButton, selectedSegmentIndex === index ? styles.insertSegmentButtonActive : undefined]}>
                <MaterialCommunityIcons name="plus" size={14} color={portalPalette.info} />
                <Text style={styles.insertSegmentText}>Insertar en este segmento</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <Text style={styles.coordText}>{catalogBusy ? 'Recalculando geometría…' : 'Arrastra cualquier marcador para moverlo. Los cambios se recalculan automáticamente.'}</Text>
    </View>
  );
}
