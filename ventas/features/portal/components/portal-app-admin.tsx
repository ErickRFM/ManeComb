import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppStore } from '@/src/store/use-app-store';
import { usePortalStore } from '../store/use-portal-store';
import { portalButtonGradient, portalGlass, portalPalette } from '../portal-theme';
import type { PortalAppInfo, PortalAppVersion } from '../types';

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function PortalAppAdmin() {
  const user = useAppStore((s) => s.user);
  const { appInfo, isSubmitting, updateAppInfo } = usePortalStore();

  const isAdmin = Boolean(user && ['owner', 'admin'].includes(user.role));

  const [form, setForm] = useState<PortalAppInfo | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [historyEditor, setHistoryEditor] = useState<PortalAppVersion[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (appInfo) {
      setForm({ ...appInfo });
      setHistoryEditor(appInfo.versionHistory ? appInfo.versionHistory.map((v) => ({ ...v })) : []);
    }
  }, [appInfo]);

  const dirty = useMemo(() => {
    if (!form || !appInfo) return false;
    if (!deepEq(form.versionHistory, historyEditor)) return true;
    const { versionHistory: _vh1, ...rest1 } = form;
    const { versionHistory: _vh2, ...rest2 } = appInfo;
    return !deepEq(rest1, rest2);
  }, [form, appInfo, historyEditor]);

  const setField = useCallback(<K extends keyof PortalAppInfo>(key: K, value: PortalAppInfo[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const addNote = useCallback(() => {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    setForm((prev) => (prev ? { ...prev, releaseNotes: [...prev.releaseNotes, trimmed] } : prev));
    setNoteInput('');
  }, [noteInput]);

  const removeNote = useCallback((index: number) => {
    setForm((prev) => (prev ? { ...prev, releaseNotes: prev.releaseNotes.filter((_, i) => i !== index) } : prev));
  }, []);

  const editNote = useCallback((index: number, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const notes = [...prev.releaseNotes];
      notes[index] = value;
      return { ...prev, releaseNotes: notes };
    });
  }, []);

  const addVersion = useCallback(() => {
    setHistoryEditor((prev) => [
      {
        version: '',
        date: '',
        current: false,
        size: '',
        androidMin: '',
        notes: [],
        archived: false,
      },
      ...prev,
    ]);
  }, []);

  const updateVersion = useCallback((index: number, field: keyof PortalAppVersion, value: unknown) => {
    setHistoryEditor((prev) => {
      const next = prev.map((v) => ({ ...v }));
      (next[index] as Record<string, unknown>)[field] = value;
      return next;
    });
  }, []);

  const removeVersion = useCallback((index: number) => {
    setHistoryEditor((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleArchived = useCallback((index: number) => {
    setHistoryEditor((prev) => {
      const next = prev.map((v) => ({ ...v }));
      next[index] = { ...next[index], archived: !next[index].archived };
      return next;
    });
  }, []);

  const markCurrent = useCallback((index: number) => {
    setHistoryEditor((prev) =>
      prev.map((v, i) => ({ ...v, current: i === index }))
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setConfirmVisible(false);
    const result = await updateAppInfo({
      ...form,
      versionHistory: historyEditor,
    });
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }, [form, historyEditor, updateAppInfo]);

  if (!appInfo) return null;

  if (!isAdmin) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="shield-lock-outline" size={48} color={portalPalette.muted} />
          <Text style={styles.emptyTitle}>Acceso restringido</Text>
          <Text style={styles.emptyDesc}>Solo el administrador puede gestionar la aplicación.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Información general</Text>
        <Text style={styles.sectionSubtitle}>Campos principales de la aplicación</Text>

        <View style={styles.fieldRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Versión</Text>
            <TextInput
              value={form?.version ?? ''}
              onChangeText={(v) => setField('version', v)}
              placeholder="1.0.0"
              placeholderTextColor={portalPalette.mutedSoft}
              style={styles.input}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Estado</Text>
            <TextInput
              value={form?.status ?? ''}
              onChangeText={(v) => setField('status', v)}
              placeholder="disponible"
              placeholderTextColor={portalPalette.mutedSoft}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Android mínimo</Text>
            <TextInput
              value={form?.androidMin ?? ''}
              onChangeText={(v) => setField('androidMin', v)}
              placeholder="8.0"
              placeholderTextColor={portalPalette.mutedSoft}
              style={styles.input}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tamaño</Text>
            <TextInput
              value={form?.size ?? ''}
              onChangeText={(v) => setField('size', v)}
              placeholder="42 MB"
              placeholderTextColor={portalPalette.mutedSoft}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Fecha de publicación</Text>
            <TextInput
              value={form?.releaseDate ?? ''}
              onChangeText={(v) => setField('releaseDate', v)}
              placeholder="2026-07-20"
              placeholderTextColor={portalPalette.mutedSoft}
              style={styles.input}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>URL del APK</Text>
            <TextInput
              value={form?.apkUrl ?? ''}
              onChangeText={(v) => setField('apkUrl', v)}
              placeholder="https://..."
              placeholderTextColor={portalPalette.mutedSoft}
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notas de publicación</Text>
        <Text style={styles.sectionSubtitle}>Novedades que se muestran en la sección de descarga</Text>

        <View style={styles.noteInputRow}>
          <TextInput
            value={noteInput}
            onChangeText={setNoteInput}
            placeholder="Escribe una nota..."
            placeholderTextColor={portalPalette.mutedSoft}
            style={[styles.input, styles.noteInputField]}
            onSubmitEditing={addNote}
          />
          <Pressable accessibilityRole="button" onPress={addNote} style={styles.addNoteButton}>
            <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {form?.releaseNotes.map((note, index) => (
          <View key={index} style={styles.noteItem}>
            <TextInput
              value={note}
              onChangeText={(v) => editNote(index, v)}
              placeholder="Nota..."
              placeholderTextColor={portalPalette.mutedSoft}
              style={[styles.input, styles.noteEditField]}
            />
            <Pressable accessibilityRole="button" onPress={() => removeNote(index)} style={styles.removeNoteButton}>
              <MaterialCommunityIcons name="close" size={18} color={portalPalette.danger} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Historial de versiones</Text>
            <Text style={styles.sectionSubtitle}>Agrega, edita o archiva versiones anteriores</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={addVersion} style={styles.addVersionButton}>
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.addVersionText}>Nueva</Text>
          </Pressable>
        </View>

        {historyEditor.map((ver, index) => (
          <View key={index} style={styles.historyVersionCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyIndex}>#{historyEditor.length - index}</Text>
              {ver.archived && <Text style={styles.archivedBadge}>Archivada</Text>}
              {ver.current && <Text style={styles.currentBadge}>ACTUAL</Text>}
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Versión</Text>
                <TextInput
                  value={ver.version}
                  onChangeText={(v) => updateVersion(index, 'version', v)}
                  placeholder="1.0.0"
                  placeholderTextColor={portalPalette.mutedSoft}
                  style={styles.input}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Fecha</Text>
                <TextInput
                  value={ver.date}
                  onChangeText={(v) => updateVersion(index, 'date', v)}
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
                  onChangeText={(v) => updateVersion(index, 'androidMin', v)}
                  placeholder="8.0"
                  placeholderTextColor={portalPalette.mutedSoft}
                  style={styles.input}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Tamaño</Text>
                <TextInput
                  value={ver.size}
                  onChangeText={(v) => updateVersion(index, 'size', v)}
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
                    updateVersion(index, 'notes', next);
                  }}
                  placeholder="Nota..."
                  placeholderTextColor={portalPalette.mutedSoft}
                  style={[styles.input, styles.noteEditField]}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => updateVersion(index, 'notes', ver.notes.filter((_, i) => i !== ni))}
                  style={styles.removeNoteButton}
                >
                  <MaterialCommunityIcons name="close" size={18} color={portalPalette.danger} />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => updateVersion(index, 'notes', [...ver.notes, ''])}
              style={styles.addVersionNoteBtn}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={16} color={portalPalette.accent} />
              <Text style={styles.addVersionNoteText}>Agregar nota</Text>
            </Pressable>

            <View style={styles.historyActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => markCurrent(index)}
                style={[styles.historyActionBtn, ver.current && styles.historyActionBtnActive]}
              >
                <MaterialCommunityIcons name="star" size={16} color={ver.current ? '#FFFFFF' : portalPalette.muted} />
                <Text style={[styles.historyActionText, ver.current && styles.historyActionTextActive]}>
                  {ver.current ? 'Actual' : 'Marcar actual'}
                </Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={() => toggleArchived(index)} style={styles.historyActionBtn}>
                <MaterialCommunityIcons
                  name={ver.archived ? 'archive-arrow-up' : 'archive-arrow-down'}
                  size={16}
                  color={portalPalette.muted}
                />
                <Text style={styles.historyActionText}>{ver.archived ? 'Restaurar' : 'Archivar'}</Text>
              </Pressable>

              <Pressable accessibilityRole="button" onPress={() => removeVersion(index)} style={styles.historyActionBtn}>
                <MaterialCommunityIcons name="delete-outline" size={16} color={portalPalette.danger} />
                <Text style={[styles.historyActionText, { color: portalPalette.danger }]}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.saveBar}>
        {dirty && <View style={styles.dirtyDot} />}
        <Text style={styles.saveStatus}>
          {saved ? 'Guardado correctamente' : dirty ? 'Hay cambios sin guardar' : 'Sin cambios'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!dirty || isSubmitting}
          onPress={() => setConfirmVisible(true)}
          style={[styles.saveButton, (!dirty || isSubmitting) && styles.saveButtonDisabled, portalButtonGradient()]}
        >
          <MaterialCommunityIcons name="content-save" size={18} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Text>
        </Pressable>
      </View>

      <ConfirmModal
        visible={confirmVisible}
        title="¿Guardar cambios?"
        description="Se actualizará la información de la aplicación para todos los usuarios."
        confirmLabel="Guardar"
        cancelLabel="Cancelar"
        onConfirm={handleSave}
        onCancel={() => setConfirmVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 32,
  },
  card: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: 12,
    minWidth: 0,
    padding: AppTheme.spacing.lg,
    ...portalGlass(),
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  emptyTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyDesc: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    textAlign: 'center',
  },
  sectionTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    marginTop: -8,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fieldGroup: {
    flex: 1,
    flexBasis: 200,
    gap: 4,
    minWidth: 0,
  },
  label: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  noteInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  noteInputField: {
    flex: 1,
  },
  addNoteButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.accent,
    borderRadius: AppTheme.radius.sm,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  noteItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  noteEditField: {
    flex: 1,
  },
  removeNoteButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  addVersionButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.accent,
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
  },
  addVersionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  historyVersionCard: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 10,
    padding: AppTheme.spacing.md,
  },
  historyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  historyIndex: {
    color: portalPalette.mutedSoft,
    fontFamily: Typography.display,
    fontSize: 13,
    fontWeight: '900',
  },
  archivedBadge: {
    backgroundColor: portalPalette.warningSoft,
    borderRadius: AppTheme.radius.pill,
    color: portalPalette.warning,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentBadge: {
    backgroundColor: portalPalette.successSoft,
    borderRadius: AppTheme.radius.pill,
    color: portalPalette.success,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  historyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  historyActionBtn: {
    alignItems: 'center',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  historyActionBtnActive: {
    backgroundColor: portalPalette.accent,
    borderColor: portalPalette.accent,
  },
  historyActionText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  historyActionTextActive: {
    color: '#FFFFFF',
  },
  addVersionNoteBtn: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 4,
  },
  addVersionNoteText: {
    color: portalPalette.accent,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  saveBar: {
    alignItems: 'center',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
    padding: AppTheme.spacing.md,
    ...portalGlass(),
  },
  dirtyDot: {
    backgroundColor: portalPalette.warning,
    borderRadius: 6,
    height: 10,
    width: 10,
  },
  saveStatus: {
    color: portalPalette.muted,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    minWidth: 0,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 18,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
});
