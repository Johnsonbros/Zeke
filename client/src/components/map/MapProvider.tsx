import { createContext, useContext, useMemo } from 'react';
import { MapConfig, MapContextValue, MapProvider as MapProviderType, DEFAULT_MAP_CONFIG } from './types';

const MapContext = createContext<MapContextValue | null>(null);

interface MapProviderProps {
  provider?: MapProviderType;
  googleApiKey?: string;
  config?: Partial<MapConfig>;
  children: React.ReactNode;
}

export function MapProvider({ 
  provider: providerOverride, 
  googleApiKey, 
  config: configOverride,
  children 
}: MapProviderProps) {
  const envProvider = (import.meta.env.VITE_MAP_PROVIDER as MapProviderType) || 'leaflet';
  const envGoogleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  const provider = providerOverride || envProvider;
  const apiKey = googleApiKey || envGoogleKey;
  
  const config: MapConfig = useMemo(() => ({
    ...DEFAULT_MAP_CONFIG,
    ...configOverride,
    provider,
    googleApiKey: apiKey,
  }), [provider, apiKey, configOverride]);
  
  const value: MapContextValue = useMemo(() => ({
    provider,
    config,
    isLoaded: provider === 'leaflet' || !!apiKey,
  }), [provider, config, apiKey]);
  
  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) {
    return {
      provider: 'leaflet',
      config: DEFAULT_MAP_CONFIG,
      isLoaded: true,
    };
  }
  return context;
}

export function useMapProvider(): MapProviderType {
  const { provider } = useMapContext();
  return provider;
}

export function useMapConfig(): MapConfig {
  const { config } = useMapContext();
  return config;
}
