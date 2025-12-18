import React, { forwardRef, ReactNode } from "react";
import { Platform, StyleSheet, StyleProp, ViewStyle } from "react-native";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  PROVIDER_DEFAULT,
  Region,
  MapViewProps,
  UrlTile,
  MarkerProps,
} from "react-native-maps";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const useMapProvider = () => {
  const hasGoogleMapsKey = Boolean(GOOGLE_MAPS_API_KEY);
  const provider = hasGoogleMapsKey && Platform.OS === "android" ? "google" : "osm";
  return { provider, hasGoogleMapsKey };
};

interface ConfigurableMapProps extends Omit<MapViewProps, "provider"> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  forceProvider?: "google" | "osm" | "default";
}

export const ConfigurableMap = forwardRef<MapView, ConfigurableMapProps>(
  ({ children, style, forceProvider, ...props }, ref) => {
    const { hasGoogleMapsKey } = useMapProvider();

    const getProvider = () => {
      if (forceProvider === "google" && hasGoogleMapsKey && Platform.OS === "android") {
        return PROVIDER_GOOGLE;
      }
      if (forceProvider === "osm") {
        return PROVIDER_DEFAULT;
      }
      if (forceProvider === "default") {
        return PROVIDER_DEFAULT;
      }
      if (hasGoogleMapsKey && Platform.OS === "android") {
        return PROVIDER_GOOGLE;
      }
      return PROVIDER_DEFAULT;
    };

    const shouldUseOsmTiles = () => {
      if (forceProvider === "google" && hasGoogleMapsKey) {
        return false;
      }
      if (forceProvider === "osm") {
        return true;
      }
      if (forceProvider === "default") {
        return false;
      }
      return !hasGoogleMapsKey;
    };

    const provider = getProvider();
    const useOsmTiles = shouldUseOsmTiles();

    return (
      <MapView
        ref={ref}
        style={[styles.map, style]}
        provider={provider}
        {...props}
      >
        {useOsmTiles ? (
          <UrlTile
            urlTemplate={OSM_TILE_URL}
            maximumZ={19}
            flipY={false}
            tileSize={256}
          />
        ) : null}
        {children}
      </MapView>
    );
  }
);

ConfigurableMap.displayName = "ConfigurableMap";

export { Marker, Region };
export type { MarkerProps };

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
