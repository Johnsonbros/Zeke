export type MapProvider = 'leaflet' | 'google';

export interface MapPosition {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MarkerConfig {
  id: string;
  position: MapPosition;
  title?: string;
  icon?: MarkerIconConfig;
  popup?: React.ReactNode;
  draggable?: boolean;
  onClick?: () => void;
  onDragEnd?: (position: MapPosition) => void;
}

export interface MarkerIconConfig {
  type: 'default' | 'home' | 'work' | 'starred' | 'custom';
  color?: string;
  size?: 'small' | 'medium' | 'large';
  customUrl?: string;
}

export interface CircleConfig {
  id: string;
  center: MapPosition;
  radius: number;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

export interface PolylineConfig {
  id: string;
  positions: MapPosition[];
  color?: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
}

export interface MapConfig {
  provider: MapProvider;
  googleApiKey?: string;
  defaultCenter: MapPosition;
  defaultZoom: number;
  minZoom?: number;
  maxZoom?: number;
  tileServer?: string;
  attribution?: string;
}

export interface MapContextValue {
  provider: MapProvider;
  config: MapConfig;
  isLoaded: boolean;
}

export interface MapComponentProps {
  center?: MapPosition;
  zoom?: number;
  markers?: MarkerConfig[];
  circles?: CircleConfig[];
  polylines?: PolylineConfig[];
  onMapClick?: (position: MapPosition) => void;
  onBoundsChange?: (bounds: MapBounds) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export interface MapRef {
  flyTo: (position: MapPosition, zoom?: number) => void;
  fitBounds: (bounds: MapBounds, padding?: number) => void;
  getCenter: () => MapPosition;
  getZoom: () => number;
  getBounds: () => MapBounds;
}

export const DEFAULT_MAP_CONFIG: MapConfig = {
  provider: 'leaflet',
  defaultCenter: { lat: 42.1048, lng: -70.9456 },
  defaultZoom: 13,
  minZoom: 3,
  maxZoom: 19,
  tileServer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
