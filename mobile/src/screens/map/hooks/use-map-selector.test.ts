import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { useMapSelector } from '@/src/screens/map/hooks/use-map-selector';
import { planNavigationRouteRequest, reverseNavigationPlaceRequest } from '@/src/api/client';
import type { GeoPoint } from '@/src/types/app';

jest.mock('@/src/navigation/router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/src/api/client', () => ({
  planNavigationRouteRequest: jest.fn(),
  reverseNavigationPlaceRequest: jest.fn(),
}));

const planMock = planNavigationRouteRequest as jest.MockedFunction<typeof planNavigationRouteRequest>;
const reverseMock = reverseNavigationPlaceRequest as jest.MockedFunction<typeof reverseNavigationPlaceRequest>;

const ROUTE_FIT_PADDING = { top: 10, right: 10, bottom: 10, left: 10 };
const ORIGIN: GeoPoint = { latitude: 19.4, longitude: -99.1 };
const DESTINATION: GeoPoint = { latitude: 19.5, longitude: -99.2 };

function place(role: string, location: GeoPoint) {
  return { id: `${role}-${location.latitude}`, label: role, address: role, location };
}

function planResponse(polyline: GeoPoint[]) {
  return { routes: [{ id: 'r1', polyline, distanceMeters: 100, durationSeconds: 60 }] };
}

/**
 * Monta el hook y expone su valor de retorno mas reciente, junto con los espias
 * de camara y el ref de interaccion manual que le inyecta la pantalla.
 */
function mountSelector() {
  const fitRoute = jest.fn();
  const focusPoint = jest.fn();
  const hasUserMovedMapRef = { current: false };
  const seen: { value: ReturnType<typeof useMapSelector> | null } = { value: null };

  function Host() {
    seen.value = useMapSelector({
      fitRoute,
      focusPoint,
      hasUserMovedMapRef,
      params: {} as never,
      routeFitPadding: ROUTE_FIT_PADDING,
      selectorMode: true,
    });

    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Host));
  });

  return {
    fitRoute,
    focusPoint,
    hasUserMovedMapRef,
    get current() {
      if (!seen.value) throw new Error('hook no montado');
      return seen.value;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

/** Deja correr las microtareas pendientes de las promesas ya resueltas. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // El reverse-geocode debe devolver la MISMA coordenada que recibio: si inventa
  // otra, mueve el punto y cambia la llave de ruta por razones ajenas al test.
  reverseMock.mockImplementation((location: GeoPoint) =>
    Promise.resolve({ result: place('reverse', location) }) as never
  );
});

describe('useMapSelector - encuadre automatico de camara', () => {
  it('encuadra la ruta la primera vez que se resuelve el plan', async () => {
    planMock.mockResolvedValue(planResponse([ORIGIN, DESTINATION]) as never);
    const selector = mountSelector();

    act(() => {
      selector.current.updateSelectorPoint('origin', ORIGIN);
    });
    act(() => {
      selector.current.updateSelectorPoint('destination', DESTINATION);
    });
    await flush();

    expect(selector.fitRoute).toHaveBeenCalledTimes(1);
    selector.unmount();
  });

  it('no reencuadra al agregar una parada sobre el mismo origen/destino', async () => {
    planMock.mockResolvedValue(planResponse([ORIGIN, DESTINATION]) as never);
    const selector = mountSelector();

    act(() => {
      selector.current.updateSelectorPoint('origin', ORIGIN);
    });
    act(() => {
      selector.current.updateSelectorPoint('destination', DESTINATION);
    });
    await flush();
    expect(selector.fitRoute).toHaveBeenCalledTimes(1);

    act(() => {
      selector.current.handleSelectorPress({ latitude: 19.45, longitude: -99.15 });
    });
    await flush();

    // El replan corrio de nuevo, pero la camara no se toco.
    expect(planMock.mock.calls.length).toBeGreaterThan(1);
    expect(selector.fitRoute).toHaveBeenCalledTimes(1);
    selector.unmount();
  });

  /**
   * La carrera real: el usuario agrega una parada, empieza a panear mientras la
   * red responde, y la respuesta tardia no debe pisar su encuadre manual.
   */
  it('descarta el fitRoute de una respuesta tardia si el usuario paneo mientras estaba en vuelo', async () => {
    // Ninguna planificacion resuelve sola: quedan en vuelo hasta que el test
    // las libere, que es justo la ventana donde el usuario puede panear.
    const pending: ((value: unknown) => void)[] = [];
    planMock.mockImplementation(
      () => new Promise((resolve) => {
        pending.push(resolve);
      }) as never
    );

    const selector = mountSelector();

    act(() => {
      selector.current.updateSelectorPoint('origin', ORIGIN);
    });
    act(() => {
      selector.current.updateSelectorPoint('destination', DESTINATION);
    });
    await flush();

    // Nada encuadrado todavia: la respuesta sigue en vuelo.
    expect(pending.length).toBeGreaterThan(0);
    expect(selector.fitRoute).not.toHaveBeenCalled();

    // El usuario panea/zoomea MIENTRAS la red responde.
    selector.hasUserMovedMapRef.current = true;

    // Ahora si llegan las respuestas tardias.
    await act(async () => {
      pending.forEach((resolve) => resolve(planResponse([ORIGIN, DESTINATION])));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(selector.fitRoute).not.toHaveBeenCalled();
    selector.unmount();
  });

  it('no roba la camara al agregar una parada si el usuario ya movio el mapa', async () => {
    planMock.mockResolvedValue(planResponse([ORIGIN, DESTINATION]) as never);
    const selector = mountSelector();

    act(() => {
      selector.current.updateSelectorPoint('origin', ORIGIN);
    });
    act(() => {
      selector.current.updateSelectorPoint('destination', DESTINATION);
    });
    await flush();

    selector.focusPoint.mockClear();
    selector.hasUserMovedMapRef.current = true;

    act(() => {
      selector.current.handleSelectorPress({ latitude: 19.45, longitude: -99.15 });
    });
    await flush();

    expect(selector.focusPoint).not.toHaveBeenCalled();
    selector.unmount();
  });
});
