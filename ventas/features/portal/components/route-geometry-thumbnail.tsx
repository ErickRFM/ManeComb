import { useMemo } from 'react';
import type { GeoPoint, NavigationStop } from '@/src/types/app';

type Props = { color?: string | null; large?: boolean; polyline: GeoPoint[]; stops?: NavigationStop[] };

export function RouteGeometryThumbnail({ color = '#f0445f', large = false, polyline, stops = [] }: Props) {
  const geometry = useMemo(() => {
    if (polyline.length < 2) return null;
    const lngs = polyline.map((point) => point.longitude);
    const lats = polyline.map((point) => point.latitude);
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
    const width = Math.max(maxLng - minLng, 0.00001);
    const height = Math.max(maxLat - minLat, 0.00001);
    const project = (point: GeoPoint) => ({
      x: 8 + ((point.longitude - minLng) / width) * 144,
      y: 56 - ((point.latitude - minLat) / height) * 48,
    });
    return { path: polyline.map((point, index) => { const p = project(point); return `${index ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' '), project };
  }, [polyline]);

  return (
    <svg aria-label="Miniatura de la geometría real de la ruta" className="route-geometry-thumbnail" role="img" style={large ? { height: '100%', minHeight: 360, width: '100%' } : undefined} viewBox="0 0 160 64">
      <defs><pattern id="route-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(148,163,184,.12)" strokeWidth=".6" /></pattern></defs>
      <rect width="160" height="64" rx="8" fill="#081221" /><rect width="160" height="64" rx="8" fill="url(#route-grid)" />
      {geometry ? <><path d={geometry.path} fill="none" stroke="rgba(0,0,0,.45)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" /><path d={geometry.path} fill="none" stroke={color || '#f0445f'} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
        {stops.map((stop) => { const p = geometry.project(stop); return <circle key={stop.id} cx={p.x} cy={p.y} fill="#081221" r="2.8" stroke={color || '#f0445f'} strokeWidth="1.5" />; })}
      </> : <text fill="#64748b" fontSize="8" textAnchor="middle" x="80" y="35">Sin geometría</text>}
    </svg>
  );
}
