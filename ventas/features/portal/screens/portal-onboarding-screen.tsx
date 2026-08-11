import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { ActivationTimeline, PortalSectionCard } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { PortalDataList } from '../components/portal-data-list';
import { portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import { styles } from '../onboarding/onboarding.styles';
import { ActivationKeysSummary } from '../onboarding/components/activation-keys-summary';
import { ActivationKeyRow } from '../onboarding/components/activation-key-row';
import { ActivationWizardStep } from '../onboarding/components/activation-wizard-step';
import { KeyActionButton } from '../onboarding/components/key-action-button';
import { getStepTarget } from '../onboarding/onboarding.utils';
import type { PortalActivationKey } from '@/src/types/app';

export function PortalOnboardingScreen() {
  const {
    activationKeys,
    activationSummary,
    deleteActivationKey,
    generateActivationKey,
    isLoading,
    isSubmitting,
    loadOverview,
    onboarding,
    overview,
    revokeActivationKey,
    shareActivationKey,
  } = usePortalStore(
    useShallow((state) => ({
      activationKeys: state.activationKeys,
      activationSummary: state.activationSummary,
      deleteActivationKey: state.deleteActivationKey,
      generateActivationKey: state.generateActivationKey,
      isLoading: state.isLoading,
      isSubmitting: state.isSubmitting,
      loadOverview: state.loadOverview,
      onboarding: state.onboarding,
      overview: state.overview,
      revokeActivationKey: state.revokeActivationKey,
      shareActivationKey: state.shareActivationKey,
    }))
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [keyConfirmation, setKeyConfirmation] = useState<{ type: 'revoke' | 'delete'; key: PortalActivationKey } | null>(null);

  const steps = onboarding?.steps || [];
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const progress = steps.length ? Math.round((completedSteps / steps.length) * 100) : 0;
  const canGenerate = !isSubmitting && Number(activationSummary?.availableSlots || 0) > 0;
  const generatedButNotSharedKey = activationKeys.find((k) => k.status === 'available' && !k.sharedAt);
  const sharedAvailableKey = activationKeys.find((k) => k.status === 'available' && k.sharedAt);
  const usedActivationKey = activationKeys.find((k) => k.status === 'used');
  const firstLoginComplete = overview?.activationTimeline?.find((e) => e.id === 'first-operational-login')?.status === 'completed';
  const activationComplete = onboarding?.status === 'completed';
  const nextPendingStep = steps.find((step) => step.status !== 'completed');
  const nextStepTarget = nextPendingStep ? getStepTarget(nextPendingStep.id) : null;

  const hasAvailableKey = Boolean(generatedButNotSharedKey || sharedAvailableKey);
  const hasAnyKey = activationKeys.length > 0;

  const assistantStep = activationComplete
    ? 'Activación completada'
    : generatedButNotSharedKey
      ? 'Compartir key'
      : sharedAvailableKey
        ? 'Key compartida'
        : usedActivationKey && !firstLoginComplete
          ? 'Esperando login'
          : usedActivationKey && nextPendingStep
            ? 'Siguiente paso'
            : 'Generar key';
  const assistantTitle = activationComplete
    ? 'Todos los pasos fueron realizados correctamente.'
    : generatedButNotSharedKey
      ? 'Comparte la key con el conductor.'
      : sharedAvailableKey
        ? 'Key compartida. Esperando que el conductor la use.'
        : usedActivationKey && !firstLoginComplete
          ? 'Esperando el primer inicio de sesión.'
          : usedActivationKey && nextPendingStep
            ? `Continúa con ${nextPendingStep.title}.`
            : 'Genera una key para comenzar.';
  const assistantDescription = activationComplete
    ? 'La cuenta está lista para operar.'
    : generatedButNotSharedKey
      ? 'El conductor podrá registrarse con esta key.'
      : sharedAvailableKey
        ? 'El conductor aún no ha utilizado la key.'
        : usedActivationKey && !firstLoginComplete
          ? 'La key ya fue utilizada por el conductor. Esperando que inicie sesión.'
          : usedActivationKey && nextPendingStep
            ? nextPendingStep.description || 'Completa el siguiente paso disponible.'
            : 'Compártela con el conductor para activar su cuenta.';

  const handleGenerateKey = async () => {
    setFeedback(null);
    const result = await generateActivationKey();
    setFeedback(result.ok ? 'Key generada. Ya puedes copiarla o compartirla con el conductor. El conductor aparecerá en Equipo tras activar su cuenta con la key.' : result.message || null);
  };

  const handleCopyKey = async (activationKey: PortalActivationKey) => {
    setFeedback(null);

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(activationKey.key);
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
      const shareResult = await Share.share({
        message: `Soy conductor ManeComb. Usa esta clave para activar tu cuenta: ${activationKey.key}`,
      });
      if (shareResult.action === Share.dismissedAction) {
        setFeedback('Compartir cancelado. La key sigue disponible y no se marcó como compartida.');
        return;
      }

      const result = await shareActivationKey(activationKey.id);
      setFeedback(
        result.ok
          ? 'Key compartida.'
          : result.message || 'La key se compartió, pero no fue posible registrar el evento en ManeComb.'
      );
    } catch {
      setFeedback('No se pudo abrir el diálogo de compartir. Copia la key manualmente.');
    }
  };

  const handleRevokeKey = async (activationKey: PortalActivationKey) => {
    setKeyConfirmation({ type: 'revoke', key: activationKey });
  };

  const handleDeleteKey = async (activationKey: PortalActivationKey) => {
    setKeyConfirmation({ type: 'delete', key: activationKey });
  };

  const confirmKeyAction = async () => {
    if (!keyConfirmation) return;
    setFeedback(null);
    const result = keyConfirmation.type === 'revoke'
      ? await revokeActivationKey(keyConfirmation.key.id)
      : await deleteActivationKey(keyConfirmation.key.id);
    setFeedback(result.ok
      ? keyConfirmation.type === 'revoke' ? 'Key revocada.' : 'Key eliminada.'
      : result.message || null);
    if (result.ok) setKeyConfirmation(null);
  };

  return (
    <PortalLayout
      title="Activación"
      subtitle="Controla el plan comprado y activa conductores con keys vinculadas a la empresa."
      actions={
        <PortalButton icon="refresh" loading={isLoading} onPress={() => void loadOverview()}>Actualizar</PortalButton>
      }>
      <View style={styles.assistantHero}>
        <View style={styles.assistantIcon}>
          <MaterialCommunityIcons
            name={activationComplete ? 'check-decagram' : generatedButNotSharedKey ? 'share-variant-outline' : sharedAvailableKey ? 'key-check-outline' : usedActivationKey ? 'account-clock-outline' : 'key-plus'}
            size={24}
            color={activationComplete ? portalPalette.success : portalPalette.accent}
          />
        </View>
        <View style={styles.assistantCopy}>
          <Text style={styles.assistantStep}>{assistantStep}</Text>
          <Text style={styles.assistantTitle}>{assistantTitle}</Text>
          <Text style={styles.assistantDescription}>{assistantDescription}</Text>
        </View>
        {!activationComplete && generatedButNotSharedKey ? (
          <KeyActionButton
            icon="share-variant-outline"
            label="Compartir"
            accessibilityLabel={`Compartir key ${generatedButNotSharedKey.key}`}
            onPress={() => void handleShareKey(generatedButNotSharedKey)}
            tone="info"
          />
        ) : !activationComplete && !hasAnyKey ? (
          <PortalButton
            accessibilityLabel="Generar key de activación"
            disabled={!canGenerate}
            icon="key-plus"
            loading={isSubmitting}
            onPress={() => void handleGenerateKey()}>
            Generar key
          </PortalButton>
        ) : !activationComplete && usedActivationKey && firstLoginComplete && nextStepTarget ? (
          <PortalButton accessibilityLabel={`Abrir ${nextPendingStep?.title || 'siguiente paso'}`} icon="arrow-right" onPress={() => router.push(nextStepTarget as never)} size="sm" variant="secondary">Abrir</PortalButton>
        ) : null}
      </View>

      <PortalSectionCard
        compact
        title="Progreso"
        subtitle={`${completedSteps}/${steps.length || 9} pasos completados`}
        right={<StatusBadge label={`${progress}%`} tone={progress === 100 ? 'positive' : 'warning'} />}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </PortalSectionCard>

      <PortalSectionCard
        title="Keys de activación para conductores"
        subtitle="Keys y cupos disponibles del plan actual.">
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
              <PortalDataList>
                {activationKeys.map((activationKey) => (
                  <ActivationKeyRow
                    key={activationKey.id}
                    activationKey={activationKey}
                    isSubmitting={isSubmitting}
                    onCopy={(currentKey) => void handleCopyKey(currentKey)}
                    onShare={(currentKey) => void handleShareKey(currentKey)}
                    onRevoke={(currentKey) => void handleRevokeKey(currentKey)}
                    onDelete={(currentKey) => void handleDeleteKey(currentKey)}
                    showShare={!hasAvailableKey}
                  />
                ))}
              </PortalDataList>
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
        compact
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
          <EmptyState
            icon="flag-checkered"
            title="Onboarding sin pasos disponibles"
            description="Actualiza el estado para volver a consultar la activación de tu cuenta."
          />
        )}
      </PortalSectionCard>

      {overview?.activationTimeline?.length ? (
        <PortalSectionCard compact title="Historial de activación" subtitle="Evidencia de los eventos ya registrados.">
          <ActivationTimeline events={overview.activationTimeline} />
        </PortalSectionCard>
      ) : null}
      <ConfirmModal
        visible={Boolean(keyConfirmation)}
        destructive
        title={keyConfirmation?.type === 'revoke' ? 'Revocar key disponible' : 'Eliminar key disponible'}
        description="Solo las keys disponibles pueden modificarse. Las keys usadas permanecen como evidencia y nunca vuelven a estar disponibles."
        confirmLabel={keyConfirmation?.type === 'revoke' ? 'Revocar key' : 'Eliminar key'}
        processing={isSubmitting}
        onCancel={() => setKeyConfirmation(null)}
        onConfirm={() => void confirmKeyAction()}
      />
    </PortalLayout>
  );
}
