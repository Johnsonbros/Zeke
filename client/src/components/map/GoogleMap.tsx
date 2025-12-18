import { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback } from 'react';
import { 
  MapComponentProps, 
  MapRef, 
  MapPosition, 
  MapBounds,
  MarkerConfig,
  CircleConfig,
  PolylineConfig
} from './types';
import { useMapConfig } from './MapProvider';

let googleMapsLoaded = false;
let googleMapsLoadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (googleMapsLoaded) {
    return Promise.resolve();
  }
  
  if (googleMapsLoadPromise) {
    return googleMapsLoadPromise;
  }
  
  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      googleMapsLoaded = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
  });
  
  return googleMapsLoadPromise;
}

export const GoogleMap = forwardRef<MapRef, MapComponentProps>(function GoogleMap(
  {
    center,
    zoom,
    markers = [],
    circles = [],
    polylines = [],
    onMapClick,
    onBoundsChange,
    className,
    style,
    children,
  },
  ref
) {
  const config = useMapConfig();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const circlesRef = useRef<Map<string, google.maps.Circle>>(new Map());
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mapCenter = center || config.defaultCenter;
  const mapZoom = zoom ?? config.defaultZoom;
  
  useEffect(() => {
    if (!config.googleApiKey) {
      setError('Google Maps API key not configured. Set VITE_GOOGLE_MAPS_API_KEY environment variable.');
      return;
    }
    
    loadGoogleMapsScript(config.googleApiKey)
      .then(() => {
        if (containerRef.current && !mapInstanceRef.current) {
          const map = new google.maps.Map(containerRef.current, {
            center: { lat: mapCenter.lat, lng: mapCenter.lng },
            zoom: mapZoom,
            minZoom: config.minZoom,
            maxZoom: config.maxZoom,
          });
          
          mapInstanceRef.current = map;
          
          if (onMapClick) {
            map.addListener('click', (e: google.maps.MapMouseEvent) => {
              if (e.latLng) {
                onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
              }
            });
          }
          
          if (onBoundsChange) {
            map.addListener('idle', () => {
              const bounds = map.getBounds();
              if (bounds) {
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                onBoundsChange({
                  north: ne.lat(),
                  south: sw.lat(),
                  east: ne.lng(),
                  west: sw.lng(),
                });
              }
            });
          }
          
          setIsLoaded(true);
        }
      })
      .catch((err) => {
        setError(err.message);
      });
      
    return () => {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current.clear();
      circlesRef.current.forEach(circle => circle.setMap(null));
      circlesRef.current.clear();
      polylinesRef.current.forEach(polyline => polyline.setMap(null));
      polylinesRef.current.clear();
    };
  }, [config.googleApiKey]);
  
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    
    const existingIds = new Set(markersRef.current.keys());
    const newIds = new Set(markers.map(m => m.id));
    
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        markersRef.current.get(id)?.setMap(null);
        markersRef.current.delete(id);
      }
    });
    
    markers.forEach(marker => {
      const existing = markersRef.current.get(marker.id);
      if (existing) {
        existing.setPosition({ lat: marker.position.lat, lng: marker.position.lng });
      } else {
        const gMarker = new google.maps.Marker({
          position: { lat: marker.position.lat, lng: marker.position.lng },
          map: mapInstanceRef.current,
          title: marker.title,
          draggable: marker.draggable,
        });
        
        if (marker.onClick) {
          gMarker.addListener('click', marker.onClick);
        }
        
        if (marker.onDragEnd) {
          gMarker.addListener('dragend', () => {
            const pos = gMarker.getPosition();
            if (pos) {
              marker.onDragEnd!({ lat: pos.lat(), lng: pos.lng() });
            }
          });
        }
        
        if (marker.popup) {
          const infoWindow = new google.maps.InfoWindow({
            content: typeof marker.popup === 'string' ? marker.popup : 'Info',
          });
          gMarker.addListener('click', () => {
            infoWindow.open(mapInstanceRef.current, gMarker);
          });
        }
        
        markersRef.current.set(marker.id, gMarker);
      }
    });
  }, [markers, isLoaded]);
  
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    
    const existingIds = new Set(circlesRef.current.keys());
    const newIds = new Set(circles.map(c => c.id));
    
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        circlesRef.current.get(id)?.setMap(null);
        circlesRef.current.delete(id);
      }
    });
    
    circles.forEach(circle => {
      const existing = circlesRef.current.get(circle.id);
      if (existing) {
        existing.setCenter({ lat: circle.center.lat, lng: circle.center.lng });
        existing.setRadius(circle.radius);
      } else {
        const gCircle = new google.maps.Circle({
          center: { lat: circle.center.lat, lng: circle.center.lng },
          radius: circle.radius,
          map: mapInstanceRef.current,
          strokeColor: circle.color || '#3b82f6',
          strokeWeight: circle.strokeWidth ?? 2,
          fillColor: circle.fillColor || circle.color || '#3b82f6',
          fillOpacity: circle.fillOpacity ?? 0.2,
        });
        circlesRef.current.set(circle.id, gCircle);
      }
    });
  }, [circles, isLoaded]);
  
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;
    
    const existingIds = new Set(polylinesRef.current.keys());
    const newIds = new Set(polylines.map(p => p.id));
    
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        polylinesRef.current.get(id)?.setMap(null);
        polylinesRef.current.delete(id);
      }
    });
    
    polylines.forEach(polyline => {
      const path = polyline.positions.map(p => ({ lat: p.lat, lng: p.lng }));
      const existing = polylinesRef.current.get(polyline.id);
      if (existing) {
        existing.setPath(path);
      } else {
        const gPolyline = new google.maps.Polyline({
          path,
          map: mapInstanceRef.current,
          strokeColor: polyline.color || '#3b82f6',
          strokeWeight: polyline.weight ?? 3,
          strokeOpacity: polyline.opacity ?? 1,
        });
        polylinesRef.current.set(polyline.id, gPolyline);
      }
    });
  }, [polylines, isLoaded]);
  
  useImperativeHandle(ref, () => ({
    flyTo: (position, targetZoom) => {
      mapInstanceRef.current?.panTo({ lat: position.lat, lng: position.lng });
      if (targetZoom !== undefined) {
        mapInstanceRef.current?.setZoom(targetZoom);
      }
    },
    fitBounds: (bounds, padding = 50) => {
      const gBounds = new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east }
      );
      mapInstanceRef.current?.fitBounds(gBounds, padding);
    },
    getCenter: () => {
      const center = mapInstanceRef.current?.getCenter();
      return center ? { lat: center.lat(), lng: center.lng() } : mapCenter;
    },
    getZoom: () => mapInstanceRef.current?.getZoom() ?? mapZoom,
    getBounds: () => {
      const bounds = mapInstanceRef.current?.getBounds();
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        return {
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng(),
        };
      }
      return { north: 0, south: 0, east: 0, west: 0 };
    },
  }), [isLoaded, mapCenter, mapZoom]);
  
  if (error) {
    return (
      <div 
        className={className} 
        style={{ 
          ...style, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'hsl(var(--muted))',
          color: 'hsl(var(--muted-foreground))',
          padding: '1rem',
          textAlign: 'center',
        }}
      >
        <div>
          <p className="font-medium">Google Maps Unavailable</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2">Switch to OpenStreetMap by setting VITE_MAP_PROVIDER=leaflet</p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ 
        ...style, 
        minHeight: '300px',
      }}
    >
      {!isLoaded && (
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            backgroundColor: 'hsl(var(--muted))',
          }}
        >
          Loading Google Maps...
        </div>
      )}
    </div>
  );
});

export default GoogleMap;
