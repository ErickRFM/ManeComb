import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalDataRow } from '../../components/portal-data-list';
import { portalPalette } from '../../portal-theme';
import { styles } from '../onboarding.styles';
import { formatActivationKeyStatus, getActivationKeyTone } from '../onboarding.utils';
import { KeyActionButton } from './key-action-button';
import type { PortalActivationKey } from '@/src/types/app';

export function ActivationKeyRow({
  activationKey,
  isSubmitting,
  onCopy,
  onDelete,
  onReplace,
  onRevoke,
  onShare,
}: {
  activationKey: PortalActivationKey;
  isSubmitting: boolean;
  onCopy: (activationKey: PortalActivationKey) => void;
  onDelete: (activationKey: PortalActivationKey) => void;
  onReplace: (activationKey: PortalActivationKey) => void;
  onRevoke: (activationKey: PortalActivationKey) => void;
  onShare: (activationKey: PortalActivationKey) => void;
}) {
  const isAvailable = activationKey.status === 'available';
  const usedBy = activationKey.driver?.name || activationKey.usedByDriverId;

  return (
    <PortalDataRow
      leading={
        <View style={styles.keyIcon}>
          <MaterialCommunityIcons
            name={activationKey.status === 'used' ? 'account-check-outline' : 'key-variant'}
            size={21}
            color={isAvailable ? portalPalette.success : portalPalette.accent}
          />
        </View>
      }
      body={
        <>
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
              ? activationKey.usedByDriverState === 'offboarded'
                ? `Conductor dado de baja: ${usedBy || 'asociado'}`
                : activationKey.usedByDriverState === 'deleted'
                  ? `Conductor eliminado: ${usedBy || 'evidencia conservada'}`
                  : `Conductor: ${usedBy || 'asociado'}`
              : activationKey.status === 'available'
                ? `Vence: ${activationKey.expiresAt ? new Date(activationKey.expiresAt).toLocaleString('es-MX') : 'sin fecha'}`
                : `Historial conservado · Creada: ${activationKey.createdAt ? new Date(activationKey.createdAt).toLocaleDateString('es-MX') : 'sin fecha'}`}
          </Text>
        </>
      }
      actions={
        <View style={styles.keyActions}>
          <KeyActionButton
            icon="content-copy"
            label="Copiar"
            accessibilityLabel={`Copiar key ${activationKey.key}`}
            onPress={() => onCopy(activationKey)}
            disabled={!isAvailable}
          />
          <KeyActionButton
            icon="share-variant-outline"
            label="Compartir"
            accessibilityLabel={`Compartir key ${activationKey.key}`}
            onPress={() => onShare(activationKey)}
            disabled={!isAvailable}
            tone="info"
          />
          {isAvailable ? (
            <KeyActionButton
              icon="key-change"
              label="Reemplazar"
              accessibilityLabel={`Revocar y reemplazar key ${activationKey.key}`}
              onPress={() => onReplace(activationKey)}
              disabled={isSubmitting}
              tone="info"
            />
          ) : null}
          {isAvailable ? (
            <KeyActionButton
              icon="block-helper"
              label="Revocar"
              accessibilityLabel={`Revocar key ${activationKey.key}`}
              onPress={() => onRevoke(activationKey)}
              disabled={isSubmitting}
              tone="danger"
            />
          ) : null}
          {isAvailable ? (
            <KeyActionButton
              icon="trash-can-outline"
              label="Eliminar"
              accessibilityLabel={`Eliminar key ${activationKey.key}`}
              onPress={() => onDelete(activationKey)}
              disabled={isSubmitting}
              tone="danger"
            />
          ) : null}
        </View>
      }
    />
  );
}
