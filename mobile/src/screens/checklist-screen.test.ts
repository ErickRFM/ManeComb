import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { ChecklistScreen } from '@/src/screens/checklist-screen';
import { useAppStore } from '@/src/store/use-app-store';

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
  useLocalSearchParams: () => ({}),
  usePathname: () => '/checklist',
}));

jest.mock('@/src/api/client', () => {
  const actual = jest.requireActual('@/src/api/client');

  return {
    ...actual,
    assignVehicleRouteRequest: jest.fn(),
    clearAssignedVehicleRouteRequest: jest.fn(),
    getActiveRouteSessionRequest: jest.fn(() => Promise.resolve(null)),
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

jest.mock('@/src/hooks/use-user-location', () => ({
  useUserLocation: () => ({
    backgroundPermission: 'undetermined',
    coordinates: null,
    issue: null,
    lastUpdatedAt: null,
    loading: false,
    permission: 'denied',
    refresh: jest.fn(),
    retryCount: 0,
    servicesEnabled: true,
  }),
}));

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
