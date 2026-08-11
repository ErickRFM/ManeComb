import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { DirectoryStyles } from '../users-screen.styles';

/**
 * Chrome comun de las acciones de Directorio que exigen revisar impacto antes de
 * confirmar. Conductores y unidades repetian el mismo esqueleto: cabecera, fila
 * de carga, caja de error con reintento y fila de acciones.
 *
 * El contenido de dominio —los detalles del impacto y los campos propios de cada
 * accion— entra por `children`, para no acabar en un modal universal con una
 * prop por cada variante.
 *
 * No decide si se puede confirmar: eso sigue siendo autoridad de
 * `directory-action-state.ts`, y llega ya resuelto en `confirmEnabled`.
 */
export function DirectoryImpactActionModal({
  children,
  confirmEnabled,
  confirmLabel,
  danger = false,
  error,
  loading,
  loadingLabel,
  onCancel,
  onConfirm,
  onRetry,
  styles,
  submitting,
  subtitle,
  title,
  visible,
}: {
  children?: ReactNode;
  confirmEnabled: boolean;
  confirmLabel: string;
  danger?: boolean;
  error: string | null;
  loading: boolean;
  loadingLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  styles: DirectoryStyles;
  submitting: boolean;
  subtitle: string;
  title: string;
  visible: boolean;
}) {
  const { theme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={styles.sectionSubtitle}>{loadingLabel}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.impactErrorBox}>
              <Text style={styles.dangerText}>{error}</Text>
              <Pressable disabled={loading} onPress={onRetry} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Reintentar revisión</Text>
              </Pressable>
            </View>
          ) : null}

          {children}

          <View style={styles.modalActions}>
            <Pressable disabled={submitting} onPress={onCancel} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              disabled={!confirmEnabled}
              onPress={onConfirm}
              style={[
                styles.primaryButton,
                danger ? styles.dangerButton : undefined,
                !confirmEnabled ? styles.disabledButton : undefined,
              ]}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
