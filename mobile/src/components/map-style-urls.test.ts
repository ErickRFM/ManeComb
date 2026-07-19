import { MAP_STYLE_URLS, resolveMapStyleUrl } from './map-style-urls';

describe('estilos de mapa', () => {
  it('usa los estilos de navegacion vigentes para el trafico', () => {
    expect(resolveMapStyleUrl(true, 'light')).toBe('mapbox://styles/mapbox/navigation-day-v1');
    expect(resolveMapStyleUrl(true, 'dark')).toBe('mapbox://styles/mapbox/navigation-night-v1');
  });

  it('usa los estilos base cuando el trafico esta apagado', () => {
    expect(resolveMapStyleUrl(false, 'light')).toBe('mapbox://styles/mapbox/light-v11');
    expect(resolveMapStyleUrl(false, 'dark')).toBe('mapbox://styles/mapbox/dark-v11');
  });

  // `Mapbox.StyleURL.TrafficDay` apunta a `navigation-preview-day-v4`, de una
  // familia que Mapbox reemplazo. Un estilo retirado no falla de forma visible:
  // el mapa carga sin capa de trafico mientras la interfaz anuncia "TRAFICO ON".
  it('no vuelve a los estilos preview retirados', () => {
    const allUrls = Object.values(MAP_STYLE_URLS);
    allUrls.forEach((url) => {
      expect(url).not.toContain('navigation-preview');
    });
  });

  it('no usa versiones antiguas de los estilos base', () => {
    expect(MAP_STYLE_URLS.light).not.toContain('light-v10');
    expect(MAP_STYLE_URLS.dark).not.toContain('dark-v10');
  });
});
