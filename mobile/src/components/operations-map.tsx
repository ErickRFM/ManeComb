import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline as SvgPolyline, Text as SvgText } from 'react-native-svg';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { Incident, LiveLocationsData } from '@/src/types/app';

type OperationsMapProps = {
  mapData: LiveLocationsData | null;
  userLocation?: {
    latitude: number;
    longitude: number;
  } | null;
};

type ProjectedIncident = Incident & {
  point: {
    x: number;
    y: number;
  };
};

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 420;
const CANVAS_PADDING = 48;

export function OperationsMap({ mapData, userLocation }: OperationsMapProps) {
  const { theme } = useAppTheme();
  const projectedMap = useMemo(() => {
    if (!mapData) {
      return null;
    }

    const allPoints = [
      mapData.center,
      ...mapData.routes.flatMap((route) => route.polyline),
      ...mapData.vehicles.map((vehicle) => vehicle.location),
      ...(userLocation ? [userLocation] : []),
    ];

    const latitudes = allPoints.map((point) => point.latitude);
    const longitudes = allPoints.map((point) => point.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const project = (latitude: number, longitude: number) => {
      const latSpan = maxLat - minLat || 0.01;
      const lngSpan = maxLng - minLng || 0.01;

      const x =
        CANVAS_PADDING +
        ((longitude - minLng) / lngSpan) * (CANVAS_WIDTH - CANVAS_PADDING * 2);
      const y =
        CANVAS_PADDING +
        (1 - (latitude - minLat) / latSpan) * (CANVAS_HEIGHT - CANVAS_PADDING * 2);

      return { x, y };
    };

    const incidents: ProjectedIncident[] = mapData.incidents.flatMap((incident) => {
      const vehicle = mapData.vehicles.find((entry) => entry.id === incident.vehicleId);

      if (!vehicle) {
        return [];
      }

      return [
        {
          ...incident,
          point: project(vehicle.location.latitude, vehicle.location.longitude),
        },
      ];
    });

    return {
      routes: mapData.routes.map((route) => ({
        ...route,
        points: route.polyline.map((point) => project(point.latitude, point.longitude)),
      })),
      vehicles: mapData.vehicles.map((vehicle) => ({
        ...vehicle,
        point: project(vehicle.location.latitude, vehicle.location.longitude),
      })),
      incidents,
      user: userLocation ? project(userLocation.latitude, userLocation.longitude) : null,
    };
  }, [mapData, userLocation]);

  if (!mapData || !projectedMap) {
    return (
      <AppCard>
        <Text style={[styles.title, { color: theme.colors.text }]}>Mapa operativo</Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>Esperando sincronizacion de unidades...</Text>
      </AppCard>
    );
  }

  return (
    <AppCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.kicker, { color: theme.colors.accent }]}>Cobertura</Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>Mapa operativo</Text>
        </View>
        <StatusPill label={`${mapData.routes.length} rutas`} tone="info" />
      </View>

      <View
        style={[
          styles.mapCanvas,
          {
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.mapBackground,
          },
        ]}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}>
          {[0.2, 0.4, 0.6, 0.8].map((value) => (
            <Line
              key={`grid-h-${value}`}
              x1={0}
              y1={CANVAS_HEIGHT * value}
              x2={CANVAS_WIDTH}
              y2={CANVAS_HEIGHT * value}
              stroke={theme.mode === 'light' ? '#E6DED3' : 'rgba(142, 165, 188, 0.08)'}
              strokeWidth={1}
            />
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((value) => (
            <Line
              key={`grid-v-${value}`}
              x1={CANVAS_WIDTH * value}
              y1={0}
              x2={CANVAS_WIDTH * value}
              y2={CANVAS_HEIGHT}
              stroke={theme.mode === 'light' ? '#E6DED3' : 'rgba(142, 165, 188, 0.08)'}
              strokeWidth={1}
            />
          ))}

          {projectedMap.routes.map((route) => (
            <SvgPolyline
              key={route.id}
              points={route.points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={route.color}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {projectedMap.vehicles.map((vehicle) => (
            <Circle
              key={`vehicle-${vehicle.id}`}
              cx={vehicle.point.x}
              cy={vehicle.point.y}
              r={9}
              fill={vehicle.status === 'maintenance' ? theme.colors.danger : theme.colors.accent}
              stroke={theme.mode === 'light' ? '#FFFFFF' : '#F4F6FA'}
              strokeWidth={3}
            />
          ))}

          {projectedMap.incidents.map((incident) => (
            <Circle
              key={`incident-${incident.id}`}
              cx={incident.point.x}
              cy={incident.point.y}
              r={15}
              fill="none"
              stroke={theme.colors.warning}
              strokeWidth={4}
              opacity={0.9}
            />
          ))}

          {projectedMap.user ? (
            <Circle
              cx={projectedMap.user.x}
              cy={projectedMap.user.y}
              r={11}
              fill={theme.colors.success}
              stroke={theme.mode === 'light' ? '#FFFFFF' : '#F4F6FA'}
              strokeWidth={3}
            />
          ) : null}

          {projectedMap.vehicles.slice(0, 3).map((vehicle) => (
            <SvgText
              key={`label-${vehicle.id}`}
              x={vehicle.point.x + 12}
              y={vehicle.point.y - 12}
              fill={theme.mode === 'light' ? '#1B1C20' : '#EAF2F9'}
              fontSize="18"
              fontWeight="700">
              {vehicle.code}
            </SvgText>
          ))}
        </Svg>
      </View>

      <View style={styles.legendRow}>
        <StatusPill label={`${mapData.vehicles.length} unidades`} tone="info" />
        <StatusPill label={`${mapData.incidents.length} alertas`} tone="warning" />
        {userLocation ? <StatusPill label="Tu ubicacion" tone="positive" /> : null}
      </View>

      {userLocation ? (
        <Text style={[styles.userLocation, { color: theme.colors.muted }]}>
          Tu GPS: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
        </Text>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  kicker: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 24,
  },
  caption: {
    fontFamily: Typography.body,
    lineHeight: 22,
  },
  mapCanvas: {
    minHeight: 380,
    borderRadius: AppTheme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  userLocation: {
    fontFamily: Typography.mono,
    fontSize: 12,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
