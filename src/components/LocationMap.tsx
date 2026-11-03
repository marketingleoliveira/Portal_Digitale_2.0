import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2 } from 'lucide-react';
import { OPEN_STREET_MAP_STYLE } from '@/lib/openMap';

interface UserLocation {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  last_updated: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface LocationMapProps {
  locations: UserLocation[];
  isUserOnline?: (userId: string) => boolean;
}

const LocationMap: React.FC<LocationMapProps> = ({ locations, isUserOnline }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initMap = async () => {
      if (!mapContainer.current) return;

      try {
        // Filter locations with valid coordinates
        const validLocations = locations.filter(
          loc => loc.latitude != null && loc.longitude != null
        );

        // Calculate center based on locations or default to Brazil
        let center: [number, number] = [-47.9292, -15.7801]; // Brasília
        let zoom = 4;

        if (validLocations.length > 0) {
          const lats = validLocations.map(l => l.latitude!);
          const lngs = validLocations.map(l => l.longitude!);
          center = [
            (Math.min(...lngs) + Math.max(...lngs)) / 2,
            (Math.min(...lats) + Math.max(...lats)) / 2,
          ];
          
          if (validLocations.length === 1) {
            zoom = 10;
          }
        }

        map.current = new maplibregl.Map({
          container: mapContainer.current,
          style: OPEN_STREET_MAP_STYLE as any,
          center,
          zoom,
        });

        map.current.addControl(
          new maplibregl.NavigationControl({
            visualizePitch: true,
          }),
          'top-right'
        );

        map.current.on('load', () => {
          setLoading(false);
          addMarkers(validLocations);
        });

      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Erro ao carregar o mapa');
        setLoading(false);
      }
    };

    initMap();

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.current?.remove();
    };
  }, []);

  const addMarkers = (validLocations: UserLocation[]) => {
    if (!map.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    validLocations.forEach(location => {
      if (location.latitude == null || location.longitude == null) return;

      // Check if user is online
      const online = isUserOnline ? isUserOnline(location.user_id) : false;

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'custom-marker';
      el.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          background: ${online 
            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' 
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s;
          position: relative;
        ">
          ${location.profile?.avatar_url 
            ? `<img src="${location.profile.avatar_url}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover;" />`
            : `<span style="color: white; font-weight: bold; font-size: 14px;">${location.profile?.full_name?.charAt(0) || '?'}</span>`
          }
          ${online ? `<span style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 12px;
            height: 12px;
            background: #22c55e;
            border: 2px solid white;
            border-radius: 50%;
          "></span>` : ''}
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        el.querySelector('div')!.style.transform = 'scale(1.2)';
      });
      el.addEventListener('mouseleave', () => {
        el.querySelector('div')!.style.transform = 'scale(1)';
      });

      // Create popup
      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px; min-width: 150px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <strong style="font-size: 14px;">${location.profile?.full_name || 'Desconhecido'}</strong>
            ${online 
              ? '<span style="background: #22c55e; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px;">Online</span>'
              : '<span style="background: #9ca3af; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px;">Offline</span>'
            }
          </div>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">
            📍 ${location.city || 'Cidade desconhecida'}${location.region ? `, ${location.region}` : ''}
          </p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">
            Atualizado: ${new Date(location.last_updated).toLocaleString('pt-BR')}
          </p>
        </div>
      `);

      const marker = new maplibregl.Marker(el)
        .setLngLat([location.longitude, location.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

    // Fit bounds if multiple locations
    if (validLocations.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      validLocations.forEach(loc => {
        if (loc.latitude != null && loc.longitude != null) {
          bounds.extend([loc.longitude, loc.latitude]);
        }
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  };

  // Update markers when locations change
  useEffect(() => {
    if (map.current && !loading) {
      const validLocations = locations.filter(
        loc => loc.latitude != null && loc.longitude != null
      );
      addMarkers(validLocations);
    }
  }, [locations, loading]);

  if (error) {
    return (
      <div className="w-full h-[400px] rounded-lg bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] rounded-lg overflow-hidden border">
      {loading && (
        <div className="absolute inset-0 z-10 bg-background/80 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
};

export default LocationMap;