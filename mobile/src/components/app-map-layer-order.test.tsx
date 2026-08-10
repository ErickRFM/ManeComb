import React from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native-config', () => ({ __esModule: true, default: {} }));

// Doble del SDK. `Camera` es de clase a proposito: asi `cameraRef.current`
// expone metodos reales y se puede comprobar con que coordenadas se encuadra.
jest.mock('@rnmapbox/maps', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
        ReactMock.createElement(View, { testID: name, ...props }, children),
      { displayName: name }
    );

  const fitBounds = jest.fn();
  const setCamera = jest.fn();

  class Camera extends ReactMock.Component {
    fitBounds = fitBounds;
    setCamera = setCamera;
    render() {
      return ReactMock.createElement(View, { testID: 'Camera' });
    }
  }

  return {
    __esModule: true,
    __cameraSpies: { fitBounds, setCamera },
    default: {
      setAccessToken: jest.fn(),
      MapView: passthrough('MapView'),
      Camera,
      ShapeSource: passthrough('ShapeSource'),
      LineLayer: passthrough('LineLayer'),
      PointAnnotation: passthrough('PointAnnotation'),
      MarkerView: passthrough('MarkerView'),
    },
  };
});

import {
  ANDROID_ANNOTATION_LAYER_ID,
  IOS_ANNOTATION_LAYER_ID,
  resolveAnnotationLayerId,
} from './map-annotation-layer';
import {
  AppMap,
  AppMapPolyline,
  MAP_ANNOTATION_LAYER_ID,
  MapAnnotationAnchor,
} from './app-map.native';
import type { AppMapRef } from './app-map.types';

const { __cameraSpies: cameraSpies } = jest.requireMock('@rnmapbox/maps') as {
  __cameraSpies: { fitBounds: jest.Mock; setCamera: jest.Mock };
};

function sdkSource(relativePath: string) {
  const fs = require('node:fs');
  const path = require('node:path');
  return fs.readFileSync(
    path.resolve(__dirname, '../../node_modules/@rnmapbox/maps', relativePath),
    'utf8'
  );
}

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
    (node) =>
      typeof node.type === 'string' &&
      (node.props as Record<string, unknown> | null)?.testID === testID
  );
}

const ROUTE = [
  { latitude: 19.415, longitude: -99.073 },
  { latitude: 19.4452, longitude: -99.1513 },
];

const REGION = {
  latitude: 19.4,
  longitude: -99.1,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

describe('orden de capas del mapa', () => {
  beforeEach(() => {
    cameraSpies.fitBounds.mockClear();
    cameraSpies.setCamera.mockClear();
  });

  // --- Contrato contra el SDK realmente instalado -----------------------------

  it('Android declara RNMBX-mapview-annotations', () => {
    const coordinator = sdkSource(
      'android/src/main/java/com/rnmapbox/rnmbx/components/annotation/RNMBXPointAnnotationCoordinator.kt'
    );
    const declared = coordinator.match(/layerId:\s*String\?\s*=\s*"([^"]+)"/);

    expect(declared?.[1]).toBe(ANDROID_ANNOTATION_LAYER_ID);
    expect(declared?.[1]).toBe('RNMBX-mapview-annotations');
  });

  it('iOS declara RNMBX-mapview-point-annotations', () => {
    // Distinto de Android: una sola constante seria incorrecta en una de las dos.
    const mapView = sdkSource('ios/RNMBX/RNMBXMapView.swift');
    const declared = mapView.match(
      /RNMBXPointAnnotationManager\(annotations:[^)]*id:\s*"([^"]+)"\)/
    );

    expect(declared?.[1]).toBe(IOS_ANNOTATION_LAYER_ID);
    expect(declared?.[1]).toBe('RNMBX-mapview-point-annotations');
    expect(IOS_ANNOTATION_LAYER_ID).not.toBe(ANDROID_ANNOTATION_LAYER_ID);
  });

  it('el resolver devuelve el id de cada plataforma', () => {
    expect(resolveAnnotationLayerId('android')).toBe(ANDROID_ANNOTATION_LAYER_ID);
    expect(resolveAnnotationLayerId('ios')).toBe(IOS_ANNOTATION_LAYER_ID);
    // Plataforma desconocida: sin anclaje. Anclar a un id inexistente dejaria la
    // linea esperando para siempre, que es peor que el orden incorrecto.
    expect(resolveAnnotationLayerId('web')).toBeUndefined();
    expect(resolveAnnotationLayerId('windows')).toBeUndefined();
  });

  // --- Anclaje de la linea -----------------------------------------------------

  it('ROUTE_LINE se ancla bajo la capa de anotaciones de la plataforma activa', () => {
    const tree = render(<AppMapPolyline id="route" coordinates={ROUTE} strokeColor="#2563EB" />);
    const lines = hostsWithTestId(tree, 'LineLayer');

    expect(lines).toHaveLength(1);
    expect(MAP_ANNOTATION_LAYER_ID).toBe(resolveAnnotationLayerId(Platform.OS));
    expect(lines[0].props.belowLayerID).toBe(MAP_ANNOTATION_LAYER_ID);
    // Ni aboveLayerID ni layerIndex: RNMBXLayer da precedencia a belowLayerID y
    // avisa si compiten, asi que una segunda regla seria ruido silencioso.
    expect(lines[0].props.aboveLayerID).toBeUndefined();
    expect(lines[0].props.layerIndex).toBeUndefined();
  });

  it('casing y trazo principal quedan ambos bajo las anotaciones', () => {
    const tree = render(
      <>
        <AppMapPolyline id="route-preview-base" coordinates={ROUTE} strokeColor="#0F172A" strokeWidth={8} />
        <AppMapPolyline id="route-preview-main" coordinates={ROUTE} strokeColor="#2563EB" strokeWidth={4} />
      </>
    );
    const lines = hostsWithTestId(tree, 'LineLayer');

    expect(lines).toHaveLength(2);
    lines.forEach((layer) => expect(layer.props.belowLayerID).toBe(MAP_ANNOTATION_LAYER_ID));
    // El casing se monta antes, asi queda por debajo del trazo principal.
    expect(lines[0].props.id).toContain('route-preview-base');
    expect(lines[1].props.id).toContain('route-preview-main');
  });

  it('no dibuja LineLayer con menos de dos puntos', () => {
    const tree = render(<AppMapPolyline id="route" coordinates={[ROUTE[0]]} strokeColor="#2563EB" />);
    expect(hostsWithTestId(tree, 'LineLayer')).toHaveLength(0);
  });

  // --- Ancla -------------------------------------------------------------------

  it('el mapa monta el ancla aunque no haya ningun marcador', () => {
    const tree = render(
      <AppMap themeMode="light" initialRegion={REGION}>
        <AppMapPolyline id="route" coordinates={ROUTE} strokeColor="#2563EB" />
      </AppMap>
    );
    const anchors = hostsWithTestId(tree, 'PointAnnotation').filter(
      (node) => node.props.id === 'manecomb-annotation-anchor'
    );

    expect(anchors).toHaveLength(1);
  });

  it('el ancla es inerte: sin arrastre, sin seleccion y con hijo de area cero', () => {
    const tree = render(<MapAnnotationAnchor />);
    const anchor = hostsWithTestId(tree, 'PointAnnotation')[0];

    expect(anchor.props.draggable).toBeUndefined();
    expect(anchor.props.onSelected).toBeUndefined();
    expect(anchor.props.onDragStart).toBeUndefined();
    expect(anchor.props.onDragEnd).toBeUndefined();
    expect(anchor.props.coordinate).toEqual([0, 0]);

    // BitmapUtils.viewToBitmap exige w > 0 && h > 0, asi que un hijo de 0x0 no
    // genera imagen: no hay nada que dibujar en Null Island.
    const styled = anchor
      .findAll((node) => typeof node.type === 'string')
      .map((node) => (node.props as Record<string, unknown>).style)
      .filter(Boolean)
      .flat();

    expect(styled).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 0, width: 0 })])
    );
  });

  it('el renderer web no participa de este contrato', () => {
    // mapbox-gl dibuja los marcadores como elementos DOM sobre el canvas, asi que
    // no puede presentar este defecto. Anclar capas ahi seria copiar una solucion
    // a un problema que no existe.
    const fs = require('node:fs');
    const path = require('node:path');
    const web = fs.readFileSync(path.resolve(__dirname, 'app-map.web.tsx'), 'utf8');

    expect(web).not.toContain('belowLayerID');
    expect(web).not.toContain('map-annotation-layer');
    expect(web).not.toContain('manecomb-annotation-anchor');
  });

  it('el ancla no entra en el encuadre de fitToCoordinates', () => {
    const ref = React.createRef<AppMapRef>();
    const tree = render(
      <AppMap ref={ref} themeMode="light" initialRegion={REGION}>
        <AppMapPolyline id="route" coordinates={ROUTE} strokeColor="#2563EB" />
      </AppMap>
    );

    // El mapa debe estar listo para que la accion de camara se ejecute.
    act(() => {
      hostsWithTestId(tree, 'MapView')[0].props.onDidFinishLoadingMap();
    });
    act(() => {
      ref.current?.fitToCoordinates(ROUTE, { animated: false });
    });

    expect(cameraSpies.fitBounds).toHaveBeenCalledTimes(1);
    const [ne, sw] = cameraSpies.fitBounds.mock.calls[0];
    // Null Island contaminaria bounds llevando el suroeste a [0, 0].
    expect(ne).toEqual([-99.073, 19.4452]);
    expect(sw).toEqual([-99.1513, 19.415]);
    expect(sw[0]).toBeLessThan(0);
    expect(sw[1]).toBeGreaterThan(0);
  });
});
