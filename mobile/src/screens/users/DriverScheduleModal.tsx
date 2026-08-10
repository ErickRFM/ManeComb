import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { User } from '@/src/types/app';
import { getApiErrorMessage } from '@/src/api/client';
import { updateDriverOperationalScheduleRequest } from '@/src/api/directory-admin-api';
import {
  DIRECTORY_SCHEDULE_DAY_OPTIONS,
  adjustDriverScheduleClock,
  createDriverScheduleDraft,
  driverScheduleDraftEquals,
  formatDriverScheduleSummary,
  serializeDriverScheduleDraft,
  type DriverScheduleDraft,
} from './driver-schedule-editor';

type DriverScheduleModalProps = {
  driver: User | null;
  onClose: () => void;
  onSaved: (updatedDriver: User) => Promise<void> | void;
};

function TimeStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [hours, minutes] = value.split(':');

  return (
    <View style={styles.timeCard}>
      <View style={styles.timeHeader}>
        <Text style={styles.timeLabel}>{label}</Text>
        <View style={styles.timeValuePill}>
          <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.accent} />
          <Text style={styles.timeValue}>{value}</Text>
        </View>
      </View>
      <View style={styles.stepperGrid}>
        <View style={styles.stepperGroup}>
          <Text style={styles.stepperLabel}>Hora</Text>
          <View style={styles.stepperRow}>
            <Pressable
              accessibilityLabel={`Restar una hora a ${label.toLowerCase()}`}
              onPress={() => onChange(adjustDriverScheduleClock(value, -60))}
              style={styles.stepperButton}>
              <MaterialCommunityIcons name="minus" size={18} color={theme.colors.text} />
            </Pressable>
            <Text style={styles.stepperValue}>{hours}</Text>
            <Pressable
              accessibilityLabel={`Sumar una hora a ${label.toLowerCase()}`}
              onPress={() => onChange(adjustDriverScheduleClock(value, 60))}
              style={styles.stepperButton}>
              <MaterialCommunityIcons name="plus" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
        <View style={styles.stepperGroup}>
          <Text style={styles.stepperLabel}>Minutos</Text>
          <View style={styles.stepperRow}>
            <Pressable
              accessibilityLabel={`Restar cinco minutos a ${label.toLowerCase()}`}
              onPress={() => onChange(adjustDriverScheduleClock(value, -5))}
              style={styles.stepperButton}>
              <MaterialCommunityIcons name="minus" size={18} color={theme.colors.text} />
            </Pressable>
            <Text style={styles.stepperValue}>{minutes}</Text>
            <Pressable
              accessibilityLabel={`Sumar cinco minutos a ${label.toLowerCase()}`}
              onPress={() => onChange(adjustDriverScheduleClock(value, 5))}
              style={styles.stepperButton}>
              <MaterialCommunityIcons name="plus" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
      <Text style={styles.hint}>Formato 24 horas · ajustes de 5 minutos</Text>
    </View>
  );
}

export function DriverScheduleModal({ driver, onClose, onSaved }: DriverScheduleModalProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [draft, setDraft] = useState<DriverScheduleDraft>(() => createDriverScheduleDraft(null));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driver) return;
    setDraft(createDriverScheduleDraft(driver.operationalSchedule));
    setDirty(false);
    setError(null);
    setSaving(false);
  }, [driver]);

  const isConfigured = Boolean(driver?.operationalSchedule);
  const hasChanges = Boolean(driver) && (
    isConfigured
      ? !driverScheduleDraftEquals(draft, driver?.operationalSchedule)
      : dirty
  );
  const summary = formatDriverScheduleSummary(draft);
  const timezoneLabel = draft.timezone || 'Local del dispositivo';
  const savedStateLabel = !isConfigured
    ? 'Sin horario configurado'
    : driver?.operationalSchedule?.enabled === false
      ? 'Horario pausado'
      : 'Horario configurado';

  const updateDraft = (updater: (current: DriverScheduleDraft) => DriverScheduleDraft) => {
    setDirty(true);
    setDraft(updater);
  };

  const toggleDay = (day: number) => {
    updateDraft((current) => {
      const selected = current.activeDays.includes(day);
      if (selected && current.activeDays.length === 1) return current;
      return {
        ...current,
        activeDays: selected
          ? current.activeDays.filter((entry) => entry !== day)
          : [...current.activeDays, day],
      };
    });
  };

  const save = async () => {
    if (!driver || saving || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDriverOperationalScheduleRequest(
        driver.id,
        serializeDriverScheduleDraft(draft)
      );
      await onSaved(updated);
      onClose();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'No fue posible guardar el horario del conductor.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={Boolean(driver)}
      transparent
      animationType="fade"
      onRequestClose={() => !saving && onClose()}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Horario operativo</Text>
              <Text style={styles.subtitle}>{driver?.name || 'Conductor'}</Text>
            </View>
            <Pressable
              accessibilityLabel="Cerrar horario"
              disabled={saving}
              onPress={onClose}
              style={styles.iconButton}>
              <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            <View style={styles.savedStateRow}>
              <MaterialCommunityIcons
                name={isConfigured ? 'calendar-check-outline' : 'calendar-blank-outline'}
                size={20}
                color={isConfigured ? theme.colors.success : theme.colors.muted}
              />
              <View style={styles.headerCopy}>
                <Text style={styles.savedStateTitle}>Estado guardado</Text>
                <Text style={styles.sectionHint}>{savedStateLabel}</Text>
              </View>
            </View>

            <View style={styles.enabledRow}>
              <View style={styles.headerCopy}>
                <Text style={styles.sectionTitle}>{isConfigured ? 'Horario operativo' : 'Habilitar al guardar'}</Text>
                <Text style={styles.sectionHint}>
                  {!isConfigured
                    ? `Al guardar por primera vez quedará ${draft.enabled ? 'habilitado' : 'pausado'}.`
                    : draft.enabled
                      ? 'El horario quedará habilitado.'
                      : 'El horario quedará pausado sin perder su configuración.'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Horario operativo"
                value={draft.enabled}
                onValueChange={(enabled) => updateDraft((current) => ({ ...current, enabled }))}
                trackColor={{ false: theme.colors.line, true: theme.colors.accentSoft }}
                thumbColor={draft.enabled ? theme.colors.accent : theme.colors.muted}
              />
            </View>

            <View style={styles.summaryCard}>
              <MaterialCommunityIcons name="calendar-clock" size={22} color={theme.colors.accent} />
              <View style={styles.headerCopy}>
                <Text style={styles.summaryTitle}>Horario a guardar</Text>
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            </View>

            <TimeStepper
              label="Inicio"
              value={draft.startTime}
              onChange={(startTime) => updateDraft((current) => ({ ...current, startTime }))}
            />
            <TimeStepper
              label="Fin"
              value={draft.endTime}
              onChange={(endTime) => updateDraft((current) => ({ ...current, endTime }))}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Días activos</Text>
              <Text style={styles.sectionHint}>Debe quedar al menos un día seleccionado.</Text>
              <View style={styles.daysRow}>
                {DIRECTORY_SCHEDULE_DAY_OPTIONS.map((day) => {
                  const selected = draft.activeDays.includes(day.id);
                  return (
                    <Pressable
                      key={day.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => toggleDay(day.id)}
                      style={[styles.dayChip, selected ? styles.dayChipSelected : undefined]}>
                      <Text style={[styles.dayText, selected ? styles.dayTextSelected : undefined]}>
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Zona horaria</Text>
              <View style={styles.timezoneCard}>
                <MaterialCommunityIcons name="earth" size={20} color={theme.colors.muted} />
                <View style={styles.headerCopy}>
                  <Text style={styles.timezoneValue}>{timezoneLabel}</Text>
                  <Text style={styles.sectionHint}>
                    Se conserva la zona registrada. La validación operativa actual usa el reloj local del dispositivo.
                  </Text>
                </View>
              </View>
            </View>

            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable disabled={saving} onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={saving || !hasChanges}
              onPress={() => void save()}
              style={[styles.primaryButton, !hasChanges ? styles.buttonDisabled : undefined]}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>{isConfigured ? 'Guardar horario' : 'Configurar horario'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.72)',
      flex: 1,
      justifyContent: 'center',
      padding: 18,
    },
    modal: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.lg,
      borderWidth: 1,
      maxHeight: '90%',
      maxWidth: 680,
      overflow: 'hidden',
      width: '100%',
    },
    header: {
      alignItems: 'flex-start',
      borderBottomColor: theme.colors.line,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 18,
    },
    headerCopy: { flex: 1, gap: 4, minWidth: 0 },
    title: { color: theme.colors.text, fontFamily: Typography.display, fontSize: 22, fontWeight: '900' },
    subtitle: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 14 },
    iconButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    scrollContent: { gap: 14, padding: 18, paddingBottom: 22 },
    savedStateRow: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 12,
    },
    savedStateTitle: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
    enabledRow: {
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 14,
      padding: 14,
    },
    section: { gap: 10 },
    sectionTitle: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
    sectionHint: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
    summaryCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 14,
    },
    summaryTitle: { color: theme.colors.accent, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
    summaryText: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '800', lineHeight: 20 },
    timeCard: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      gap: 12,
      padding: 14,
    },
    timeHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
    timeLabel: { color: theme.colors.text, fontFamily: Typography.display, fontSize: 17, fontWeight: '900' },
    timeValuePill: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    timeValue: { color: theme.colors.text, fontFamily: Typography.mono, fontSize: 18, fontWeight: '900' },
    stepperGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    stepperGroup: { flex: 1, gap: 7, minWidth: 180 },
    stepperLabel: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    stepperRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
    stepperButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      height: 42,
      justifyContent: 'center',
      width: 46,
    },
    stepperValue: { color: theme.colors.text, fontFamily: Typography.mono, fontSize: 18, fontWeight: '900', minWidth: 30, textAlign: 'center' },
    hint: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 11 },
    daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dayChip: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.line,
      borderRadius: 999,
      borderWidth: 1,
      minWidth: 58,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },
    dayChipSelected: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
    dayText: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
    dayTextSelected: { color: theme.colors.accent },
    timezoneCard: {
      alignItems: 'flex-start',
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 12,
    },
    timezoneValue: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '800' },
    errorBox: { backgroundColor: theme.colors.dangerSoft, borderRadius: AppTheme.radius.md, padding: 12 },
    errorText: { color: theme.colors.danger, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    actions: {
      borderTopColor: theme.colors.line,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'flex-end',
      padding: 16,
    },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 16,
    },
    secondaryText: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.colors.accent,
      borderRadius: AppTheme.radius.md,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 150,
      paddingHorizontal: 18,
    },
    primaryText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
    buttonDisabled: { opacity: DesignSystem.opacity.disabled },
  });
}
