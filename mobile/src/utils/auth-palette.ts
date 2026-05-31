export type AuthThemeMode = 'light' | 'dark';

export function getAuthPalette(mode: AuthThemeMode) {
  if (mode === 'dark') {
    return {
      mode,
      background: '#0D1117',
      panel: '#141A22',
      panelSoft: '#1B2430',
      input: '#10161F',
      border: '#313A48',
      text: '#F4F7FB',
      muted: '#A8B1C2',
      accent: '#E31E24',
      accentSoft: 'rgba(227, 30, 36, 0.16)',
      shadow: 'rgba(0, 0, 0, 0.34)',
      statusBar: 'light' as const,
    };
  }

  return {
    mode,
    background: '#FFFFFF',
    panel: '#FFFFFF',
    panelSoft: '#F6F7FB',
    input: '#FFFFFF',
    border: '#20242C',
    text: '#171A20',
    muted: '#7A8090',
    accent: '#E31E24',
    accentSoft: 'rgba(227, 30, 36, 0.08)',
    shadow: 'rgba(17, 24, 39, 0.08)',
    statusBar: 'dark' as const,
  };
}
