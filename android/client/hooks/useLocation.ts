import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, Linking, Alert } from 'react-native';
import * as Location from 'expo-location';
import {
  LocationData,
  GeocodedLocation,
  LocationRecord,
  LocationSettings,
  LocationSubscription,
  getCurrentLocation,
  reverseGeocode,
  getLastLocation,
  saveLastLocation,
  addLocationToHistory,
  getLocationSettings,
  saveLocationSettings,
  startLocationUpdatesWithZekeSync,
  stopLocationUpdates,
  checkLocationPermission,
  requestLocationPermission,
  isLocationServicesEnabled,
  generateLocationId,
  getRelativeTime,
  syncCurrentLocationToZeke,
  syncPendingLocationsToZeke,
  getLocationSyncSettings,
  saveLocationSyncSettings,
  addPendingLocationSync,
} from '@/lib/location';

export interface UseLocationState {
  location: LocationData | null;
  geocoded: GeocodedLocation | null;
  lastUpdated: string;
  isLoading: boolean;
  isTracking: boolean;
  error: string | null;
  permissionStatus: 'undetermined' | 'granted' | 'denied';
  canAskAgain: boolean;
  servicesEnabled: boolean;
}

export interface UseLocationActions {
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  openSettings: () => void;
  updateSettings: (settings: Partial<LocationSettings>) => Promise<void>;
}

export interface UseLocationResult extends UseLocationState, UseLocationActions {
  settings: LocationSettings | null;
}

const DEFAULT_SETTINGS: LocationSettings = {
  trackingEnabled: true,
  highAccuracyMode: true,
  updateIntervalMs: 10000,
  distanceFilterMeters: 10,
  saveHistoryEnabled: true,
  maxHistoryItems: 100,
};

export function useLocation(autoStart: boolean = true): UseLocationResult {
  const [state, setState] = useState<UseLocationState>({
    location: null,
    geocoded: null,
    lastUpdated: '',
    isLoading: true,
    isTracking: false,
    error: null,
    permissionStatus: 'undetermined',
    canAskAgain: true,
    servicesEnabled: true,
  });

  const [settings, setSettings] = useState<LocationSettings | null>(null);
  const subscriptionRef = useRef<LocationSubscription | null>(null);

  const updateLocation = useCallback(async (locationData: LocationData, syncToZeke: boolean = true) => {
    const geocoded = await reverseGeocode(locationData.latitude, locationData.longitude);
    
    const record: LocationRecord = {
      id: generateLocationId(),
      location: locationData,
      geocoded,
      createdAt: new Date().toISOString(),
      isStarred: false,
    };

    await saveLastLocation(record);
    
    if (settings?.saveHistoryEnabled) {
      await addLocationToHistory(record);
    }

    if (syncToZeke) {
      addPendingLocationSync(locationData, geocoded).catch(console.error);
    }

    setState(prev => ({
      ...prev,
      location: locationData,
      geocoded,
      lastUpdated: getRelativeTime(locationData.timestamp),
      isLoading: false,
      error: null,
    }));
  }, [settings?.saveHistoryEnabled]);

  const checkPermissionAndServices = useCallback(async () => {
    const servicesEnabled = await isLocationServicesEnabled();
    const permission = await checkLocationPermission();

    setState(prev => ({
      ...prev,
      servicesEnabled,
      permissionStatus: permission.status === 'granted' ? 'granted' : 
                        permission.status === 'denied' ? 'denied' : 'undetermined',
      canAskAgain: permission.canAskAgain,
    }));

    return { servicesEnabled, permission };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await requestLocationPermission();
      
      setState(prev => ({
        ...prev,
        permissionStatus: result.granted ? 'granted' : 'denied',
        canAskAgain: result.canAskAgain,
        isLoading: false,
      }));

      return result.granted;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to request location permission',
        isLoading: false,
      }));
      return false;
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { permission } = await checkPermissionAndServices();
      
      if (!permission.granted) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Location permission not granted',
        }));
        return;
      }

      const location = await getCurrentLocation(settings?.highAccuracyMode ?? true);
      
      if (location) {
        await updateLocation(location, true);
        syncPendingLocationsToZeke().catch(console.error);
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Could not get current location',
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to get location',
      }));
    }
  }, [checkPermissionAndServices, settings?.highAccuracyMode, updateLocation]);

  const startTracking = useCallback(async () => {
    if (subscriptionRef.current) {
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { permission, servicesEnabled } = await checkPermissionAndServices();
      
      if (!servicesEnabled) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Location services are disabled',
        }));
        return;
      }

      if (!permission.granted) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Location permission not granted',
        }));
        return;
      }

      const subscription = await startLocationUpdatesWithZekeSync(
        (location) => updateLocation(location, false),
        settings ?? undefined
      );

      if (subscription) {
        subscriptionRef.current = subscription;
        setState(prev => ({
          ...prev,
          isTracking: true,
          isLoading: false,
          error: null,
        }));

        await refreshLocation();
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to start location tracking',
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start tracking',
      }));
    }
  }, [checkPermissionAndServices, refreshLocation, settings, updateLocation]);

  const stopTracking = useCallback(() => {
    if (subscriptionRef.current) {
      stopLocationUpdates(subscriptionRef.current);
      subscriptionRef.current = null;
    }
    
    syncPendingLocationsToZeke().catch(console.error);
    
    setState(prev => ({
      ...prev,
      isTracking: false,
    }));
  }, []);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.alert('Please enable location access in your browser settings.');
      }
      return;
    }

    try {
      Linking.openSettings();
    } catch (error) {
      console.error('Could not open settings:', error);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<LocationSettings>) => {
    await saveLocationSettings(newSettings);
    const updated = await getLocationSettings();
    setSettings(updated);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const loadedSettings = await getLocationSettings();
      setSettings(loadedSettings);

      syncPendingLocationsToZeke().catch(console.error);

      const lastLocation = await getLastLocation();
      if (lastLocation) {
        setState(prev => ({
          ...prev,
          location: lastLocation.location,
          geocoded: lastLocation.geocoded,
          lastUpdated: getRelativeTime(lastLocation.location.timestamp),
        }));
      }

      await checkPermissionAndServices();

      if (autoStart && loadedSettings.trackingEnabled) {
        const permission = await checkLocationPermission();
        if (permission.granted) {
          const location = await getCurrentLocation(loadedSettings.highAccuracyMode);
          if (location) {
            const geocoded = await reverseGeocode(location.latitude, location.longitude);
            await addPendingLocationSync(location, geocoded);
            
            setState(prev => ({
              ...prev,
              location,
              geocoded,
              lastUpdated: getRelativeTime(location.timestamp),
              isLoading: false,
              permissionStatus: 'granted',
            }));
            
            syncPendingLocationsToZeke().catch(console.error);
          } else {
            setState(prev => ({ ...prev, isLoading: false }));
          }
        } else {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initialize();

    return () => {
      if (subscriptionRef.current) {
        stopLocationUpdates(subscriptionRef.current);
      }
      syncPendingLocationsToZeke().catch(console.error);
    };
  }, [autoStart, checkPermissionAndServices]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (state.location) {
      interval = setInterval(() => {
        setState(prev => ({
          ...prev,
          lastUpdated: prev.location ? getRelativeTime(prev.location.timestamp) : '',
        }));
      }, 60000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [state.location]);

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    const startSyncInterval = async () => {
      const syncSettings = await getLocationSyncSettings();
      if (isMounted && syncSettings.syncEnabled && state.isTracking) {
        syncIntervalRef.current = setInterval(() => {
          syncPendingLocationsToZeke().catch(console.error);
        }, syncSettings.syncIntervalMs);
      }
    };

    if (state.isTracking) {
      startSyncInterval();
    }

    return () => {
      isMounted = false;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [state.isTracking]);

  return {
    ...state,
    settings,
    requestPermission,
    refreshLocation,
    startTracking,
    stopTracking,
    openSettings,
    updateSettings,
  };
}
