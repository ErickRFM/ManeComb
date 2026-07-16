import { Link } from '@/src/navigation/router';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppTheme } from '@/src/hooks/use-app-theme';

export function ModalScreen() {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <BrandLogo size="lg" />
      <Text style={[styles.title, { color: theme.colors.text }]}>Conexion de desarrollo</Text>
      <Text style={[styles.body, { color: theme.colors.muted }]}>
        Si vas a probar en telefono fisico, usa la IP Wi-Fi de tu laptop en `MANECOMB_LAN_HOST`.
      </Text>
      <Link href="/mapa" dismissTo style={[styles.link, { color: theme.colors.accent }]}>
        Volver al mapa
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: AppTheme.spacing.md, padding: AppTheme.spacing.xl },
  title: { fontFamily: Typography.display, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  body: { fontFamily: Typography.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  link: { fontFamily: Typography.body, fontSize: 15, fontWeight: '900', paddingTop: 8 },
});
