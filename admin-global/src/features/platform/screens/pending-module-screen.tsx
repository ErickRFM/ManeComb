import { StyleSheet, Text, View } from 'react-native';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import type { AdminNavigationItem } from '../navigation';

export function AdminPendingModuleScreen({ item }: { item: AdminNavigationItem }) {
  return (
    <AdminShell title={item.label} subtitle={item.description}>
      <View style={styles.card}>
        <Text style={styles.status}>No disponible</Text>
        <Text accessibilityRole="header" style={styles.title}>Este módulo aún no está habilitado</Text>
        <Text style={styles.body}>
          Tu navegación solo muestra funciones permitidas para tu cuenta. Cuando este módulo esté disponible, aparecerá con sus datos y acciones autorizadas.
        </Text>
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 760,
    padding: 24,
  },
  status: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 999,
    color: palette.info,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  title: { color: palette.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900', marginTop: 16 },
  body: { color: palette.muted, fontFamily: Typography.body, fontSize: 13, lineHeight: 20, marginTop: 9 },
});
