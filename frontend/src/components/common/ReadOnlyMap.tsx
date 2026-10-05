import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface ReadOnlyMapProps {
  lat: number;
  lng: number;
  zoom?: number;
}

export const ReadOnlyMap: React.FC<ReadOnlyMapProps> = ({ lat, lng, zoom = 14 }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  useEffect(() => {
    if (!token || !mapContainer.current || map.current) return;

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: zoom,
      interactive: false // Read-only
    });

    new mapboxgl.Marker({ color: '#4f46e5' })
      .setLngLat([lng, lat])
      .addTo(map.current);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [lat, lng, zoom, token]);

  if (!token) {
    return <div className="p-4 text-center text-red-500 bg-red-50 rounded-xl">Mapbox token missing</div>;
  }

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-inner border border-gray-200">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};
