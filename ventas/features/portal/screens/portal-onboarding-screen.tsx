import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import type { PortalActivationKey, PortalActivationKeysSummary, PortalOnboardingStep } from '@/src/types/app';

function getStepIcon(stepId: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    'company-profile': 'domain',
    'select-plan': 'clipboard-list-outline',
    'plan-active': 'clipboard-check-outline',
    payment: 'credit-card-check-outline',
    'payment-method': 'credit-card-outline',
    'activation-keys': 'key-variant',
    'activated-drivers': 'account-check-outline',
    'register-units': 'bus-multiple',
    'invite-supervisors': 'account-tie-outline',
    'activate-drivers': 'steering',
    'gps-setup': 'crosshairs-gps',
    'radio-setup': 'radio-handheld',
    'gps-radio': 'radio-tower',
    'finish-activation': 'check-decagram-outline',
  };

  return icons[stepId] || 'flag-checkered';
}

function getStepTarget(stepId: string) {
  if (stepId === 'company-profile') {
    return { pathname: '/portal/perfil', params: { section: 'empresa' } };
  }

  if (stepId === 'select-plan' || stepId === 'plan-active') {
    return '/portal/plan';
  }

  if (stepId === 'payment-method' || stepId === 'payment') {
    return '/portal/pagos';
  }

  if (stepId === 'activated-drivers') {
    return '/portal/usuarios';
  }

  if (stepId === 'register-units') {
    return '/portal/unidades';
  }

  if (stepId === 'invite-supervisors') {
    return '/portal/usuarios';
  }

  if (stepId === 'activate-drivers') {
    return '/portal/usuarios';
  }

  if (stepId === 'gps-setup' || stepId === 'gps-radio') {
    return '/portal/rutas';
  }

  if (stepId === 'radio-setup') {
    return '/portal/unidades';
  }

  if (stepId === 'finish-activation') {
    return '/portal';
  }

  return null;
}

function ActivationWizardStep({
  index,
  step,
}: {
  index: number;
  step: PortalOnboardingStep;
}) {
  const done = step.status === 'completed';
  const stepTarget = getStepTarget(step.id);

  return (
    <View style={[styles.stepCard, done ? styles.stepCardDone : undefined]}>
      <View style={styles.stepTop}>
        <View style={styles.stepIndicators}>
          <View style={[styles.stepNumber, done ? styles.stepNumberDone : undefined]}>
            {done ? (
              <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
            ) : (
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            )}
          </View>
          <View style={styles.stepIcon}>
            <MaterialCommunityIcons name={getStepIcon(step.id)} size={19} color={done ? portalPalette.success : portalPalette.accent} />
          </View>
        </View>
        <StatusBadge label={formatPortalStatus(step.status)} tone={getPortalStatusTone(step.status)} />
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        {step.description ? <Text style={styles.stepDescription}>{step.description}</Text> : null}
      </View>
      <View style={styles.stepActions}>
        {stepTarget ? (
          <Pressable onPress={() => router.push(stepTarget as never)} style={styles.stepActionButton}>
            <Text style={styles.stepActionText}>Abrir</Text>
            <MaterialCommunityIcons name="arrow-right" size={15} color={portalPalette.text} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function formatActivationKeyStatus(status: PortalActivationKey['status']) {
  if (status === 'available') return 'disponible';
  if (status === 'used') return 'usada';
  if (status === 'expired') return 'vencida';
  if (status === 'revoked') return 'revocada';

  return formatPortalStatus(status);
}

function getActivationKeyTone(status: PortalActivationKey['status']) {
  if (status === 'available') return 'positive';
  if (status === 'used') return 'info';
  if (status === 'expired') return 'warning';
  if (status === 'revoked') return 'danger';

  return 'neutral';
}

function ActivationMetric({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function ActivationKeysSummary({
  summary,
}: {
  summary: PortalActivationKeysSummary | null;
}) {
  if (!summary) {
    return (
      <EmptyState
        icon="clipboard-list-outline"
        title="Sin resumen de activación"
        description="El resumen aparecerá cuando el backend entregue el estado del plan y los cupos disponibles."
      />
    );
  }

  return (
    <View style={styles.metricGrid}>
      <View style={styles.metricTile}>
        <View style={styles.metricHeader}>
          <Text style={styles.metricLabel}>Plan actual</Text>
          <StatusBadge
            label={formatPortalStatus(summary.planStatus)}
            tone={getPortalStatusTone(summary.planStatus)}
          />
        </View>
        <Text style={styles.metricValue}>{summary.planName}</Text>
        <Text style={styles.metricDetail}>{summary.maxUnits} combis incluidas</Text>
      </View>
      <ActivationMetric
        label="Límite"
        value={`${summary.maxDrivers}`}
        detail="conductores / unidades activas"
      />
      <ActivationMetric
        label="Keys"
        value={`${summary.keysGenerated}`}
        detail={`${summary.keysUsed} usadas / ${summary.keysAvailable} disponibles`}
      />
      <ActivationMetric
        label="Cupos disponibles"
        value={`${summary.availableSlots}`}
        detail={`${summary.activeDrivers} conductores activados`}
      />
    </View>
  );
}
function KeyActionButton({
  accessibilityLabel,
  disabled,
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger' | 'info';
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.keyActionButton,
        tone === 'danger' ? styles.keyDangerButton : undefined,
        tone === 'info' ? styles.keyInfoButton : undefined,
        disabled ? styles.disabledButton : undefined,
      ]}>
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={tone === 'danger' ? portalPalette.danger : tone === 'info' ? portalPalette.info : portalPalette.text}
      />
      <Text
        style={[
          styles.keyActionText,
          tone === 'danger' ? styles.keyDangerText : undefined,
          tone === 'info' ? styles.keyInfoText : undefined,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActivationKeyRow({
  activationKey,
  isSubmitting,
  onCopy,
  onRevoke,
  onShare,
}: {
  activationKey: PortalActivationKey;
  isSubmitting: boolean;
  onCopy: (activationKey: PortalActivationKey) => void;
  onRevoke: (activationKey: PortalActivationKey) => void;
  onShare: (activationKey: PortalActivationKey) => void;
}) {
  const canRevoke = activationKey.status === 'available';
  const usedBy = activationKey.driver?.name || activationKey.usedByDriverId;

  return (
    <View style={styles.keyRow}>
      <View style={styles.keyIcon}>
        <MaterialCommunityIcons
          name={activationKey.status === 'used' ? 'account-check-outline' : 'key-variant'}
          size={21}
          color={activationKey.status === 'available' ? portalPalette.success : portalPalette.accent}
        />
      </View>
      <View style={styles.keyBody}>
        <View style={styles.keyTopLine}>
          <Text style={styles.keyValue} selectable>
            {activationKey.key}
          </Text>
          <StatusBadge
            label={formatActivationKeyStatus(activationKey.status)}
            tone={getActivationKeyTone(activationKey.status)}
          />
        </View>
        <Text style={styles.keyMeta}>
          {activationKey.status === 'used'
            ? `Conductor: ${usedBy || 'asociado'}`
            : `Vence: ${activationKey.expiresAt ? new Date(activationKey.expiresAt).toLocaleDateString('es-MX') : 'sin fecha'}`}
        </Text>
      </View>
      <View style={styles.keyActions}>
        <KeyActionButton
          icon="content-copy"
          label="Copiar"
          accessibilityLabel={`Copiar key ${activationKey.key}`}
          onPress={() => onCopy(activationKey)}
          disabled={activationKey.status !== 'available'}
        />
        <KeyActionButton
          icon="share-variant-outline"
          label="Compartir"
          accessibilityLabel={`Compartir key ${activationKey.key}`}
          onPress={() => onShare(activationKey)}
          disabled={activationKey.status !== 'available'}
          tone="info"
        />
        {activationKey.status !== 'used' ? (
          <KeyActionButton
            icon="block-helper"
            label="Revocar"
            accessibilityLabel={`Revocar key ${activationKey.key}`}
            onPress={() => onRevoke(activationKey)}
            disabled={!canRevoke || isSubmitting}
            tone="danger"
          />
        ) : null}
      </View>
    </View>
  );
}

export function PortalOnboardingScreen() {
  const {
    activationKeys,
    activationSummary,
    generateActivationKey,
    isLoading,
    isSubmitting,
    loadOverview,
    onboarding,
    revokeActivationKey,
  } = usePortalStore(
    useShallow((state) => ({
      activationKeys: state.activationKeys,
      activationSummary: state.activationSummary,
      generateActivationKey: state.generateActivationKey,
      isLoading: state.isLoading,
      isSubmitting: state.isSubmitting,
      loadOverview: state.loadOverview,
      onboarding: state.onboarding,
      revokeActivationKey: state.revokeActivationKey,
    }))
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const steps = onboarding?.steps || [];
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const progress = steps.length ? Math.round((completedSteps / steps.length) * 100) : 0;
  const canGenerate = !isSubmitting && Number(activationSummary?.availableSlots || 0) > 0;

  const handleGenerateKey = async () => {
    setFeedback(null);
    const result = await generateActivationKey();

    setFeedback(result.ok ? 'Key generada. Ya puedes copiarla o compartirla con el conductor.' : result.message || null);
  };

  const handleCopyKey = async (activationKey: PortalActivationKey) => {
    setFeedback(null);

    try {
      const webNavigator = globalThis.navigator as
        | (Navigator & { clipboard?: { writeText?: (text: string) => Promise<void> } })
        | undefined;

      if (Platform.OS === 'web' && webNavigator?.clipboard?.writeText) {
        await webNavigator.clipboard.writeText(activationKey.key);
        setFeedback('Key copiada al portapapeles.');
        return;
      }

      await Share.share({ message: `Clave de activación ManeComb: ${activationKey.key}` });
      setFeedback('Key lista para compartir.');
    } catch {
      setFeedback('No fue posible copiar la key. Intenta compartirla manualmente.');
    }
  };

  const handleShareKey = async (activationKey: PortalActivationKey) => {
    setFeedback(null);

    try {
      await Share.share({
        message: `Soy conductor ManeComb. Usa esta clave para activar tu cuenta: ${activationKey.key}`,
      });
      setFeedback('Key compartida.');
    } catch {
      setFeedback('No fue posible compartir la key.');
    }
  };

  const handleRevokeKey = async (activationKey: PortalActivationKey) => {
    setFeedback(null);
    const result = await revokeActivationKey(activationKey.id);
    setFeedback(result.ok ? 'Key revocada.' : result.message || null);
  };

  return (
    <PortalLayout
      title="Activación"
      subtitle="Controla el plan comprado y activa conductores con keys vinculadas a la empresa."
      actions={
        <Pressable
          onPress={() => void loadOverview()}
          style={[styles.actionButton, portalButtonGradient()]}>
          <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>Actualizar</Text>
        </Pressable>
      }>
      <PortalSectionCard
        title="Progreso"
        subtitle={`${completedSteps}/${steps.length || 9} pasos completados`}
        right={<StatusBadge label={`${progress}%`} tone={progress === 100 ? 'positive' : 'warning'} />}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </PortalSectionCard>

      <PortalSectionCard
        title="Keys de activación para conductores"
        subtitle="Genera, comparte y revoca códigos respetando el límite del plan activo."
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Generar key de activación"
            disabled={!canGenerate}
            onPress={() => void handleGenerateKey()}
            style={[styles.actionButton, portalButtonGradient(), !canGenerate ? styles.disabledButton : undefined]}>
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <MaterialCommunityIcons name="key-plus" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.actionText}>Generar key</Text>
          </Pressable>
        }>
        {isLoading && !activationSummary ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={portalPalette.accent} />
            <Text style={styles.loadingText}>Cargando keys de activación...</Text>
          </View>
        ) : (
          <>
            <ActivationKeysSummary summary={activationSummary} />
            {feedback ? (
              <View style={styles.feedbackBox}>
                <MaterialCommunityIcons name="information-outline" size={17} color={portalPalette.info} />
                <Text style={styles.feedbackText}>{feedback}</Text>
              </View>
            ) : null}
            {activationKeys.length ? (
              <View style={styles.keysList}>
                {activationKeys.map((activationKey) => (
                  <ActivationKeyRow
                    key={activationKey.id}
                    activationKey={activationKey}
                    isSubmitting={isSubmitting}
                    onCopy={(currentKey) => void handleCopyKey(currentKey)}
                    onShare={(currentKey) => void handleShareKey(currentKey)}
                    onRevoke={(currentKey) => void handleRevokeKey(currentKey)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="key-variant"
                title="Aún no hay keys generadas"
                description="Genera una key por cada conductor que deba activar su cuenta."
              />
            )}
          </>
        )}
      </PortalSectionCard>

      <PortalSectionCard
        title="Pasos de activación"
        subtitle="Empresa, plan activo, pago, keys, conductores, unidades y GPS/Radio.">
        {steps.length ? (
          <View style={styles.wizardGrid}>
            {steps.map((step, index) => (
              <ActivationWizardStep
                key={step.id}
                index={index}
                step={step}
              />
            ))}
          </View>
        ) : (
          <EmptyState icon="flag-checkered" title="Onboarding sin pasos disponibles" />
        )}
      </PortalSectionCard>
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.55,
  },
  loadingBox: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 10,
    justifyContent: 'center',
    minHeight: 130,
    padding: AppTheme.spacing.lg,
  },
  loadingText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  metricTile: {
    backgroundColor: portalPalette.surfaceStrong,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 190,
    gap: 7,
    minHeight: 118,
    minWidth: 0,
    padding: AppTheme.spacing.md,
  },
  metricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  metricLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: portalPalette.text,
    flexShrink: 1,
    fontFamily: Typography.display,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 31,
    minWidth: 0,
  },
  metricDetail: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
    minWidth: 0,
  },
  feedbackBox: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderColor: 'rgba(35, 213, 255, 0.18)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedbackText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    minWidth: 0,
  },
  keysList: {
    gap: 10,
  },
  keyRow: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceStrong,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  keyIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  keyBody: {
    flex: 1,
    flexBasis: 220,
    gap: 5,
    minWidth: 0,
  },
  keyTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  keyValue: {
    color: portalPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 0,
  },
  keyMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  keyActions: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 150,
  },
  keyActionButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    minWidth: 38,
    paddingHorizontal: 10,
  },
  keyDangerButton: {
    backgroundColor: portalPalette.dangerSoft,
    borderColor: 'rgba(255, 90, 122, 0.18)',
  },
  keyInfoButton: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: 'rgba(35, 213, 255, 0.18)',
  },
  keyActionText: {
    color: portalPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 0,
  },
  keyDangerText: {
    color: portalPalette.danger,
  },
  keyInfoText: {
    color: portalPalette.info,
  },
  progressTrack: {
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: AppTheme.radius.pill,
    height: 10,
    minWidth: 0,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: portalPalette.success,
    borderRadius: AppTheme.radius.pill,
    height: 10,
  },
  wizardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  stepCard: {
    backgroundColor: portalPalette.surfaceStrong,
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexBasis: 240,
    gap: 10,
    minHeight: 170,
    minWidth: 0,
    padding: AppTheme.spacing.sm,
  },
  stepCardDone: {
    borderColor: 'rgba(82, 242, 167, 0.22)',
  },
  stepTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  stepIndicators: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 10,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  stepNumberDone: {
    backgroundColor: portalPalette.success,
    borderColor: portalPalette.success,
  },
  stepNumberText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  stepIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  stepCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  stepTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
    minWidth: 0,
  },
  stepDescription: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  stepActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  stepActionButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: 120,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  stepActionText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    flexShrink: 1,
  },
});
