import React, { useState, useCallback } from "react";
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert, Platform, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { GradientText } from "@/components/GradientText";
import { PulsingDot } from "@/components/PulsingDot";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/hooks/useLocation";
import { Spacing, Colors, BorderRadius, Gradients } from "@/constants/theme";
import { 
  getLocationHistory, 
  getStarredPlaces, 
  addStarredPlace, 
  removeStarredPlace,
  formatCoordinates,
  formatDistance,
  calculateDistance,
  generateLocationId,
  type LocationRecord,
  type StarredPlace,
} from "@/lib/location";

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'starred'>('current');
  const [locationHistory, setLocationHistory] = useState<LocationRecord[]>([]);
  const [starredPlaces, setStarredPlaces] = useState<StarredPlace[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingStarred, setIsLoadingStarred] = useState(false);
  
  const {
    location,
    geocoded,
    lastUpdated,
    isLoading,
    isTracking,
    permissionStatus,
    requestPermission,
    refreshLocation,
    startTracking,
    stopTracking,
    openSettings,
  } = useLocation();

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const history = await getLocationHistory();
      setLocationHistory(history);
    } catch (error) {
      console.error('Error loading location history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const loadStarredPlaces = useCallback(async () => {
    setIsLoadingStarred(true);
    try {
      const places = await getStarredPlaces();
      setStarredPlaces(places);
    } catch (error) {
      console.error('Error loading starred places:', error);
    } finally {
      setIsLoadingStarred(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'starred') {
      loadStarredPlaces();
    }
  }, [activeTab, loadHistory, loadStarredPlaces]);

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeTab === 'current') {
      await refreshLocation();
    } else if (activeTab === 'history') {
      await loadHistory();
    } else {
      await loadStarredPlaces();
    }
  }, [activeTab, refreshLocation, loadHistory, loadStarredPlaces]);

  const handleStarCurrentLocation = useCallback(async () => {
    if (!location || !geocoded) {
      Alert.alert('No Location', 'Unable to get current location to star.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const placeName = geocoded.city || geocoded.region || 'My Location';
    
    const newPlace: StarredPlace = {
      id: generateLocationId(),
      name: placeName,
      location,
      geocoded,
      createdAt: new Date().toISOString(),
    };

    try {
      await addStarredPlace(newPlace);
      setStarredPlaces(prev => [newPlace, ...prev]);
      
      if (Platform.OS === 'web') {
        window.alert(`${placeName} has been starred!`);
      } else {
        Alert.alert('Location Starred', `${placeName} has been saved to your starred places.`);
      }
    } catch (error) {
      console.error('Error starring location:', error);
      Alert.alert('Error', 'Failed to star location. Please try again.');
    }
  }, [location, geocoded]);

  const handleRemoveStarredPlace = useCallback(async (placeId: string, placeName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const confirmRemove = async () => {
      try {
        await removeStarredPlace(placeId);
        setStarredPlaces(prev => prev.filter(p => p.id !== placeId));
      } catch (error) {
        console.error('Error removing starred place:', error);
        Alert.alert('Error', 'Failed to remove starred place.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${placeName} from starred places?`)) {
        await confirmRemove();
      }
    } else {
      Alert.alert(
        'Remove Starred Place',
        `Remove ${placeName} from your starred places?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: confirmRemove },
        ]
      );
    }
  }, []);

  const handleToggleTracking = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isTracking) {
      stopTracking();
    } else {
      await startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const renderTabButton = (tab: 'current' | 'history' | 'starred', label: string, icon: keyof typeof Feather.glyphMap) => (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setActiveTab(tab);
      }}
      style={[
        styles.tabButton,
        activeTab === tab && { backgroundColor: `${Colors.dark.primary}20` },
      ]}
    >
      <Feather 
        name={icon} 
        size={18} 
        color={activeTab === tab ? Colors.dark.primary : theme.textSecondary} 
      />
      <ThemedText 
        type="small" 
        style={[
          styles.tabLabel,
          { color: activeTab === tab ? Colors.dark.primary : theme.textSecondary }
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  const renderCurrentLocation = () => (
    <View style={styles.sectionContent}>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Feather name="navigation" size={20} color={Colors.dark.primary} />
            <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>Current Location</ThemedText>
          </View>
          <View style={styles.statusBadge}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : permissionStatus === 'granted' && location ? (
              <>
                <PulsingDot color={Colors.dark.success} size={8} />
                <ThemedText type="caption" style={{ marginLeft: Spacing.xs, color: Colors.dark.success }}>
                  Active
                </ThemedText>
              </>
            ) : (
              <ThemedText type="caption" style={{ color: Colors.dark.warning }}>
                {permissionStatus === 'denied' ? 'Denied' : 'Inactive'}
              </ThemedText>
            )}
          </View>
        </View>

        {permissionStatus === 'granted' && location ? (
          <>
            <View style={styles.locationDetails}>
              <ThemedText type="h3" style={{ marginBottom: Spacing.xs }}>
                {geocoded?.formattedAddress || 'Getting address...'}
              </ThemedText>
              <ThemedText type="caption" secondary>
                {formatCoordinates(location.latitude, location.longitude)}
              </ThemedText>
              <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs }}>
                Last updated: {lastUpdated || 'Just now'}
              </ThemedText>
              {location.accuracy !== null && (
                <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs }}>
                  Accuracy: {Math.round(location.accuracy)}m
                </ThemedText>
              )}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleRefresh}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: `${Colors.dark.primary}20`, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="refresh-cw" size={18} color={Colors.dark.primary} />
                <ThemedText type="small" style={{ marginLeft: Spacing.xs, color: Colors.dark.primary }}>
                  Refresh
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleStarCurrentLocation}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: `${Colors.dark.accent}20`, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="star" size={18} color={Colors.dark.accent} />
                <ThemedText type="small" style={{ marginLeft: Spacing.xs, color: Colors.dark.accent }}>
                  Star
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleToggleTracking}
                style={({ pressed }) => [
                  styles.actionButton,
                  { 
                    backgroundColor: isTracking ? `${Colors.dark.error}20` : `${Colors.dark.success}20`, 
                    opacity: pressed ? 0.7 : 1 
                  },
                ]}
              >
                <Feather 
                  name={isTracking ? "pause" : "play"} 
                  size={18} 
                  color={isTracking ? Colors.dark.error : Colors.dark.success} 
                />
                <ThemedText 
                  type="small" 
                  style={{ 
                    marginLeft: Spacing.xs, 
                    color: isTracking ? Colors.dark.error : Colors.dark.success 
                  }}
                >
                  {isTracking ? 'Stop' : 'Track'}
                </ThemedText>
              </Pressable>
            </View>
          </>
        ) : permissionStatus === 'denied' ? (
          <View style={styles.permissionContainer}>
            <Feather name="alert-circle" size={48} color={Colors.dark.error} />
            <ThemedText type="body" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
              Location access denied
            </ThemedText>
            <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs, textAlign: 'center' }}>
              {Platform.OS !== 'web' ? 'Please enable location in your device settings.' : 'Enable location access in your browser.'}
            </ThemedText>
            {Platform.OS !== 'web' && (
              <Pressable
                onPress={openSettings}
                style={({ pressed }) => [
                  styles.enableButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <LinearGradient
                  colors={Gradients.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.enableButtonGradient}
                >
                  <ThemedText type="body" style={{ color: '#FFFFFF' }}>
                    Open Settings
                  </ThemedText>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.permissionContainer}>
            <Feather name="map-pin" size={48} color={Colors.dark.primary} />
            <ThemedText type="body" style={{ marginTop: Spacing.md, textAlign: 'center' }}>
              Enable Location Access
            </ThemedText>
            <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs, textAlign: 'center' }}>
              Allow ZEKE to access your location for tracking features.
            </ThemedText>
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [
                styles.enableButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <LinearGradient
                colors={Gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.enableButtonGradient}
              >
                <ThemedText type="body" style={{ color: '#FFFFFF' }}>
                  Enable Location
                </ThemedText>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.infoRow}>
          <Feather name="info" size={16} color={theme.textSecondary} />
          <ThemedText type="caption" secondary style={{ marginLeft: Spacing.sm, flex: 1 }}>
            ZEKE uses GPS for accurate location tracking. Your location data is stored locally and synced with your ZEKE account.
          </ThemedText>
        </View>
      </View>
    </View>
  );

  const renderLocationHistory = () => (
    <View style={styles.sectionContent}>
      {isLoadingHistory ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
            Loading history...
          </ThemedText>
        </View>
      ) : locationHistory.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="clock" size={48} color={theme.textSecondary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md, textAlign: 'center' }}>
            No location history yet
          </ThemedText>
          <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs, textAlign: 'center' }}>
            Your location history will appear here as ZEKE tracks your movements.
          </ThemedText>
        </View>
      ) : (
        locationHistory.map((record, index) => (
          <View 
            key={record.id} 
            style={[
              styles.historyItem, 
              { backgroundColor: theme.backgroundDefault },
              index === 0 && styles.firstHistoryItem,
            ]}
          >
            <View style={styles.historyIconContainer}>
              <Feather name="map-pin" size={16} color={Colors.dark.primary} />
            </View>
            <View style={styles.historyContent}>
              <ThemedText type="body" numberOfLines={1}>
                {record.geocoded?.formattedAddress || formatCoordinates(record.location.latitude, record.location.longitude)}
              </ThemedText>
              <ThemedText type="caption" secondary style={{ marginTop: 2 }}>
                {new Date(record.createdAt).toLocaleString()}
              </ThemedText>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderStarredPlaces = () => (
    <View style={styles.sectionContent}>
      {isLoadingStarred ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
            Loading starred places...
          </ThemedText>
        </View>
      ) : starredPlaces.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="star" size={48} color={theme.textSecondary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md, textAlign: 'center' }}>
            No starred places yet
          </ThemedText>
          <ThemedText type="caption" secondary style={{ marginTop: Spacing.xs, textAlign: 'center' }}>
            Star your favorite locations to quickly access them later.
          </ThemedText>
        </View>
      ) : (
        starredPlaces.map((place) => {
          const distance = location 
            ? calculateDistance(
                location.latitude, 
                location.longitude, 
                place.location.latitude, 
                place.location.longitude
              )
            : null;

          return (
            <Pressable
              key={place.id}
              onLongPress={() => handleRemoveStarredPlace(place.id, place.name)}
              style={({ pressed }) => [
                styles.starredItem,
                { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <View style={[styles.starredIconContainer, { backgroundColor: `${Colors.dark.accent}20` }]}>
                <Feather name="star" size={20} color={Colors.dark.accent} />
              </View>
              <View style={styles.starredContent}>
                <ThemedText type="body" numberOfLines={1}>{place.name}</ThemedText>
                <ThemedText type="caption" secondary numberOfLines={1}>
                  {place.geocoded?.formattedAddress || formatCoordinates(place.location.latitude, place.location.longitude)}
                </ThemedText>
                {distance !== null && (
                  <ThemedText type="caption" style={{ color: Colors.dark.primary, marginTop: 2 }}>
                    {formatDistance(distance)} away
                  </ThemedText>
                )}
              </View>
              <Pressable
                onPress={() => handleRemoveStarredPlace(place.id, place.name)}
                hitSlop={10}
              >
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </Pressable>
          );
        })
      )}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={handleRefresh}
          tintColor={Colors.dark.primary}
        />
      }
    >
      <View style={styles.header}>
        <GradientText type="h2" colors={Gradients.primary}>
          Location
        </GradientText>
        <ThemedText type="body" secondary style={{ marginTop: Spacing.xs }}>
          Track and manage your locations
        </ThemedText>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: theme.backgroundDefault }]}>
        {renderTabButton('current', 'Current', 'navigation')}
        {renderTabButton('history', 'History', 'clock')}
        {renderTabButton('starred', 'Starred', 'star')}
      </View>

      {activeTab === 'current' && renderCurrentLocation()}
      {activeTab === 'history' && renderLocationHistory()}
      {activeTab === 'starred' && renderStarredPlaces()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: Spacing.lg,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tabLabel: {
    marginLeft: Spacing.xs,
  },
  sectionContent: {
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDetails: {
    marginBottom: Spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.xs,
  },
  permissionContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  enableButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  enableButtonGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
  },
  infoCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
  },
  emptyCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  firstHistoryItem: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.primary,
  },
  historyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${Colors.dark.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  historyContent: {
    flex: 1,
  },
  starredItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  starredIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  starredContent: {
    flex: 1,
  },
});
