import { useEffect, useRef, useState } from 'react';
import { router } from '@/src/navigation/router';
import { planNavigationRouteRequest, reverseNavigationPlaceRequest } from '@/src/api/client';
import type { GeoPoint, NavigationPlaceResult, NavigationPlan, NavigationStop } from '@/src/types/app';
import type { AppMapPadding } from '@/src/components/app-map';
import type { MapSelectorParams, SelectorPointRole, SelectorRole } from '../types';
import {
  buildConfirmSelectionParams,
  createCoordinatePoint,
  createStopFromPoint,
  getSafePlaceLabel,
  getSelectorCopy,
  getSelectorFallback,
  hasDuplicateStop,
  parseOptionalPoint,
  parseStopsParam,
} from '../utils/selector-route';

type UseMapSelectorParams = {
  focusPoint: (location: GeoPoint, zoom?: 'close' | 'vehicle' | 'overview') => void;
  fitRoute: (options: { coordinates: GeoPoint[]; edgePadding: AppMapPadding }) => void;
  params: MapSelectorParams;
  routeFitPadding: AppMapPadding;
  selectorMode: boolean;
};

export function useMapSelector({
  focusPoint,
  fitRoute,
  params,
  routeFitPadding,
  selectorMode,
}: UseMapSelectorParams) {
  const [selectorPoints, setSelectorPoints] = useState<Record<SelectorPointRole, NavigationPlaceResult | null>>(() => ({
    origin: parseOptionalPoint(params, 'origin'),
    destination: parseOptionalPoint(params, 'destination'),
  }));
  const [selectorPlan, setSelectorPlan] = useState<NavigationPlan | null>(null);
  const [selectorStops, setSelectorStops] = useState<NavigationStop[]>(() => parseStopsParam(params.stops));
  const [isPlanningSelectorRoute, setIsPlanningSelectorRoute] = useState(false);
  const [isResolvingPlaceNames, setIsResolvingPlaceNames] = useState(false);
  const reverseControllersRef = useRef<Partial<Record<SelectorPointRole, AbortController>>>({});

  useEffect(() => {
    const controllers = reverseControllersRef.current;

    return () => {
      controllers.origin?.abort();
      controllers.destination?.abort();
    };
  }, []);

  const updateSelectorPoint = (role: SelectorPointRole, location: GeoPoint) => {
    const point = createCoordinatePoint(role, location);

    setSelectorPlan(null);
    setSelectorPoints((current) => ({
      ...current,
      [role]: point,
    }));
    focusPoint(location, 'close');

    reverseControllersRef.current[role]?.abort();
    const controller = new AbortController();
    reverseControllersRef.current[role] = controller;

    reverseNavigationPlaceRequest(location, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setSelectorPoints((current) => {
          const activePoint = current[role];

          if (
            !activePoint ||
            activePoint.location.latitude !== location.latitude ||
            activePoint.location.longitude !== location.longitude
          ) {
            return current;
          }

          const fallback = getSelectorFallback(role);
          const label = getSafePlaceLabel(response.result.label || response.result.address, fallback);
          const address = getSafePlaceLabel(response.result.address || response.result.label, label);

          return {
            ...current,
            [role]: {
              ...response.result,
              label,
              address,
            },
          };
        });
      })
      .catch(() => undefined);
  };

  const handleSelectorPress = (location: GeoPoint) => {
    const role: SelectorRole = !selectorPoints.origin
      ? 'origin'
      : !selectorPoints.destination
        ? 'destination'
        : 'stop';

    if (role === 'stop') {
      const stopOrder = selectorStops.length;
      const point = createCoordinatePoint(role, location, stopOrder);
      const stop = createStopFromPoint(point, selectorStops.length);

      if (hasDuplicateStop(location, selectorPoints.origin, selectorPoints.destination, selectorStops)) {
        return;
      }

      setSelectorPlan(null);
      setSelectorStops((current) => [...current, stop]);
      focusPoint(location, 'close');
      reverseNavigationPlaceRequest(location)
        .then((response) => {
          const label = getSafePlaceLabel(response.result.address || response.result.label, getSelectorFallback('stop', stopOrder));
          setSelectorStops((current) =>
            current.map((entry) => (entry.id === stop.id ? { ...entry, address: label } : entry))
          );
        })
        .catch(() => undefined);
      return;
    }

    updateSelectorPoint(role, location);
  };

  const removeLastSelectorStop = () => {
    setSelectorPlan(null);
    setSelectorStops((current) => current.slice(0, -1));
  };

  const removeSelectorPoint = (role: SelectorPointRole) => {
    reverseControllersRef.current[role]?.abort();
    reverseControllersRef.current[role] = undefined;
    setSelectorPlan(null);
    setSelectorPoints((current) => ({
      ...current,
      [role]: null,
    }));
  };

  const resetSelectorRoute = () => {
    reverseControllersRef.current.origin?.abort();
    reverseControllersRef.current.destination?.abort();
    reverseControllersRef.current = {};
    setSelectorPlan(null);
    setSelectorStops([]);
    setSelectorPoints({
      origin: null,
      destination: null,
    });
  };

  useEffect(() => {
    if (!selectorMode || !selectorPoints.origin || !selectorPoints.destination) {
      setIsPlanningSelectorRoute(false);
      return;
    }

    const controller = new AbortController();
    setSelectorPlan(null);
    setIsPlanningSelectorRoute(true);

    planNavigationRouteRequest(
      {
        origin: selectorPoints.origin.location,
        destination: selectorPoints.destination.location,
        stops: selectorStops,
      },
      { signal: controller.signal }
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setSelectorPlan(response);

        const routeCoordinates = response.routes[0]?.polyline?.length
          ? response.routes[0].polyline
          : [selectorPoints.origin!.location, selectorPoints.destination!.location];

        fitRoute({
          coordinates: routeCoordinates,
          edgePadding: routeFitPadding,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSelectorPlan(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPlanningSelectorRoute(false);
        }
      });

    return () => controller.abort();
  }, [
    fitRoute,
    routeFitPadding,
    selectorMode,
    selectorPoints.destination,
    selectorPoints.origin,
    selectorStops,
  ]);

  const handleConfirmSelection = async () => {
    if (!selectorPoints.origin || !selectorPoints.destination) return;

    setIsResolvingPlaceNames(true);
    let origin = selectorPoints.origin;
    let destination = selectorPoints.destination;

    try {
      const [originResponse, destinationResponse] = await Promise.all([
        reverseNavigationPlaceRequest(origin.location),
        reverseNavigationPlaceRequest(destination.location),
      ]);
      const originLabel = getSafePlaceLabel(
        originResponse.result.label || originResponse.result.address,
        origin.label
      );
      const destinationLabel = getSafePlaceLabel(
        destinationResponse.result.label || destinationResponse.result.address,
        destination.label
      );
      origin = {
        ...originResponse.result,
        label: originLabel,
        address: getSafePlaceLabel(originResponse.result.address || originLabel, originLabel),
      };
      destination = {
        ...destinationResponse.result,
        label: destinationLabel,
        address: getSafePlaceLabel(destinationResponse.result.address || destinationLabel, destinationLabel),
      };
      setSelectorPoints({ origin, destination });
    } catch {
      setIsResolvingPlaceNames(false);
      return;
    }

    const paramsToSet = buildConfirmSelectionParams(
      params,
      origin,
      destination,
      selectorStops,
      selectorPlan
    );

    setIsResolvingPlaceNames(false);
    router.replace({ pathname: params.returnTo || '/checklist', params: paramsToSet });
  };

  return {
    copy: getSelectorCopy(Boolean(selectorPoints.origin), Boolean(selectorPoints.destination), selectorStops.length),
    handleConfirmSelection,
    handleSelectorPress,
    isPlanningSelectorRoute: isPlanningSelectorRoute || isResolvingPlaceNames,
    removeLastSelectorStop,
    removeSelectorPoint,
    resetSelectorRoute,
    selectorPlan,
    selectorPoints,
    selectorRoute: selectorPlan?.routes[0] || null,
    selectorStops,
    setSelectorPlan,
    updateSelectorPoint,
  };
}
