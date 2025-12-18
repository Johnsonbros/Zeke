import React, { useState, useRef, useCallback, useEffect } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE, Region, MapPressEvent } from "react-native-maps";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/hooks/useLocation";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";

const DEFAULT_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const mapRef = useRef<MapView>(null);
  
  const [mapReady, setMapReady] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  const {
    location,
    geocoded,
    isLoading,
    permissionStatus,
    requestPermission,
    refreshLocation,
    openSettings,
    canAskAgain,
  } = useLocation();

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const handleCenterOnUser = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (!location) {
      await refreshLocation();
      return;
    }
    
    mapRef.current?.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
  }, [location, refreshLocation]);

  const handleMapPress = useCallback((event: MapPressEvent) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation(coordinate);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleRequestPermission = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await requestPermission();
  }, [requestPermission]);

  const handleOpenSettings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openSettings();
  }, [openSettings]);

  useEffect(() => {
    if (mapReady && location) {
      mapRef.current?.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [mapReady, location]);

  const renderPermissionRequest = () => (
    <ThemedView style={[styles.permissionContainer, { paddingTop: headerHeight + Spacing.xl }]}>
      <View style={[styles.permissionCard, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="map-pin" size={48} color={Colors.dark.primary} />
        <ThemedText type="h3" style={styles.permissionTitle}>
          Enable Location Access
        </ThemedText>
        <ThemedText type="body" secondary style={styles.permissionDescription}>
          To show your location on the map, we need access to your device location.
        </ThemedText>
        
        {permissionStatus === 'denied' && !canAskAgain ? (
          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.permissionButton,
              { backgroundColor: Colors.dark.primary, opacity: pressed ? 0.8 : 1 }
            ]}
          >
            <Feather name="settings" size={18} color="#FFFFFF" />
            <ThemedText type="body" style={styles.permissionButtonText}>
              Open Settings
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleRequestPermission}
            style={({ pressed }) => [
              styles.permissionButton,
              { backgroundColor: Colors.dark.primary, opacity: pressed ? 0.8 : 1 }
            ]}
          >
            <Feather name="navigation" size={18} color="#FFFFFF" />
            <ThemedText type="body" style={styles.permissionButtonText}>
              Enable Location
            </ThemedText>
          </Pressable>
        )}
      </View>
    </ThemedView>
  );

  if (permissionStatus !== 'granted') {
    return renderPermissionRequest();
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : DEFAULT_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        onMapReady={handleMapReady}
        onPress={handleMapPress}
      >
        {selectedLocation ? (
          <Marker
            coordinate={selectedLocation}
            title="Selected Location"
            description={`${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}`}
            pinColor={Colors.dark.primary}
          />
        ) : null}
      </MapView>

      {isLoading ? (
        <View style={[styles.loadingOverlay, { top: headerHeight }]}>
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        </View>
      ) : null}

      <View style={[styles.floatingControls, { bottom: insets.bottom + Spacing.xl }]}>
        <Pressable
          onPress={handleCenterOnUser}
          style={({ pressed }) => [
            styles.floatingButton,
            { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 }
          ]}
        >
          <Feather name="crosshair" size={24} color={Colors.dark.primary} />
        </Pressable>
      </View>

      {geocoded ? (
        <View style={[styles.addressBar, { top: headerHeight + Spacing.md }]}>
          <View style={[styles.addressContent, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="map-pin" size={16} color={Colors.dark.primary} />
            <ThemedText type="small" numberOfLines={1} style={styles.addressText}>
              {geocoded.formattedAddress || 'Loading address...'}
            </ThemedText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  permissionCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    maxWidth: 320,
  },
  permissionTitle: {
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  permissionDescription: {
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    left: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: BorderRadius.md,
  },
  floatingControls: {
    position: 'absolute',
    right: Spacing.md,
    gap: Spacing.sm,
  },
  floatingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  addressBar: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
  },
  addressContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addressText: {
    flex: 1,
  },
});
