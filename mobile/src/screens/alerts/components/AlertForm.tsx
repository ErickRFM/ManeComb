import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { RefObject } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AppCard } from '@/src/components/app-card';
import { PrimaryButton } from '@/src/components/primary-button';
import type { IncidentSeverity } from '@/src/types/app';
import { getTextInputProps } from '@/src/utils/text-input-props';
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_STYLES,
  SEVERITIES,
  SEVERITY_STYLES,
} from '../constants/alerts.constants';

type IncidentType = (typeof INCIDENT_TYPES)[number];

export function AlertForm({
  description,
  descriptionInputRef,
  isSubmitting,
  onCreate,
  onDescriptionChange,
  onSeverityChange,
  onTitleChange,
  onTypeChange,
  severity,
  styles,
  theme,
  title,
  type,
}: {
  description: string;
  descriptionInputRef: RefObject<TextInput | null>;
  isSubmitting: boolean;
  onCreate: () => void;
  onDescriptionChange: (value: string) => void;
  onSeverityChange: (value: IncidentSeverity) => void;
  onTitleChange: (value: string) => void;
  onTypeChange: (value: IncidentType) => void;
  severity: IncidentSeverity;
  styles: any;
  theme: any;
  title: string;
  type: IncidentType;
}) {
  return (
    <AppCard style={styles.formCard}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Nueva alerta</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Titulo</Text>
        <TextInput
          {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'next' })}
          maxLength={100}
          placeholder="Titulo de la alerta"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          value={title}
          onChangeText={onTitleChange}
          onSubmitEditing={() => descriptionInputRef.current?.focus()}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Tipo</Text>
        <View style={styles.chipRow}>
          {INCIDENT_TYPES.map((incidentType) => {
            const isActive = type === incidentType;
            const typeStyle = INCIDENT_TYPE_STYLES[incidentType];

            return (
              <Pressable
                accessibilityRole="button"
                key={incidentType}
                onPress={() => onTypeChange(incidentType)}
                style={[
                  styles.chip,
                  isActive
                    ? { backgroundColor: typeStyle.backgroundColor, borderColor: typeStyle.color }
                    : undefined,
                ]}>
                <MaterialCommunityIcons
                  name={typeStyle.icon}
                  size={14}
                  color={isActive ? typeStyle.color : theme.colors.muted}
                />
                <Text style={[styles.chipText, isActive ? { color: typeStyle.color } : undefined]}>
                  {typeStyle.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Severidad</Text>
        <View style={styles.chipRow}>
          {SEVERITIES.map((incidentSeverity) => {
            const isActive = severity === incidentSeverity;
            const severityStyle = SEVERITY_STYLES[incidentSeverity];

            return (
              <Pressable
                accessibilityRole="button"
                key={incidentSeverity}
                onPress={() => onSeverityChange(incidentSeverity)}
                style={[
                  styles.chip,
                  isActive
                    ? { backgroundColor: severityStyle.backgroundColor, borderColor: severityStyle.color }
                    : undefined,
                ]}>
                <MaterialCommunityIcons
                  name="circle-medium"
                  size={14}
                  color={isActive ? severityStyle.color : theme.colors.muted}
                />
                <Text style={[styles.chipText, isActive ? { color: severityStyle.color } : undefined]}>
                  {severityStyle.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Descripcion</Text>
        <TextInput
          ref={descriptionInputRef}
          {...getTextInputProps(theme, {
            autoComplete: 'off',
            returnKeyType: 'done',
            submitBehavior: 'blurAndSubmit',
          })}
          maxLength={420}
          multiline
          numberOfLines={4}
          placeholder="Detalles de la alerta..."
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={onDescriptionChange}
          onSubmitEditing={onCreate}
        />
      </View>

      <PrimaryButton
        icon="alert-circle-outline"
        label="Emitir alerta"
        loading={isSubmitting}
        onPress={onCreate}
      />
    </AppCard>
  );
}
