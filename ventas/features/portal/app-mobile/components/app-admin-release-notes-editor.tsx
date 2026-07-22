import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export function AppAdminReleaseNotesEditor({
  noteInput,
  notes,
  onNoteInputChange,
  onAddNote,
  onEditNote,
  onRemoveNote,
}: {
  noteInput: string;
  notes: string[];
  onNoteInputChange: (value: string) => void;
  onAddNote: () => void;
  onEditNote: (index: number, value: string) => void;
  onRemoveNote: (index: number) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Notas de publicación</Text>
      <Text style={styles.sectionSubtitle}>Novedades que se muestran en la sección de descarga</Text>

      <View style={styles.noteInputRow}>
        <TextInput
          value={noteInput}
          onChangeText={onNoteInputChange}
          placeholder="Escribe una nota..."
          placeholderTextColor={portalPalette.mutedSoft}
          style={[styles.input, styles.noteInputField]}
          onSubmitEditing={onAddNote}
        />
        <Pressable accessibilityRole="button" onPress={onAddNote} style={styles.addNoteButton}>
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {notes.map((note, index) => (
        <View key={index} style={styles.noteItem}>
          <TextInput
            value={note}
            onChangeText={(v) => onEditNote(index, v)}
            placeholder="Nota..."
            placeholderTextColor={portalPalette.mutedSoft}
            style={[styles.input, styles.noteEditField]}
          />
          <Pressable accessibilityRole="button" onPress={() => onRemoveNote(index)} style={styles.removeNoteButton}>
            <MaterialCommunityIcons name="close" size={18} color={portalPalette.danger} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
