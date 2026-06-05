import { Link } from '@/src/navigation/router';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppTheme } from '@/src/hooks/use-app-theme';

export default function ModalScreen() {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <BrandLogo
        size="md"
        tone={theme.mode === 'light' ? 'dark' : 'light'}
        subtitle="Plataforma lista para operacion diaria y seguimiento en tiempo real."
      />
      <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Soporte operativo</Text>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        La plataforma ya esta lista para operar con tu backend.
      </Text>
      <Text style={[styles.body, { color: theme.colors.muted }]}>
        Si vas a probar en telefono fisico, usa la IP Wi-Fi de tu laptop en `MANECOMB_LAN_HOST`.
      </Text>
      <Link href="/mapa" dismissTo style={[styles.link, { color: theme.colors.accent }]}>
        Volver al tablero
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: AppTheme.spacing.xl,
    gap: AppTheme.spacing.md,
  },
  eyebrow: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 30,
    lineHeight: 38,
  },
  body: {
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 24,
  },
  link: {
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '700',
  },
});
