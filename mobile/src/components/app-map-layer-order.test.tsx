import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native-config', () => ({ __esModule: true, default: {} }));

// Doble del SDK: cada primitiva recuerda las props con las que se monto, para
// poder comprobar la relacion real de ids del style graph y no una cadena suelta.
jest.mock('@rnmapbox/maps', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
        ReactMock.createElement(View, { testID: name, ...props }, children),
      { displayName: name }
    );

  return {
    __esModule: true,
    default: {
      setAccessToken: jest.fn(),
      MapView: passthrough('MapView'),
      Camera: passthrough('Camera'),
      ShapeSource: passthrough('ShapeSource'),
      LineLayer: passthrough('LineLayer'),
      PointAnnotation: passthrough('PointAnnotation'),
      MarkerView: passthrough('MarkerView'),
      UserLocation: passthrough('UserLocation'),
    },
  };
});

import {
  AppMap,
  AppMapPolyline,
  MAP_ANNOTATION_LAYER_ID,
} from './app-map.native';

function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer as unknown as TestRenderer.ReactTestRenderer;
}

// Solo nodos host: `findAll` visita tambien el componente compuesto, que
// duplicaria cada coincidencia.
function hostsWithTestId(tree: TestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (node) => typeof node.type === 'string' && (node.props as Record<string, unknown> | null)?.testID === testID
  );
}

const ROUTE = [
  { latitude: 19.415, longitude: -99.073 },
  { latitude: 19.4452, longitude: -99.1513 },
];

describe('orden de capas del mapa', () => {
  it('el id de anclaje es el que realmente usa @rnmapbox/maps', () => {
    // Si una actualizacion del SDK renombra la capa de anotaciones, el anclaje
    // dejaria de aplicarse en silencio y la linea volveria a tapar los pines.
    const fs = require('node:fs');
    const path = require('node:path');
    const coordinator = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../node_modules/@rnmapbox/maps/android/src/main/java/com/rnmapbox/rnmbx/components/annotation/RNMBXPointAnnotationCoordinator.kt'
      ),
      'utf8'
    );
    const declared = coordinator.match(/layerId:\s*String\?\s*=\s*"([^"]+)"/);

    expect(declared?.[1]).toBe(MAP_ANNOTATION_LAYER_ID);
  });

  it('ROUTE_LINE se ancla por debajo de la capa de marcadores de extremo', () => {
    const tree = render(
      <AppMapPolyline id="route" coordinates={ROUTE} strokeColor="#2563EB" />
    );
    const line = hostsWithTestId(tree, 'LineLayer');

    expect(line).toHaveLength(1);
    expect(line[0].props.belowLayerID).toBe(MAP_ANNOTATION_LAYER_ID);
    // Ni aboveLayerID ni layerIndex: una segunda regla de posicionamiento podria
    // contradecir al anclaje.
    expect(line[0].props.aboveLayerID).toBeUndefined();
    expect(line[0].props.layerIndex).toBeUndefined();
  });

  it('el casing y la linea principal quedan ambos bajo los marcadores', () => {
    // El preview del Checklist dibuja dos polilineas: borde y trazo.
    const tree = render(
      <>
        <AppMapPolyline id="route-preview-base" coordinates={ROUTE} strokeColor="#0F172A" strokeWidth={8} />
        <AppMapPolyline id="route-preview-main" coordinates={ROUTE} strokeColor="#2563EB" strokeWidth={4} />
      </>
    );
    const lines = hostsWithTestId(tree, 'LineLayer');

    expect(lines).toHaveLength(2);
    lines.forEach((layer) => {
      expect(layer.props.belowLayerID).toBe(MAP_ANNOTATION_LAYER_ID);
    });
    // El casing se monta antes, asi queda por debajo del trazo principal.
    expect(lines[0].props.id).toContain('route-preview-base');
    expect(lines[1].props.id).toContain('route-preview-main');
  });

  it('el mapa monta el ancla de anotaciones aunque no haya pines', () => {
    // belowLayerID se resuelve con waitForLayer, que espera indefinidamente: sin
    // ninguna anotacion montada la linea no llegaria a anadirse nunca.
    const tree = render(
      <AppMap themeMode="light" initialRegion={{ latitude: 19.4, longitude: -99.1, latitudeDelta: 0.05, longitudeDelta: 0.05 }}>
        <AppMapPolyline id="route" coordinates={ROUTE} strokeColor="#2563EB" />
      </AppMap>
    );
    const annotations = hostsWithTestId(tree, 'PointAnnotation');

    expect(annotations.length).toBeGreaterThanOrEqual(1);
    expect(annotations.some((node) => node.props.id === 'manecomb-annotation-anchor')).toBe(true);
  });

  it('no dibuja nada con menos de dos puntos', () => {
    const tree = render(
      <AppMapPolyline id="route" coordinates={[ROUTE[0]]} strokeColor="#2563EB" />
    );
    expect(
      hostsWithTestId(tree, 'LineLayer')
    ).toHaveLength(0);
  });
});
