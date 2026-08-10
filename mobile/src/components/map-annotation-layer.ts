/**
 * Capa de anotaciones de @rnmapbox/maps, por plataforma.
 *
 * `PointAnnotation` no es una vista sobre el mapa: se rasteriza y se dibuja como
 * simbolos en una capa del style graph. Anclar ahi debajo las lineas de ruta es
 * lo que impone el orden real de dibujo, y no un zIndex de UI.
 *
 * Los ids **no coinciden entre plataformas**, asi que una sola constante seria
 * incorrecta en una de las dos:
 *
 *   Android  RNMBXPointAnnotationCoordinator.kt  -> "RNMBX-mapview-annotations"
 *   iOS      RNMBXMapView.swift                  -> "RNMBX-mapview-point-annotations"
 *
 * En ambas, `belowLayerID` se resuelve esperando a que la capa exista
 * (`waitForLayer` en Android, `waitForLayerWithID` en iOS) y **la espera no tiene
 * timeout**: anclar a un id inexistente no degrada el orden, impide que la linea
 * llegue a insertarse. Por eso este resolver devuelve `undefined` en cualquier
 * plataforma que no conozcamos, para caer al comportamiento anterior en vez de
 * dejar la ruta invisible.
 */

export const ANDROID_ANNOTATION_LAYER_ID = 'RNMBX-mapview-annotations';
export const IOS_ANNOTATION_LAYER_ID = 'RNMBX-mapview-point-annotations';

export function resolveAnnotationLayerId(platform: string): string | undefined {
  if (platform === 'android') return ANDROID_ANNOTATION_LAYER_ID;
  if (platform === 'ios') return IOS_ANNOTATION_LAYER_ID;

  return undefined;
}
