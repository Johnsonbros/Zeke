import { useRef, useMemo } from 'react';
import { Map } from './Map';
import { MapRef, MapPosition, MarkerConfig, CircleConfig, PolylineConfig } from './types';

interface LocationPoint {
  id: string;
  latitude: number | string;
  longitude: number | string;
  name?: string;
  category?: string;
  isStarred?: boolean;
  proximityRadiusMeters?: number;
  timestamp?: string;
}

interface LocationMapProps {
  locations?: LocationPoint[];
  currentLocation?: { latitude: number | string; longitude: number | string };
  showTrail?: boolean;
  onLocationClick?: (location: LocationPoint) => void;
  onMapClick?: (position: MapPosition) => void;
  center?: MapPosition;
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
}

function getCategoryIcon(category?: string): 'home' | 'work' | 'starred' | 'default' {
  switch (category?.toLowerCase()) {
    case 'home':
      return 'home';
    case 'work':
    case 'office':
      return 'work';
    default:
      return 'default';
  }
}

export function LocationMap({
  locations = [],
  currentLocation,
  showTrail = false,
  onLocationClick,
  onMapClick,
  center,
  zoom,
  className = 'h-[400px] w-full rounded-md',
  style,
}: LocationMapProps) {
  const mapRef = useRef<MapRef>(null);
  
  const markers: MarkerConfig[] = useMemo(() => {
    const result: MarkerConfig[] = [];
    
    if (currentLocation) {
      result.push({
        id: 'current-location',
        position: {
          lat: Number(currentLocation.latitude),
          lng: Number(currentLocation.longitude),
        },
        title: 'Current Location',
        icon: {
          type: 'custom',
          color: '#3b82f6',
          size: 'medium',
        },
      });
    }
    
    locations.forEach((loc) => {
      result.push({
        id: loc.id,
        position: {
          lat: Number(loc.latitude),
          lng: Number(loc.longitude),
        },
        title: loc.name,
        icon: {
          type: loc.isStarred ? 'starred' : getCategoryIcon(loc.category),
          size: 'medium',
        },
        popup: loc.name ? (
          <div className="p-1">
            <p className="font-medium">{loc.name}</p>
            {loc.category && <p className="text-sm text-muted-foreground">{loc.category}</p>}
          </div>
        ) : undefined,
        onClick: () => onLocationClick?.(loc),
      });
    });
    
    return result;
  }, [locations, currentLocation, onLocationClick]);
  
  const circles: CircleConfig[] = useMemo(() => {
    return locations
      .filter((loc) => loc.proximityRadiusMeters && loc.proximityRadiusMeters > 0)
      .map((loc) => ({
        id: `circle-${loc.id}`,
        center: {
          lat: Number(loc.latitude),
          lng: Number(loc.longitude),
        },
        radius: loc.proximityRadiusMeters!,
        color: loc.isStarred ? '#f59e0b' : '#3b82f6',
        fillOpacity: 0.1,
      }));
  }, [locations]);
  
  const polylines: PolylineConfig[] = useMemo(() => {
    if (!showTrail || locations.length < 2) return [];
    
    const sortedLocations = [...locations]
      .filter((loc) => loc.timestamp)
      .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());
    
    if (sortedLocations.length < 2) return [];
    
    return [{
      id: 'location-trail',
      positions: sortedLocations.map((loc) => ({
        lat: Number(loc.latitude),
        lng: Number(loc.longitude),
      })),
      color: '#6366f1',
      weight: 3,
      opacity: 0.7,
    }];
  }, [locations, showTrail]);
  
  const defaultCenter = useMemo(() => {
    if (center) return center;
    if (currentLocation) {
      return {
        lat: Number(currentLocation.latitude),
        lng: Number(currentLocation.longitude),
      };
    }
    if (locations.length > 0) {
      return {
        lat: Number(locations[0].latitude),
        lng: Number(locations[0].longitude),
      };
    }
    return { lat: 42.1048, lng: -70.9456 };
  }, [center, currentLocation, locations]);
  
  return (
    <Map
      ref={mapRef}
      center={defaultCenter}
      zoom={zoom ?? 14}
      markers={markers}
      circles={circles}
      polylines={polylines}
      onMapClick={onMapClick}
      className={className}
      style={style}
    />
  );
}

export default LocationMap;
