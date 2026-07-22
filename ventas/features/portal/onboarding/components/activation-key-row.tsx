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
  onRevoke,
  onShare,
  showShare = true,
}: {
  activationKey: PortalActivationKey;
  isSubmitting: boolean;
  onCopy: (activationKey: PortalActivationKey) => void;
  onDelete: (activationKey: PortalActivationKey) => void;
  onRevoke: (activationKey: PortalActivationKey) => void;
  onShare: (activationKey: PortalActivationKey) => void;
  showShare?: boolean;
}) {
  const canRevoke = activationKey.status === 'available';
  const usedBy = activationKey.driver?.name || activationKey.usedByDriverId;

  return (
    <PortalDataRow leading={<View style={styles.keyIcon}>
        <MaterialCommunityIcons
          name={activationKey.status === 'used' ? 'account-check-outline' : 'key-variant'}
          size={21}
          color={activationKey.status === 'available' ? portalPalette.success : portalPalette.accent}
        />
      </View>} body={<>
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
      </>} actions={<View style={styles.keyActions}>
        <KeyActionButton
          icon="content-copy"
          label="Copiar"
          accessibilityLabel={`Copiar key ${activationKey.key}`}
          onPress={() => onCopy(activationKey)}
          disabled={activationKey.status !== 'available'}
        />
        {showShare ? (
          <KeyActionButton
            icon="share-variant-outline"
            label="Compartir"
            accessibilityLabel={`Compartir key ${activationKey.key}`}
            onPress={() => onShare(activationKey)}
            disabled={activationKey.status !== 'available'}
            tone="info"
          />
        ) : null}
        {activationKey.status === 'available' ? (
          <KeyActionButton
            icon="block-helper"
            label="Revocar"
            accessibilityLabel={`Revocar key ${activationKey.key}`}
            onPress={() => onRevoke(activationKey)}
            disabled={!canRevoke || isSubmitting}
            tone="danger"
          />
        ) : null}
        {activationKey.status === 'available' ? (
          <KeyActionButton
            icon="trash-can-outline"
            label="Eliminar"
            accessibilityLabel={`Eliminar key ${activationKey.key}`}
            onPress={() => onDelete(activationKey)}
            disabled={isSubmitting}
            tone="danger"
          />
        ) : null}
      </View>} />
  );
}
