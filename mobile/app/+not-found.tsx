import { Link, router, usePathname } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';

function sanitizePathname(pathname: string) {
  const trimmed = (pathname || '/').replace(/[.,;:!?]+$/g, '');
  return trimmed || '/';
}

export default function NotFoundScreen() {
  const pathname = usePathname();
  const sanitizedPath = useMemo(() => sanitizePathname(pathname), [pathname]);

  useEffect(() => {
    if (sanitizedPath !== pathname) {
      router.replace(sanitizedPath as never);
    }
  }, [pathname, sanitizedPath]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Ruta no encontrada</Text>
        <Text style={styles.body}>
          No encontramos <Text style={styles.code}>{pathname}</Text>. Si la URL trae un punto o signo
          al final, la corregimos automáticamente.
        </Text>
        <View style={styles.links}>
          <Link href="/ventas" style={styles.link}>
            Ir a ventas
          </Link>
          <Link href="/login" style={styles.link}>
            Ir a login
          </Link>
          <Link href="/mapa" style={styles.link}>
            Ir a mapa
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0E1116',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 620,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 28,
    gap: 16,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: Typography.display,
    fontSize: 42,
    fontWeight: '900',
  },
  body: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: Typography.body,
    fontSize: 16,
    lineHeight: 26,
  },
  code: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: AppTheme.spacing.sm,
  },
  link: {
    color: '#F04A43',
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '800',
  },
});
