import { useMemo } from 'react';
import type { GeoPoint, NavigationStop } from '@/src/types/app';

type Props = { color?: string | null; large?: boolean; polyline: GeoPoint[]; stops?: NavigationStop[] };

export function RouteGeometryThumbnail({ color = '#f0445f', large = false, polyline, stops = [] }: Props) {
  const viewParams = useMemo(() => {
    if (polyline.length < 2) return null;
    const lngs = polyline.map((point) => point.longitude);
    const lats = polyline.map((point) => point.latitude);
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
    const lngRange = Math.max(maxLng - minLng, 0.00001);
    const latRange = Math.max(maxLat - minLat, 0.00001);
    const padding = 0.18;
    const padLng = lngRange * padding;
    const padLat = latRange * padding;
    const vpMinLng = minLng - padLng;
    const vpMaxLng = maxLng + padLng;
    const vpMinLat = minLat - padLat;
    const vpMaxLat = maxLat + padLat;
    const project = (point: GeoPoint) => ({
      x: point.longitude,
      y: vpMaxLat + vpMinLat - point.latitude,
    });
    const diagonal = Math.sqrt((vpMaxLng - vpMinLng) ** 2 + (vpMaxLat - vpMinLat) ** 2);
    return {
      diagonal,
      path: polyline.map((point, index) => {
        const p = project(point);
        return `${index ? 'L' : 'M'}${p.x.toFixed(6)},${p.y.toFixed(6)}`;
      }).join(' '),
      project,
      stopPoints: stops.map((stop) => project(stop)),
      viewBox: `${vpMinLng.toFixed(6)} ${vpMinLat.toFixed(6)} ${(vpMaxLng - vpMinLng).toFixed(6)} ${(vpMaxLat - vpMinLat).toFixed(6)}`,
    };
  }, [polyline, stops]);

  return (
    <svg aria-label="Miniatura de la geometría real de la ruta" className="route-geometry-thumbnail" preserveAspectRatio="xMidYMid meet" role="img" style={large ? { height: '100%', minHeight: 360, width: '100%' } : undefined} viewBox={viewParams?.viewBox || '0 0 160 64'}>
      <defs><pattern id="route-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(148,163,184,.12)" strokeWidth=".6" /></pattern></defs>
      <rect width="100%" height="100%" rx="8" fill="#081221" /><rect width="100%" height="100%" rx="8" fill="url(#route-grid)" />
      {viewParams ? <><path d={viewParams.path} fill="none" stroke="rgba(0,0,0,.45)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={(viewParams.diagonal * 0.025).toFixed(6)} /><path d={viewParams.path} fill="none" stroke={color || '#f0445f'} strokeLinecap="round" strokeLinejoin="round" strokeWidth={(viewParams.diagonal * 0.012).toFixed(6)} />
        {viewParams.stopPoints.map((p, i) => <circle key={stops[i]?.id || i} cx={p.x} cy={p.y} fill="#081221" r={(viewParams.diagonal * 0.018).toFixed(6)} stroke={color || '#f0445f'} strokeWidth={(viewParams.diagonal * 0.008).toFixed(6)} />)}
      </> : <text fill="#64748b" fontSize="8" textAnchor="middle" x="80" y="35">Sin geometría</text>}
    </svg>
  );
}
