import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { ChecklistScreen, buildOperationalRecord, createStyles, getActiveLog, getLatestLog } from '@/src/screens/checklist-screen';
import { useAppStore } from '@/src/store/use-app-store';

jest.mock('react-native-gesture-handler', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  return {
    PanGestureHandler: ({ children }: { children: React.ReactNode }) =>
      ReactMock.createElement(View, null, children),
    State: { ACTIVE: 4 },
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() =>
      Promise.resolve({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      })
    ),
  },
}));

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    MANECOMB_API_URL: 'https://manecomb.onrender.com/api',
    MANECOMB_SOCKET_URL: 'https://manecomb.onrender.com',
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactMock = require('react');

  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => ReactMock.createElement(ReactMock.Fragment, null, children),
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => ReactMock.createElement(ReactMock.Fragment, null, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});

jest.mock('@/src/navigation/router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  Redirect: () => null,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/checklist',
}));

jest.mock('@/src/api/client', () => {
  const actual = jest.requireActual('@/src/api/client');

  return {
    ...actual,
    assignVehicleRouteRequest: jest.fn(),
    getActiveRouteSessionRequest: jest.fn(() => Promise.resolve(null)),
    getRouteSessionHistoryRequest: jest.fn(() => Promise.resolve([])),
    startRouteSessionRequest: jest.fn(),
    updateRouteSessionStatusRequest: jest.fn(),
    getNavigationTripLogsRequest: jest.fn(() => Promise.resolve({ logs: [] })),
  };
});

jest.mock('@/src/native/vector-icons', () => {
  const ReactMock = require('react');
  const { Text } = require('react-native');

  return {
    MaterialCommunityIcons: ({ name }: { name: string }) => ReactMock.createElement(Text, null, name),
  };
});

jest.mock('@/src/components/app-map', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  return {
    AppMap: ReactMock.forwardRef(({ children }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactMock.useImperativeHandle(ref, () => ({
        animateToRegion: jest.fn(),
        fitToCoordinates: jest.fn(),
      }));
      return ReactMock.createElement(View, null, children);
    }),
    AppMapMarker: ({ children }: { children?: React.ReactNode }) => ReactMock.createElement(View, null, children),
    AppMapPolyline: () => ReactMock.createElement(View),
  };
});

describe('ChecklistScreen', () => {
  afterEach(() => {
    useAppStore.setState({
      mapData: null,
      activeRouteSession: null,
      themeMode: 'light',
      user: null,
    });
  });

  it('selects the newest active log by operational timestamp', () => {
    const logs = [
      { id: 'older', vehicleId: 'v-1', vehicleCode: 'C-1', departureAt: '2026-07-15T10:00:00.000Z', status: 'active' as const },
      { id: 'newer', vehicleId: 'v-1', vehicleCode: 'C-1', departureAt: '2026-07-15T12:00:00.000Z', status: 'delayed' as const },
      { id: 'finished', vehicleId: 'v-1', vehicleCode: 'C-1', departureAt: '2026-07-15T13:00:00.000Z', arrivalAt: '2026-07-15T14:00:00.000Z', status: 'completed' as const },
      { id: 'cancelled', vehicleId: 'v-1', vehicleCode: 'C-1', departureAt: '2026-07-15T15:00:00.000Z', arrivalAt: '2026-07-15T15:10:00.000Z', status: 'cancelled' as const },
    ];

    expect(getActiveLog(logs, 'v-1')?.id).toBe('newer');
    expect(getLatestLog(logs, 'v-1')?.id).toBe('cancelled');
  });

  // Regresion del defecto observado el 2026-07-18: en "Registros operativos"
  // C-1 y C-3 aparecian sin nombre mientras C-2 si se leia, porque la pantalla
  // construia la identidad en tres lugares y el camino de historial no tenia
  // respaldo cuando el vehiculo carecia de `code`.
  it('toma la identidad, el conductor y el ETA del snapshot canonico', () => {
    const unit: OperationalUnitSnapshot = {
      snapshotVersion: 2,
      unitId: 'v-1',
      plates: 'FBZ-404',
      label: 'C-1',
      status: 'active',
      operationalState: 'on_route',
      gps: {
        lat: 19.3139, lng: -98.2404, speedKmh: 42, heading: 90,
        recordedAt: '2026-07-18T10:08:00.000Z', receivedAt: '2026-07-18T10:08:01.000Z',
        freshness: 'fresh', connectionState: 'live', ageSeconds: 12,
      },
      driver: { id: 'u-1', name: 'Erik', source: 'session' },
      route: {
        id: 'rt-1', name: 'Santa Ana', startedAt: '2026-07-18T09:38:00.000Z',
        progressRatio: 0.4, remainingTimeSeconds: 540,
        etaAt: '2026-07-18T10:17:00.000Z', deviationMeters: 12, currentCheckpoint: '1/4',
      },
      session: { id: 's-1', startedAt: '2026-07-18T09:38:00.000Z', elapsedSeconds: 1800 },
      journey: null,
      incidents: { open: 0, inProgress: 0, lastAt: null },
      lastEventAt: '2026-07-18T10:08:00.000Z',
      visibility: 'visible',
    };

    // El vehiculo llega sin `code` ni `driverName`: es el caso que producia la
    // fila en blanco. El registro debe seguir teniendo identidad.
    const vehicle = { id: 'v-1', code: '', delayMinutes: 0 } as never;
    const record = buildOperationalRecord(unit, vehicle, []);

    expect(record.vehicleCode).toBe('C-1');
    expect(record.driverName).toBe('Erik');
    expect(record.routeName).toBe('Santa Ana');
    expect(record.etaAt).toBe('2026-07-18T10:17:00.000Z');
    expect(record.status).toBe('active');
  });

  it('no inventa ruta ni conductor cuando la unidad no los tiene', () => {
    // Caso C-2: unidad recien dada de alta.
    const unit: OperationalUnitSnapshot = {
      snapshotVersion: 2,
      unitId: 'v-2', plates: 'GHT-771', label: 'C-2',
      status: 'idle', operationalState: 'no_route',
      gps: { lat: null, lng: null, speedKmh: null, heading: null, recordedAt: null, receivedAt: null,
        freshness: 'missing', connectionState: 'lost', ageSeconds: null },
      driver: null, route: null, session: null, journey: null,
      incidents: { open: 0, inProgress: 0, lastAt: null },
      lastEventAt: null, visibility: 'visible',
    };

    const record = buildOperationalRecord(unit, { id: 'v-2', code: 'C-2', delayMinutes: 0, status: 'available' } as never, []);

    expect(record.vehicleCode).toBe('C-2');
    expect(record.driverName).toBe('Sin conductor asignado');
    expect(record.routeName).toBe('Sin ruta asignada');
    // Nunca `salida + minutos`: sin ETA del backend, no hay ETA.
    expect(record.etaAt).toBeNull();
  });

  // Regresion del defecto observado el 2026-07-18: las filas con dos pastillas
  // ("Disponible" + "Ultima ruta: Finalizado") perdian el nombre de la unidad.
  // El bloque de pastillas no acotaba su ancho, absorbia la fila completa y
  // `recordCopy` —con minWidth: 0— se comprimia hasta cero.
  it('acota el ancho de las pastillas para que la identidad nunca se comprima a cero', () => {
    const { theme } = require('@/constants/theme');
    const styles = createStyles(
      (theme || { colors: {}, mode: 'light' }) as never,
      false,
      true
    );

    // El techo de ancho debe dejar de verdad mas de la mitad de la fila a la
    // identidad. Un `maxWidth: '100%'` cumpliria "esta definido" y reintroduciria
    // el bug, asi que se verifica el valor.
    expect(styles.recordPills).toBeDefined();
    const maxWidth = styles.recordPills.maxWidth as string;
    expect(typeof maxWidth).toBe('string');
    expect(maxWidth.endsWith('%')).toBe(true);
    expect(Number.parseFloat(maxWidth)).toBeLessThanOrEqual(60);

    // Y debe poder envolver antes que aplastar el texto.
    expect(styles.recordPills.flexWrap).toBe('wrap');

    // La identidad debe conservar un piso de ancho mayor que el icono (44px).
    expect(styles.recordLead.minWidth).toBeGreaterThan(44);
  });

  it('renders when an old assignedRoute snapshot has no route payload', () => {
    useAppStore.setState({
      mapData: {
        alerts: [],
        center: { latitude: 19.4326, longitude: -99.1332 },
        incidents: [],
        routes: [],
        vehicles: [
          {
            assignedRoute: {
              assignedAt: '2026-07-07T20:00:00.000Z',
              assignedBy: 'dispatcher-1',
              destination: { latitude: 19.45, longitude: -99.12 },
              destinationLabel: 'Destino',
              origin: { latitude: 19.43, longitude: -99.13 },
              originLabel: 'Origen',
              provider: 'mapbox',
              stops: [],
            },
            code: 'C-1',
            delayMinutes: 0,
            driverName: 'Pepe',
            id: 'vehicle-legacy-route',
            location: { latitude: 19.4326, longitude: -99.1332 },
            routeCode: 'R-12',
            routeName: 'R-12',
            speed: 0,
            status: 'available',
            updatedAt: '2026-07-07T20:00:00.000Z',
          },
        ],
      },
      themeMode: 'light',
      user: {
        accountType: 'operations',
        email: 'driver@manecomb.test',
        id: 'driver-1',
        name: 'Driver',
        role: 'driver',
        vehicleId: 'vehicle-legacy-route',
      },
    } as never);

    let renderer: TestRenderer.ReactTestRenderer | null = null;

    expect(() => {
      act(() => {
        renderer = TestRenderer.create(React.createElement(ChecklistScreen));
      });
    }).not.toThrow();

    act(() => {
      renderer?.unmount();
    });
  });
});
