import { useCallback, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '@/src/store/use-app-store';
import { AppTheme, Typography, getAppPalette } from '@/constants/theme';

const colors = getAppPalette('light');

export function UpdateBanner() {
  const updateInfo = useAppStore((s) => s.updateInfo);
  const [dismissed, setDismissed] = useState(false);

  const handleUpdate = useCallback(() => {
    const url = updateInfo?.downloadUrl;
    if (url) Linking.openURL(url).catch(() => undefined);
  }, [updateInfo?.downloadUrl]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!updateInfo?.updateAvailable || dismissed) return null;

  if (updateInfo.mandatory) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={undefined}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.dialogIcon}>
              <Text style={styles.dialogIconText}>!</Text>
            </View>
            <Text style={styles.dialogTitle}>Actualización obligatoria</Text>
            <Text style={styles.dialogMessage}>
              Es necesario actualizar a la versión {updateInfo.latestVersion} para continuar usando la aplicación.
            </Text>
            {updateInfo.releaseNotes.length > 0 && (
              <View style={styles.dialogNotes}>
                {updateInfo.releaseNotes.map((note, i) => (
                  <Text key={i} style={styles.dialogNote}>• {note}</Text>
                ))}
              </View>
            )}
            <Pressable accessibilityRole="button" onPress={handleUpdate} style={styles.dialogButton}>
              <Text style={styles.dialogButtonText}>Actualizar ahora</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.banner}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerText}>
          Nueva versión disponible{' '}
          <Text style={styles.bannerVersion}>v{updateInfo.latestVersion}</Text>
        </Text>
        <View style={styles.bannerActions}>
          <Pressable accessibilityRole="button" onPress={handleUpdate} style={styles.bannerUpdateButton}>
            <Text style={styles.bannerUpdateText}>Actualizar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={handleDismiss} style={styles.bannerDismissButton}>
            <Text style={styles.bannerDismissText}>Más tarde</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: AppTheme.radius.lg,
    padding: AppTheme.spacing.xl,
    maxWidth: 400,
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  dialogIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogIconText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  dialogTitle: {
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  dialogMessage: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  dialogNotes: {
    width: '100%',
    gap: 4,
    paddingVertical: 8,
  },
  dialogNote: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: colors.text,
  },
  dialogButton: {
    backgroundColor: colors.accent,
    borderRadius: AppTheme.radius.sm,
    minHeight: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 8,
  },
  dialogButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  banner: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    zIndex: 1000,
    backgroundColor: colors.card,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  bannerText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  bannerVersion: {
    fontWeight: '900',
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bannerUpdateButton: {
    backgroundColor: colors.accent,
    borderRadius: AppTheme.radius.sm,
    paddingHorizontal: 14,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerUpdateText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  bannerDismissButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: AppTheme.radius.sm,
    paddingHorizontal: 12,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerDismissText: {
    color: colors.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
});
