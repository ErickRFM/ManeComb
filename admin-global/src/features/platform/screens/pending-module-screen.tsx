import { StyleSheet, Text, View } from 'react-native';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import type { AdminNavigationItem } from '../navigation';

export function AdminPendingModuleScreen({ item }: { item: AdminNavigationItem }) {
  return (
    <AdminShell title={item.label} subtitle={item.description}>
      <View style={styles.card}>
        <Text style={styles.phase}>{item.phase}</Text>
        <Text style={styles.title}>Módulo identificado, todavía no habilitado</Text>
        <Text style={styles.body}>
          La navegación ya respeta las capacidades de tu rol. Los datos y acciones de este módulo se implementarán en {item.phase}, sin inventar registros ni reutilizar endpoints empresariales fuera de su alcance tenant.
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
  phase: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 999,
    color: palette.info,
    fontFamily: Typography.mono,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  title: { color: palette.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900', marginTop: 16 },
  body: { color: palette.muted, fontFamily: Typography.body, fontSize: 13, lineHeight: 20, marginTop: 9 },
});
