import { useCallback, useMemo, useRef } from 'react';
import type { AppMapRef } from '@/src/components/app-map';
import type { GeoPoint } from '@/src/types/app';
import type { FitRouteOptions, MapFocusZoom } from '../types';

export function useMapCamera(insets: { top: number; bottom: number }) {
  const mapRef = useRef<AppMapRef | null>(null);
  const mapPadding = useMemo(
    () => ({
      top: insets.top + 110,
      right: 72,
      bottom: insets.bottom + 210,
      left: 12,
    }),
    [insets.bottom, insets.top]
  );

  const routeFitPadding = useMemo(
    () => ({
      top: insets.top + 120,
      right: 86,
      bottom: insets.bottom + 230,
      left: 24,
    }),
    [insets.bottom, insets.top]
  );

  const focusMap = useCallback((latitude: number, longitude: number, zoom: MapFocusZoom = 'vehicle') => {
    const latitudeDelta = zoom === 'close' ? 0.015 : zoom === 'overview' ? 0.08 : 0.03;
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta,
      longitudeDelta: latitudeDelta,
    }, 400);
  }, []);

  const fitRoute = useCallback(({ coordinates, edgePadding }: FitRouteOptions) => {
    mapRef.current?.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding,
    });
  }, []);

  const focusPoint = useCallback((point: GeoPoint, zoom: MapFocusZoom = 'vehicle') => {
    focusMap(point.latitude, point.longitude, zoom);
  }, [focusMap]);

  return {
    fitRoute,
    focusMap,
    focusPoint,
    mapPadding,
    mapRef,
    routeFitPadding,
  };
}
