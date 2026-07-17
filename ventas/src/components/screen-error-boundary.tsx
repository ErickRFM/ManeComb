import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { portalPalette } from '@/features/portal/portal-theme';
import { Typography } from '@/constants/theme';

type ScreenErrorBoundaryProps = {
  children: ReactNode;
  name?: string;
};

type ScreenErrorBoundaryState = {
  error: Error | null;
};

export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  state: ScreenErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name || 'Screen'}] Error`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={portalPalette.danger} />
        </View>
        <Text style={styles.title}>Error en esta pantalla</Text>
        <Text style={styles.description}>
          Ocurrió un error al cargar {this.props.name || 'esta sección'}. El resto del portal sigue funcionando.
        </Text>
        <Pressable
          onPress={() => {
            this.setState({ error: null });
          }}
          style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 28,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: portalPalette.dangerSoft,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 480,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    borderColor: portalPalette.lineStrong,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    minHeight: 40,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  retryText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
});
