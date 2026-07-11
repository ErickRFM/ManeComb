import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DesignSystem, getAppPalette, Typography } from '@/constants/theme';

const errorTheme = getAppPalette('dark');

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ventas] Error renderizando la app', error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          alignItems: 'center',
          background: errorTheme.background,
          color: errorTheme.text,
          display: 'flex',
          minHeight: '100vh',
          padding: 24,
        }}>
        <div style={{ maxWidth: 680 }}>
          <p
            style={{
              color: errorTheme.accent,
              fontFamily: Typography.body,
              fontSize: DesignSystem.typography.caption.size,
              fontWeight: 900,
              margin: '0 0 8px',
              textTransform: 'uppercase',
            }}>
            Portal de ventas
          </p>
          <h1
            style={{
              fontFamily: Typography.display,
              fontSize: DesignSystem.typography.hero.size,
              lineHeight: `${DesignSystem.typography.hero.lineHeight}px`,
              margin: '0 0 10px',
            }}>
            No pudimos cargar esta pantalla.
          </h1>
          <p
            style={{
              color: errorTheme.muted,
              fontFamily: Typography.body,
              fontSize: DesignSystem.typography.body.size,
              lineHeight: `${DesignSystem.typography.body.lineHeight}px`,
              margin: '0 0 18px',
            }}>
            La app encontro un error de runtime. Recarga la pagina o vuelve al inicio de ventas.
          </p>
          <button
            onClick={() => {
              window.location.assign('/ventas');
            }}
            style={{
              background: errorTheme.accent,
              border: 0,
              borderRadius: DesignSystem.radius.control,
              color: '#FFFFFF',
              cursor: 'pointer',
              fontFamily: Typography.body,
              fontSize: DesignSystem.typography.body.size,
              fontWeight: 900,
              minHeight: DesignSystem.control.sm,
              padding: '0 16px',
            }}>
            Volver a ventas
          </button>
          {import.meta.env.DEV ? (
            <pre
              style={{
                background: errorTheme.surfaceAlt,
                borderRadius: DesignSystem.radius.icon,
                color: errorTheme.danger,
                marginTop: 20,
                overflow: 'auto',
                padding: 12,
                whiteSpace: 'pre-wrap',
              }}>
              {this.state.error.stack || this.state.error.message}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
