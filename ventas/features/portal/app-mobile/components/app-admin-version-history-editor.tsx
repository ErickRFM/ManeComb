import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';
import type { PortalAppVersion } from '../../types';

export function AppAdminVersionHistoryEditor({
  versions,
  onAddVersion,
  onUpdateVersion,
  onRemoveVersion,
  onToggleArchived,
  onMarkCurrent,
}: {
  versions: PortalAppVersion[];
  onAddVersion: () => void;
  onUpdateVersion: (index: number, field: keyof PortalAppVersion, value: unknown) => void;
  onRemoveVersion: (index: number) => void;
  onToggleArchived: (index: number) => void;
  onMarkCurrent: (index: number) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Historial de versiones</Text>
          <Text style={styles.sectionSubtitle}>Agrega, edita o archiva versiones anteriores</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onAddVersion} style={styles.addVersionButton}>
          <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.addVersionText}>Nueva</Text>
        </Pressable>
      </View>

      {versions.map((ver, index) => (
        <View key={index} style={styles.historyVersionCard}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyIndex}>#{versions.length - index}</Text>
            {ver.archived && <Text style={styles.archivedBadge}>Archivada</Text>}
            {ver.current && <Text style={styles.currentBadge}>ACTUAL</Text>}
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Versión</Text>
              <TextInput
                value={ver.version}
                onChangeText={(v) => onUpdateVersion(index, 'version', v)}
                placeholder="1.0.0"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Fecha</Text>
              <TextInput
                value={ver.date}
                onChangeText={(v) => onUpdateVersion(index, 'date', v)}
                placeholder="2026-07-20"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Android mínimo</Text>
              <TextInput
                value={ver.androidMin}
                onChangeText={(v) => onUpdateVersion(index, 'androidMin', v)}
                placeholder="8.0"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Tamaño</Text>
              <TextInput
                value={ver.size}
                onChangeText={(v) => onUpdateVersion(index, 'size', v)}
                placeholder="42 MB"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>Notas de la versión</Text>
          {ver.notes.map((note, ni) => (
            <View key={ni} style={styles.noteItem}>
              <TextInput
                value={note}
                onChangeText={(v) => {
                  const next = [...ver.notes];
                  next[ni] = v;
                  onUpdateVersion(index, 'notes', next);
                }}
                placeholder="Nota..."
                placeholderTextColor={portalPalette.mutedSoft}
                style={[styles.input, styles.noteEditField]}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => onUpdateVersion(index, 'notes', ver.notes.filter((_, i) => i !== ni))}
                style={styles.removeNoteButton}
              >
                <MaterialCommunityIcons name="close" size={18} color={portalPalette.danger} />
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => onUpdateVersion(index, 'notes', [...ver.notes, ''])}
            style={styles.addVersionNoteBtn}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={16} color={portalPalette.accent} />
            <Text style={styles.addVersionNoteText}>Agregar nota</Text>
          </Pressable>

          <View style={styles.historyActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onMarkCurrent(index)}
              style={[styles.historyActionBtn, ver.current && styles.historyActionBtnActive]}
            >
              <MaterialCommunityIcons name="star" size={16} color={ver.current ? '#FFFFFF' : portalPalette.muted} />
              <Text style={[styles.historyActionText, ver.current && styles.historyActionTextActive]}>
                {ver.current ? 'Actual' : 'Marcar actual'}
              </Text>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={() => onToggleArchived(index)} style={styles.historyActionBtn}>
              <MaterialCommunityIcons
                name={ver.archived ? 'archive-arrow-up' : 'archive-arrow-down'}
                size={16}
                color={portalPalette.muted}
              />
              <Text style={styles.historyActionText}>{ver.archived ? 'Restaurar' : 'Archivar'}</Text>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={() => onRemoveVersion(index)} style={styles.historyActionBtn}>
              <MaterialCommunityIcons name="delete-outline" size={16} color={portalPalette.danger} />
              <Text style={[styles.historyActionText, { color: portalPalette.danger }]}>Eliminar</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
