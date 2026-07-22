import { Text, TextInput, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';
import type { PortalAppInfo } from '../../types';

export function AppAdminGeneralForm({
  form,
  onFieldChange,
}: {
  form: PortalAppInfo;
  onFieldChange: <K extends keyof PortalAppInfo>(key: K, value: PortalAppInfo[K]) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Información general</Text>
      <Text style={styles.sectionSubtitle}>Campos principales de la aplicación</Text>

      <View style={styles.fieldRow}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Versión</Text>
          <TextInput
            value={form.version ?? ''}
            onChangeText={(v) => onFieldChange('version', v)}
            placeholder="1.0.0"
            placeholderTextColor={portalPalette.mutedSoft}
            style={styles.input}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Estado</Text>
          <TextInput
            value={form.status ?? ''}
            onChangeText={(v) => onFieldChange('status', v)}
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
            value={form.androidMin ?? ''}
            onChangeText={(v) => onFieldChange('androidMin', v)}
            placeholder="8.0"
            placeholderTextColor={portalPalette.mutedSoft}
            style={styles.input}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Tamaño</Text>
          <TextInput
            value={form.size ?? ''}
            onChangeText={(v) => onFieldChange('size', v)}
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
            value={form.releaseDate ?? ''}
            onChangeText={(v) => onFieldChange('releaseDate', v)}
            placeholder="2026-07-20"
            placeholderTextColor={portalPalette.mutedSoft}
            style={styles.input}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>URL del APK</Text>
          <TextInput
            value={form.apkUrl ?? ''}
            onChangeText={(v) => onFieldChange('apkUrl', v)}
            placeholder="https://..."
            placeholderTextColor={portalPalette.mutedSoft}
            style={styles.input}
          />
        </View>
      </View>
    </View>
  );
}
