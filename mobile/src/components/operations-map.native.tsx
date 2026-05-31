import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';
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

function getIncidentTone(incident: Incident) {
  if (incident.severity === 'critical' || incident.severity === 'high') {
    return 'danger';
  }

  if (incident.severity === 'medium') {
    return 'warning';
  }

  return 'info';
}

export function OperationsMap({ mapData, userLocation }: OperationsMapProps) {
  const { theme } = useAppTheme();
  if (!mapData) {
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
          <Text style={[styles.title, { color: theme.colors.text }]}>Mapa operativo en tiempo real</Text>
        </View>
        <StatusPill label={`${mapData.routes.length} rutas`} tone="info" />
      </View>

      <View style={[styles.mapFrame, { borderColor: theme.colors.line }]}>
        <MapView
          style={styles.map}
          showsBuildings
          showsCompass
          showsScale
          showsTraffic
          initialRegion={{
            latitude: mapData.center.latitude,
            longitude: mapData.center.longitude,
            latitudeDelta: 0.18,
            longitudeDelta: 0.18,
          }}>
          {mapData.routes.map((route) => (
            <Polyline key={route.id} coordinates={route.polyline} strokeColor={route.color} strokeWidth={4} />
          ))}

          {mapData.vehicles.map((vehicle) => (
            <Marker
              key={vehicle.id}
              coordinate={vehicle.location}
              title={vehicle.code}
              description={`${vehicle.routeName || 'Ruta'} - ${vehicle.driverName || 'Sin chofer'}`}
              pinColor={vehicle.status === 'maintenance' ? theme.colors.danger : theme.colors.accent}
            />
          ))}

          {mapData.incidents.map((incident) => {
            const vehicle = mapData.vehicles.find((entry) => entry.id === incident.vehicleId);

            if (!vehicle) {
              return null;
            }

            return (
              <Marker
                key={incident.id}
                coordinate={vehicle.location}
                title={incident.title}
                description={incident.description}
                pinColor={
                  incident.severity === 'critical' || incident.severity === 'high'
                    ? theme.colors.danger
                    : theme.colors.warning
                }
              />
            );
          })}

          {userLocation ? (
            <Marker coordinate={userLocation} title="Tu ubicacion" pinColor={theme.colors.success} />
          ) : null}
        </MapView>

        <View style={styles.overlayRow}>
          <StatusPill label={`${mapData.vehicles.length} unidades`} tone="info" />
          {userLocation ? <StatusPill label="Tu ubicacion" tone="positive" /> : null}
        </View>
      </View>

      <View style={styles.legendRow}>
        {mapData.incidents[0] ? (
          <StatusPill
            label={mapData.incidents[0].title}
            tone={getIncidentTone(mapData.incidents[0]) as 'danger' | 'warning' | 'info'}
          />
        ) : (
          <StatusPill label="Sin alertas criticas" tone="positive" />
        )}
        <Text style={[styles.description, { color: theme.colors.muted }]}>
          Vista principal para supervision y seguimiento de unidades.
        </Text>
      </View>
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
  mapFrame: {
    borderRadius: AppTheme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: {
    width: '100%',
    height: 420,
  },
  overlayRow: {
    position: 'absolute',
    top: AppTheme.spacing.md,
    left: AppTheme.spacing.md,
    right: AppTheme.spacing.md,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  legendRow: {
    gap: 10,
  },
  description: {
    fontFamily: Typography.body,
    lineHeight: 22,
  },
});
