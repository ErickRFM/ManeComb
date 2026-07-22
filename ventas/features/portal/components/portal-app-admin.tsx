import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppStore } from '@/src/store/use-app-store';
import { usePortalStore } from '../store/use-portal-store';
import { portalPalette } from '../portal-theme';
import { getDeviceVersionStatsRequest } from '../api';
import { deepEq } from '../app-mobile/app-mobile.utils';
import { styles } from '../app-mobile/app-mobile.styles';
import type { DeviceVersionStats } from '@/src/api/client';
import { AppAdminGeneralForm } from '../app-mobile/components/app-admin-general-form';
import { AppAdminReleaseNotesEditor } from '../app-mobile/components/app-admin-release-notes-editor';
import { AppAdminVersionHistoryEditor } from '../app-mobile/components/app-admin-version-history-editor';
import { AppAdminDeviceStats } from '../app-mobile/components/app-admin-device-stats';
import { AppAdminSaveBar } from '../app-mobile/components/app-admin-save-bar';
import type { PortalAppInfo, PortalAppVersion } from '../types';

export function PortalAppAdmin() {
  const user = useAppStore((s) => s.user);
  const { appInfo, isSubmitting, updateAppInfo } = usePortalStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      isSubmitting: state.isSubmitting,
      updateAppInfo: state.updateAppInfo,
    }))
  );

  const isAdmin = Boolean(user && ['owner', 'admin'].includes(user.role));

  const [form, setForm] = useState<PortalAppInfo | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [historyEditor, setHistoryEditor] = useState<PortalAppVersion[]>([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deviceStats, setDeviceStats] = useState<DeviceVersionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    setStatsLoading(true);
    getDeviceVersionStatsRequest()
      .then(setDeviceStats)
      .catch(() => undefined)
      .finally(() => setStatsLoading(false));
  }, [isAdmin]);

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
        mandatory: false,
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

  const handleSaveClick = useCallback(() => {
    setConfirmVisible(true);
  }, []);

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
      {form && (
        <AppAdminGeneralForm form={form} onFieldChange={setField} />
      )}

      {form && (
        <AppAdminReleaseNotesEditor
          noteInput={noteInput}
          notes={form.releaseNotes}
          onNoteInputChange={setNoteInput}
          onAddNote={addNote}
          onEditNote={editNote}
          onRemoveNote={removeNote}
        />
      )}

      <AppAdminVersionHistoryEditor
        versions={historyEditor}
        onAddVersion={addVersion}
        onUpdateVersion={updateVersion}
        onRemoveVersion={removeVersion}
        onToggleArchived={toggleArchived}
        onMarkCurrent={markCurrent}
      />

      <AppAdminDeviceStats stats={deviceStats} loading={statsLoading} />

      <AppAdminSaveBar
        dirty={dirty}
        saved={saved}
        isSubmitting={isSubmitting}
        onSave={handleSaveClick}
      />

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
