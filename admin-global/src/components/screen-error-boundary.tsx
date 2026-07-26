import { Component, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { palette } from '@/styles/theme';

type Props = { children: ReactNode; name?: string };
type State = { hasError: boolean; error?: Error };

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#050816', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: palette.danger, fontSize: 18, fontWeight: '900', marginBottom: 8 }}>
            Error en {this.props.name || 'pantalla'}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>
            {this.state.error?.message || 'Ocurrió un error inesperado'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
