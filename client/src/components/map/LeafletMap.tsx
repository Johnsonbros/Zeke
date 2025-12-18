import { useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapComponentProps, 
  MapRef, 
  MapPosition, 
  MapBounds,
  MarkerConfig,
  MarkerIconConfig,
  CircleConfig,
  PolylineConfig
} from './types';
import { useMapConfig } from './MapProvider';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function createIcon(iconConfig?: MarkerIconConfig): L.Icon | L.DivIcon {
  if (!iconConfig) {
    return new L.Icon.Default();
  }
  
  const sizeMap = {
    small: [20, 32],
    medium: [25, 41],
    large: [32, 52],
  };
  const size = sizeMap[iconConfig.size || 'medium'] as [number, number];
  
  if (iconConfig.customUrl) {
    return new L.Icon({
      iconUrl: iconConfig.customUrl,
      iconSize: size,
      iconAnchor: [size[0] / 2, size[1]],
      popupAnchor: [0, -size[1]],
    });
  }
  
  const colorMap: Record<string, string> = {
    home: '#10b981',
    work: '#3b82f6',
    starred: '#f59e0b',
    default: '#ef4444',
  };
  
  const color = iconConfig.color || colorMap[iconConfig.type] || colorMap.default;
  
  return new L.DivIcon({
    className: 'custom-marker-icon',
    html: `
      <svg width="${size[0]}" height="${size[1]}" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12z" fill="${color}"/>
        <circle cx="12" cy="12" r="6" fill="white"/>
      </svg>
    `,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1]],
    popupAnchor: [0, -size[1]],
  });
}

interface MapEventsHandlerProps {
  onMapClick?: (position: MapPosition) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
}

function MapEventsHandler({ onMapClick, onBoundsChange }: MapEventsHandlerProps) {
  useMapEvents({
    click: (e) => {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    moveend: (e) => {
      const map = e.target;
      const bounds = map.getBounds();
      onBoundsChange?.({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    },
  });
  return null;
}

interface MapControllerProps {
  mapRef: React.MutableRefObject<MapRef | null>;
}

function MapController({ mapRef }: MapControllerProps) {
  const map = useMap();
  
  useEffect(() => {
    mapRef.current = {
      flyTo: (position, zoom) => {
        map.flyTo([position.lat, position.lng], zoom ?? map.getZoom());
      },
      fitBounds: (bounds, padding = 50) => {
        map.fitBounds(
          [[bounds.south, bounds.west], [bounds.north, bounds.east]],
          { padding: [padding, padding] }
        );
      },
      getCenter: () => {
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
      },
      getZoom: () => map.getZoom(),
      getBounds: () => {
        const bounds = map.getBounds();
        return {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        };
      },
    };
  }, [map, mapRef]);
  
  return null;
}

function LeafletMarker({ marker }: { marker: MarkerConfig }) {
  const icon = createIcon(marker.icon);
  
  return (
    <Marker
      position={[marker.position.lat, marker.position.lng]}
      icon={icon}
      draggable={marker.draggable}
      eventHandlers={{
        click: () => marker.onClick?.(),
        dragend: (e) => {
          const latlng = e.target.getLatLng();
          marker.onDragEnd?.({ lat: latlng.lat, lng: latlng.lng });
        },
      }}
    >
      {marker.popup && <Popup>{marker.popup}</Popup>}
    </Marker>
  );
}

function LeafletCircle({ circle }: { circle: CircleConfig }) {
  return (
    <Circle
      center={[circle.center.lat, circle.center.lng]}
      radius={circle.radius}
      pathOptions={{
        color: circle.color || '#3b82f6',
        fillColor: circle.fillColor || circle.color || '#3b82f6',
        fillOpacity: circle.fillOpacity ?? 0.2,
        weight: circle.strokeWidth ?? 2,
      }}
    />
  );
}

function LeafletPolyline({ polyline }: { polyline: PolylineConfig }) {
  const positions = polyline.positions.map(p => [p.lat, p.lng] as [number, number]);
  
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: polyline.color || '#3b82f6',
        weight: polyline.weight ?? 3,
        opacity: polyline.opacity ?? 1,
        dashArray: polyline.dashArray,
      }}
    />
  );
}

export const LeafletMap = forwardRef<MapRef, MapComponentProps>(function LeafletMap(
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
  const mapRef = useRef<MapRef | null>(null);
  
  useImperativeHandle(ref, () => mapRef.current!, []);
  
  const mapCenter = center || config.defaultCenter;
  const mapZoom = zoom ?? config.defaultZoom;
  
  return (
    <MapContainer
      center={[mapCenter.lat, mapCenter.lng]}
      zoom={mapZoom}
      minZoom={config.minZoom}
      maxZoom={config.maxZoom}
      className={className}
      style={style}
    >
      <TileLayer
        url={config.tileServer || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        attribution={config.attribution}
      />
      <MapController mapRef={mapRef} />
      <MapEventsHandler onMapClick={onMapClick} onBoundsChange={onBoundsChange} />
      
      {markers.map((marker) => (
        <LeafletMarker key={marker.id} marker={marker} />
      ))}
      
      {circles.map((circle) => (
        <LeafletCircle key={circle.id} circle={circle} />
      ))}
      
      {polylines.map((polyline) => (
        <LeafletPolyline key={polyline.id} polyline={polyline} />
      ))}
      
      {children}
    </MapContainer>
  );
});

export default LeafletMap;
