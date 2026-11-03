import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '@/integrations/local/client';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OPEN_STREET_MAP_STYLE } from '@/lib/openMap';

interface LocationHistoryEntry {
  id: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  recorded_at: string;
}

interface LocationHistoryMapProps {
  userId: string;
  userName: string;
}

const LocationHistoryMap: React.FC<LocationHistoryMapProps> = ({ userId, userName }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<LocationHistoryEntry[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('user_location_history')
          .select('id, latitude, longitude, city, region, recorded_at')
          .eq('user_id', userId)
          .order('recorded_at', { ascending: true })
          .limit(100);

        if (fetchError) throw fetchError;
        setHistory(data || []);
      } catch (err) {
        console.error('Error fetching history:', err);
        setError('Erro ao carregar histórico');
      }
    };

    fetchHistory();
  }, [userId]);

  useEffect(() => {
    if (!mapContainer.current || history.length === 0) {
      if (history.length === 0 && !loading) {
        setLoading(false);
      }
      return;
    }

    const initMap = async () => {
      try {
        // Filter valid locations
        const validLocations = history.filter(
          loc => loc.latitude != null && loc.longitude != null
        );

        if (validLocations.length === 0) {
          setError('Nenhuma localização válida encontrada');
          setLoading(false);
          return;
        }

        // Calculate bounds
        const lats = validLocations.map(l => l.latitude!);
        const lngs = validLocations.map(l => l.longitude!);
        const center: [number, number] = [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2,
        ];

        map.current = new maplibregl.Map({
          container: mapContainer.current!,
          style: OPEN_STREET_MAP_STYLE as any,
          center,
          zoom: 10,
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.current.on('load', () => {
          if (!map.current) return;

          // Create GeoJSON line
          const coordinates = validLocations.map(loc => [loc.longitude!, loc.latitude!]);

          // Add route line
          map.current.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates,
              },
            },
          });

          map.current.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#667eea',
              'line-width': 4,
              'line-opacity': 0.8,
            },
          });

          // Add animated dashed line
          map.current.addLayer({
            id: 'route-line-dashed',
            type: 'line',
            source: 'route',
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': '#ffffff',
              'line-width': 2,
              'line-dasharray': [2, 4],
            },
          });

          // Add markers for each point
          validLocations.forEach((loc, index) => {
            const isFirst = index === 0;
            const isLast = index === validLocations.length - 1;

            const el = document.createElement('div');
            el.innerHTML = `
              <div style="
                width: ${isFirst || isLast ? '24px' : '16px'};
                height: ${isFirst || isLast ? '24px' : '16px'};
                background: ${isFirst ? '#22c55e' : isLast ? '#ef4444' : '#667eea'};
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
              ">
                ${isFirst ? '<span style="color:white;font-size:10px;font-weight:bold;">1</span>' : ''}
                ${isLast ? '<span style="color:white;font-size:10px;font-weight:bold;">F</span>' : ''}
              </div>
            `;

            const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
              <div style="padding: 8px; min-width: 150px;">
                <strong style="font-size: 12px; color: ${isFirst ? '#22c55e' : isLast ? '#ef4444' : '#667eea'}">
                  ${isFirst ? '📍 Início' : isLast ? '🏁 Último registro' : `Ponto ${index + 1}`}
                </strong>
                <p style="margin: 4px 0 0 0; font-size: 12px;">
                  ${loc.city || 'Cidade desconhecida'}${loc.region ? `, ${loc.region}` : ''}
                </p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #666;">
                  ${format(new Date(loc.recorded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            `);

            new maplibregl.Marker(el)
              .setLngLat([loc.longitude!, loc.latitude!])
              .setPopup(popup)
              .addTo(map.current!);
          });

          // Fit bounds
          if (validLocations.length > 1) {
            const bounds = new maplibregl.LngLatBounds();
            validLocations.forEach(loc => {
              bounds.extend([loc.longitude!, loc.latitude!]);
            });
            map.current.fitBounds(bounds, { padding: 50 });
          }

          setLoading(false);
        });
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Erro ao carregar o mapa');
        setLoading(false);
      }
    };

    initMap();

    return () => {
      map.current?.remove();
    };
  }, [history]);

  if (error) {
    return (
      <div className="w-full h-[400px] rounded-lg bg-muted flex items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (history.length === 0 && !loading) {
    return (
      <div className="w-full h-[400px] rounded-lg bg-muted flex flex-col items-center justify-center">
        <p className="text-muted-foreground">Nenhum histórico de movimentação para {userName}</p>
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
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 shadow-lg z-10">
        <p className="text-xs font-medium mb-2">Legenda</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white"></div>
            <span>Início do trajeto</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white"></div>
            <span>Último registro</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full bg-primary border-2 border-white"></div>
            <span>Pontos intermediários</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationHistoryMap;