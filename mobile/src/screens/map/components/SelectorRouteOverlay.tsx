import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { NavigationPlaceResult, NavigationStop } from '@/src/types/app';
import type { SelectorPointRole } from '../types';
import { mapStyles as styles } from '../map-styles';

type SelectorRouteOverlayProps = {
  bottom: number;
  copy: {
    step: number;
    title: string;
    hint: string;
  };
  isPlanningSelectorRoute: boolean;
  onConfirmSelection: () => void;
  onRemoveLastStop: () => void;
  onRemovePoint: (role: SelectorPointRole) => void;
  onResetRoute: () => void;
  points: Record<SelectorPointRole, NavigationPlaceResult | null>;
  stops: NavigationStop[];
  top: number;
};

export function SelectorRouteOverlay({
  bottom,
  copy,
  isPlanningSelectorRoute,
  onConfirmSelection,
  onRemoveLastStop,
  onRemovePoint,
  onResetRoute,
  points,
  stops,
  top,
}: SelectorRouteOverlayProps) {
  const { theme } = useAppTheme();
  const hasEditableSelection = Boolean(points.origin || points.destination || stops.length);
  const canConfirm = Boolean(points.origin && points.destination);

  return (
    <>
      <View style={[styles.selectorPanel, { top, backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
        <View style={styles.selectorStepBadge}>
          <Text style={styles.selectorStepText}>Paso {copy.step}</Text>
        </View>
        <View style={styles.selectorCopy}>
          <Text style={[styles.selectorTitle, { color: theme.colors.text }]}>{copy.title}</Text>
          <Text style={[styles.selectorHint, { color: theme.colors.muted }]}>{copy.hint}</Text>
        </View>
      </View>

      {hasEditableSelection ? (
        <View style={[styles.selectorEditWrap, { top: top + 64 }]}>
          {points.origin ? (
            <Pressable
              onPress={() => onRemovePoint('origin')}
              style={[styles.selectorEditChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="map-marker-remove-outline" size={16} color={theme.colors.text} />
              <Text style={[styles.selectorEditText, { color: theme.colors.text }]}>Origen</Text>
            </Pressable>
          ) : null}
          {points.destination ? (
            <Pressable
              onPress={() => onRemovePoint('destination')}
              style={[styles.selectorEditChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="map-marker-remove" size={16} color={theme.colors.text} />
              <Text style={[styles.selectorEditText, { color: theme.colors.text }]}>Destino</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onResetRoute}
            style={[styles.selectorEditChip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="restart" size={16} color={theme.colors.text} />
            <Text style={[styles.selectorEditText, { color: theme.colors.text }]}>Reiniciar</Text>
          </Pressable>
        </View>
      ) : null}

      {canConfirm ? (
        <View style={[styles.selectorConfirmWrap, { bottom }]}>
          {stops.length ? (
            <Pressable
              onPress={onRemoveLastStop}
              style={[styles.selectorUndoButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="undo" size={17} color={theme.colors.text} />
              <Text style={[styles.selectorUndoText, { color: theme.colors.text }]}>Deshacer parada</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onConfirmSelection}
            disabled={isPlanningSelectorRoute}
            style={({ pressed }) => [
              styles.selectorConfirmButton,
              { backgroundColor: pressed ? theme.colors.accentSoft : theme.colors.accent },
              isPlanningSelectorRoute ? styles.selectorConfirmDisabled : undefined,
            ]}>
            <MaterialCommunityIcons name="flag-checkered" size={18} color="#FFFFFF" />
            <Text style={styles.selectorConfirmText}>
              {isPlanningSelectorRoute ? 'Calculando ruta...' : 'Aceptar ruta'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}
