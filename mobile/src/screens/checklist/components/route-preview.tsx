import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppMap, AppMapMarker, AppMapPolyline, type AppMapRef } from '@/src/components/app-map';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import type { GeoPoint, NavigationRouteOption } from '@/src/types/app';
import { MANECOMB_ROUTE_COLOR, type buildRouteStops } from '../checklist.utils';
import { createStyles } from '../checklist-screen.styles';

export function RoutePreview({
  onPress,
  points,
  route,
  vehicleLocation,
}: {
  onPress?: () => void;
  points: ReturnType<typeof buildRouteStops>;
  route: NavigationRouteOption | null;
  vehicleLocation: (GeoPoint & { heading?: number | null }) | null;
}) {
  const { theme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(theme, false, false), [theme]);
  const mapRef = useRef<AppMapRef>(null);
  const routeFade = useRef(new Animated.Value(0)).current;
  const lastFitSignatureRef = useRef<string | null>(null);
  const sourcePoints = useMemo(
    () =>
      route?.polyline?.length
        ? route.polyline
        : points.map((point) => point.location),
    [points, route]
  );
  const fallbackPoint = useMemo(
    () =>
      vehicleLocation || points[0]?.location || {
        latitude: 19.4326,
        longitude: -99.1332,
      },
    [points, vehicleLocation]
  );
  const fitPoints = useMemo(
    () => (sourcePoints.length ? sourcePoints : [fallbackPoint]),
    [fallbackPoint, sourcePoints]
  );
  const fitSignature = useMemo(
    () =>
      sourcePoints.length
        ? sourcePoints
            .map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`)
            .join('|')
        : 'initial-fallback',
    [sourcePoints]
  );
  const initialRegion = useMemo(
    () => ({
      ...fallbackPoint,
      latitudeDelta: sourcePoints.length ? 0.04 : 0.025,
      longitudeDelta: sourcePoints.length ? 0.04 : 0.025,
    }),
    [fallbackPoint, sourcePoints.length]
  );

  useEffect(() => {
    if (!fitPoints.length || lastFitSignatureRef.current === fitSignature) {
      return undefined;
    }

    const isFirstFit = lastFitSignatureRef.current === null;
    lastFitSignatureRef.current = fitSignature;
    routeFade.stopAnimation();

    if (reducedMotion) {
      routeFade.setValue(1);
    } else {
      routeFade.setValue(0);
      Animated.timing(routeFade, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }

    const frame = requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(fitPoints, {
        animated: !reducedMotion && !isFirstFit,
        edgePadding: { top: 48, right: 38, bottom: 50, left: 38 },
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      routeFade.stopAnimation();
    };
  }, [fitPoints, fitSignature, reducedMotion, routeFade]);

  const vehicleHeadingStyle = useMemo(
    () => ({
      transform: [{ rotate: `${vehicleLocation?.heading || 0}deg` }],
    }),
    [vehicleLocation?.heading]
  );

  return (
    <View style={styles.routePreview}>
      <AppMap
        ref={mapRef}
        compassEnabled={false}
        initialRegion={initialRegion}
        onPress={() => onPress?.()}
        scaleEnabled={false}
        style={StyleSheet.absoluteFill}
        themeMode={theme.mode}>
        {sourcePoints.length >= 2 ? (
          <>
            <AppMapPolyline
              id="route-preview-base"
              coordinates={sourcePoints}
              lineBlur={1.2}
              strokeColor={theme.mode === 'light' ? 'rgba(15,23,42,0.34)' : 'rgba(255,255,255,0.42)'}
              strokeOpacity={1}
              strokeWidth={8}
            />
            <AppMapPolyline
              id="route-preview-main"
              coordinates={sourcePoints}
              strokeColor={MANECOMB_ROUTE_COLOR}
              strokeOpacity={0.96}
              strokeWidth={4}
            />
          </>
        ) : null}
        {points.map((point, index) => {
          const isDestination = point.type === 'destination';
          const isOrigin = point.type === 'origin';
          const stopNumber = Math.max(1, index);

          return (
            <AppMapMarker key={point.id} id={`preview-${point.id}`} coordinate={point.location}>
              <Animated.View
                style={[
                  styles.miniMapMarkerShell,
                  { opacity: routeFade },
                  isOrigin ? styles.miniMapMarkerShellOrigin : undefined,
                  isDestination ? styles.miniMapMarkerShellDestination : undefined,
                ]}>
                <View
                  style={[
                    styles.miniMapMarker,
                    isOrigin ? styles.miniMapMarkerOrigin : undefined,
                    isDestination ? styles.miniMapMarkerDestination : undefined,
                  ]}>
                  {isOrigin ? (
                    <MaterialCommunityIcons name="record-circle-outline" size={16} color="#FFFFFF" />
                  ) : isDestination ? (
                    <MaterialCommunityIcons name="flag-checkered" size={15} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.miniMapMarkerText}>{stopNumber}</Text>
                  )}
                </View>
              </Animated.View>
            </AppMapMarker>
          );
        })}
        {vehicleLocation ? (
          <AppMapMarker id="preview-vehicle" coordinate={vehicleLocation}>
            <View style={styles.miniMapVehicleWrap}>
              <View style={styles.miniMapAccuracyHalo} />
              <View style={styles.miniMapVehicleMarker}>
                <View style={[styles.miniMapVehicleHeading, vehicleHeadingStyle]}>
                  <MaterialCommunityIcons name="navigation" size={18} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </AppMapMarker>
        ) : null}
      </AppMap>
      {!points.length ? (
        <Pressable style={styles.routePreviewEmpty} onPress={onPress}>
          <MaterialCommunityIcons name="map-search-outline" size={28} color={theme.colors.muted} />
          <Text style={styles.routePreviewEmptyTitle}>Selecciona origen y destino</Text>
          <Text style={styles.routePreviewEmptyText}>Toca el mapa para elegir o buscar un punto.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
