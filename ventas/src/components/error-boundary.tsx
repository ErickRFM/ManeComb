import { Component, type ErrorInfo, type ReactNode } from 'react';

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
          background: '#050816',
          color: '#F8FAFC',
          display: 'flex',
          minHeight: '100vh',
          padding: 24,
        }}>
        <div style={{ maxWidth: 680 }}>
          <p
            style={{
              color: '#FF4D7D',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 1,
              margin: '0 0 8px',
              textTransform: 'uppercase',
            }}>
            Portal de ventas
          </p>
          <h1
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 30,
              lineHeight: 1.15,
              margin: '0 0 10px',
            }}>
            No pudimos cargar esta pantalla.
          </h1>
          <p
            style={{
              color: '#A8B1C2',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 15,
              lineHeight: 1.5,
              margin: '0 0 18px',
            }}>
            La app encontro un error de runtime. Recarga la pagina o vuelve al inicio de ventas.
          </p>
          <button
            onClick={() => {
              window.location.assign('/ventas');
            }}
            style={{
              background: '#FF245C',
              border: 0,
              borderRadius: 10,
              color: '#FFFFFF',
              cursor: 'pointer',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 14,
              fontWeight: 900,
              minHeight: 42,
              padding: '0 16px',
            }}>
            Volver a ventas
          </button>
          {import.meta.env.DEV ? (
            <pre
              style={{
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#FFB4C8',
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
