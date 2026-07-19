/**
 * Estilos de mapa, en un solo lugar para nativo y web.
 *
 * Tráfico: se usan los estilos de navegación vigentes de Mapbox
 * (`navigation-day-v1` / `navigation-night-v1`). NO se usa
 * `Mapbox.StyleURL.TrafficDay` del paquete: esa constante apunta a
 * `navigation-preview-day-v4`, de la familia `navigation-preview-*` que Mapbox
 * reemplazó. Un estilo retirado no falla de forma visible — el mapa carga sin
 * la capa de tráfico y la interfaz sigue anunciando "TRAFICO ON".
 *
 * Base: `light-v11` / `dark-v11`, las versiones vigentes.
 */

export const MAP_STYLE_URLS = {
  trafficDay: 'mapbox://styles/mapbox/navigation-day-v1',
  trafficNight: 'mapbox://styles/mapbox/navigation-night-v1',
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
} as const;

export function resolveMapStyleUrl(showsTraffic: boolean, themeMode: 'light' | 'dark') {
  if (showsTraffic) {
    return themeMode === 'light' ? MAP_STYLE_URLS.trafficDay : MAP_STYLE_URLS.trafficNight;
  }

  return themeMode === 'light' ? MAP_STYLE_URLS.light : MAP_STYLE_URLS.dark;
}
