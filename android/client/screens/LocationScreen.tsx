import React, { useState, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { GeoStackParamList } from "@/navigation/GeoStackNavigator";

import { ThemedText } from "@/components/ThemedText";
import { GradientText } from "@/components/GradientText";
import { PulsingDot } from "@/components/PulsingDot";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useLocation } from "@/hooks/useLocation";
import { useGeofenceMonitor } from "@/hooks/useGeofenceMonitor";
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
import {
  getGeofences,
  addGeofence,
  updateGeofence,
  deleteGeofence,
  getLocationLists,
  addLocationList,
  deleteLocationList,
  type Geofence,
  type LocationList,
} from "@/lib/zeke-api-adapter";
import {
  generateGeofenceId,
  calculateDistanceToGeofence,
  formatRadius,
  getActionTypeLabel,
  getTriggerLabel,
} from "@/lib/geofence";

type TabType = "current" | "history" | "starred" | "geofences";

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<GeoStackParamList>>();

  const [activeTab, setActiveTab] = useState<TabType>("current");
  const [locationHistory, setLocationHistory] = useState<LocationRecord[]>([]);
  const [starredPlaces, setStarredPlaces] = useState<StarredPlace[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingStarred, setIsLoadingStarred] = useState(false);
  const [isLoadingGeofences, setIsLoadingGeofences] = useState(false);
  const [showAddGeofenceModal, setShowAddGeofenceModal] = useState(false);
  const [editingGeofence, setEditingGeofence] = useState<Geofence | null>(null);
  const [geofenceName, setGeofenceName] = useState("");
  const [geofenceRadius, setGeofenceRadius] = useState("500");
  const [geofenceActionType, setGeofenceActionType] =
    useState<Geofence["actionType"]>("notification");
  const [geofenceTriggerOn, setGeofenceTriggerOn] =
    useState<Geofence["triggerOn"]>("enter");
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");

  const [locationLists, setLocationLists] = useState<LocationList[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | undefined>(
    undefined,
  );
  const [isHomeLocation, setIsHomeLocation] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListRadius, setNewListRadius] = useState("500");
  const [newListActionType, setNewListActionType] =
    useState<LocationList["actionType"]>("notification");

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

  const [monitoringEnabled, setMonitoringEnabled] = useState(false);

  const {
    isMonitoring,
    nearbyGeofences,
    lastTrigger,
    hasNotificationPermission,
    requestPermission: requestNotificationPermission,
  } = useGeofenceMonitor(monitoringEnabled && permissionStatus === "granted");

  const handleToggleMonitoring = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!monitoringEnabled) {
      // First, ensure location permission is granted
      if (permissionStatus !== "granted") {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert(
            "Location Permission Required",
            "Geofence monitoring requires location access. Please enable location permissions to use this feature.",
          );
          return;
        }
      }
      // Then request notification permission
      if (!hasNotificationPermission) {
        const notifGranted = await requestNotificationPermission();
        if (!notifGranted) {
          Alert.alert(
            "Notifications Disabled",
            "Geofence monitoring is enabled but you won't receive alerts. Enable notifications in Settings for the full experience.",
            [{ text: "OK" }],
          );
        }
      }
      setMonitoringEnabled(true);
    } else {
      setMonitoringEnabled(false);
    }
  }, [
    monitoringEnabled,
    hasNotificationPermission,
    requestNotificationPermission,
    permissionStatus,
    requestPermission,
  ]);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const history = await getLocationHistory();
      setLocationHistory(history);
    } catch (error) {
      console.error("Error loading location history:", error);
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
      console.error("Error loading starred places:", error);
    } finally {
      setIsLoadingStarred(false);
    }
  }, []);

  const loadGeofences = useCallback(async () => {
    setIsLoadingGeofences(true);
    try {
      const fences = await getGeofences();
      setGeofences(fences);
    } catch (error) {
      console.error("Error loading geofences:", error);
    } finally {
      setIsLoadingGeofences(false);
    }
  }, []);

  const loadLocationLists = useCallback(async () => {
    setIsLoadingLists(true);
    try {
      const lists = await getLocationLists();
      setLocationLists(lists);
    } catch (error) {
      console.error("Error loading location lists:", error);
    } finally {
      setIsLoadingLists(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    } else if (activeTab === "starred") {
      loadStarredPlaces();
    } else if (activeTab === "geofences") {
      loadGeofences();
      loadLocationLists();
    }
  }, [
    activeTab,
    loadHistory,
    loadStarredPlaces,
    loadGeofences,
    loadLocationLists,
  ]);

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (activeTab === "current") {
      await refreshLocation();
    } else if (activeTab === "history") {
      await loadHistory();
    } else if (activeTab === "starred") {
      await loadStarredPlaces();
    } else if (activeTab === "geofences") {
      await loadGeofences();
    }
  }, [
    activeTab,
    refreshLocation,
    loadHistory,
    loadStarredPlaces,
    loadGeofences,
  ]);

  const resetGeofenceForm = useCallback(() => {
    setGeofenceName("");
    setGeofenceRadius("500");
    setGeofenceActionType("notification");
    setGeofenceTriggerOn("enter");
    setUseCurrentLocation(true);
    setManualLat("");
    setManualLon("");
    setEditingGeofence(null);
    setSelectedListId(undefined);
    setIsHomeLocation(false);
  }, []);

  const resetListForm = useCallback(() => {
    setNewListName("");
    setNewListRadius("500");
    setNewListActionType("notification");
  }, []);

  const getListById = useCallback(
    (listId: string | undefined) => {
      if (!listId) return null;
      return locationLists.find((l) => l.id === listId) || null;
    },
    [locationLists],
  );

  const handleQuickAddAsGroceryStore = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGeofenceActionType("grocery_prompt");
    setGeofenceRadius("500");
    setGeofenceTriggerOn("enter");
    setIsHomeLocation(false);

    const groceryList = locationLists.find((l) =>
      l.name.toLowerCase().includes("grocery"),
    );
    if (groceryList) {
      setSelectedListId(groceryList.id);
    }
  }, [locationLists]);

  const handleQuickSetAsHome = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGeofenceName("Home");
    setGeofenceActionType("custom");
    setGeofenceRadius("200");
    setGeofenceTriggerOn("both");
    setIsHomeLocation(true);
    setUseCurrentLocation(true);
  }, []);

  const handleSaveLocationList = useCallback(async () => {
    if (!newListName.trim()) {
      Alert.alert("Error", "Please enter a name for the list.");
      return;
    }

    const radius = parseInt(newListRadius, 10);
    if (isNaN(radius) || radius < 50) {
      Alert.alert(
        "Error",
        "Please enter a valid default radius (minimum 50m).",
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const newList: LocationList = {
        id: `list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: newListName.trim(),
        defaultRadius: radius,
        actionType: newListActionType,
        isActive: true,
        geofenceIds: [],
        createdAt: new Date().toISOString(),
      };
      await addLocationList(newList);
      setLocationLists((prev) => [newList, ...prev]);
      setShowAddListModal(false);
      resetListForm();
    } catch (error) {
      console.error("Error saving location list:", error);
      Alert.alert("Error", "Failed to save location list. Please try again.");
    }
  }, [newListName, newListRadius, newListActionType, resetListForm]);

  const handleDeleteLocationList = useCallback(async (list: LocationList) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const confirmDelete = async () => {
      try {
        await deleteLocationList(list.id);
        setLocationLists((prev) => prev.filter((l) => l.id !== list.id));
      } catch (error) {
        console.error("Error deleting location list:", error);
        Alert.alert("Error", "Failed to delete location list.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete list "${list.name}"?`)) {
        await confirmDelete();
      }
    } else {
      Alert.alert("Delete List", `Delete "${list.name}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: confirmDelete },
      ]);
    }
  }, []);

  const handleOpenAddGeofence = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetGeofenceForm();
    setShowAddGeofenceModal(true);
  }, [resetGeofenceForm]);

  const handleEditGeofence = useCallback((geofence: Geofence) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingGeofence(geofence);
    setGeofenceName(geofence.name);
    setGeofenceRadius(geofence.radius.toString());
    setGeofenceActionType(geofence.actionType);
    setGeofenceTriggerOn(geofence.triggerOn);
    setUseCurrentLocation(false);
    setManualLat(geofence.latitude.toString());
    setManualLon(geofence.longitude.toString());
    setSelectedListId(geofence.listId);
    setIsHomeLocation(!!geofence.isHome);
    setShowAddGeofenceModal(true);
  }, []);

  const handleSaveGeofence = useCallback(async () => {
    if (!geofenceName.trim()) {
      Alert.alert("Error", "Please enter a name for the geofence.");
      return;
    }

    const radius = parseInt(geofenceRadius, 10);
    if (isNaN(radius) || radius < 50) {
      Alert.alert("Error", "Please enter a valid radius (minimum 50m).");
      return;
    }

    let lat: number;
    let lon: number;

    if (useCurrentLocation) {
      if (!location) {
        Alert.alert(
          "Error",
          "Current location not available. Please enable location or enter coordinates manually.",
        );
        return;
      }
      lat = location.latitude;
      lon = location.longitude;
    } else {
      lat = parseFloat(manualLat);
      lon = parseFloat(manualLon);
      if (isNaN(lat) || isNaN(lon)) {
        Alert.alert("Error", "Please enter valid coordinates.");
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (editingGeofence) {
        const updated = await updateGeofence(editingGeofence.id, {
          name: geofenceName.trim(),
          latitude: lat,
          longitude: lon,
          radius,
          actionType: geofenceActionType,
          triggerOn: geofenceTriggerOn,
          listId: selectedListId,
          isHome: isHomeLocation,
        });
        if (updated) {
          setGeofences((prev) =>
            prev.map((g) => (g.id === updated.id ? updated : g)),
          );
        }
      } else {
        const newGeofence: Geofence = {
          id: generateGeofenceId(),
          name: geofenceName.trim(),
          latitude: lat,
          longitude: lon,
          radius,
          triggerOn: geofenceTriggerOn,
          isActive: true,
          actionType: geofenceActionType,
          listId: selectedListId,
          isHome: isHomeLocation,
          createdAt: new Date().toISOString(),
        };
        await addGeofence(newGeofence);
        setGeofences((prev) => [newGeofence, ...prev]);
      }
      setShowAddGeofenceModal(false);
      resetGeofenceForm();
    } catch (error) {
      console.error("Error saving geofence:", error);
      Alert.alert("Error", "Failed to save geofence. Please try again.");
    }
  }, [
    geofenceName,
    geofenceRadius,
    geofenceActionType,
    geofenceTriggerOn,
    useCurrentLocation,
    location,
    manualLat,
    manualLon,
    editingGeofence,
    resetGeofenceForm,
    selectedListId,
    isHomeLocation,
  ]);

  const handleDeleteGeofence = useCallback(async (geofence: Geofence) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const confirmDelete = async () => {
      try {
        await deleteGeofence(geofence.id);
        setGeofences((prev) => prev.filter((g) => g.id !== geofence.id));
      } catch (error) {
        console.error("Error deleting geofence:", error);
        Alert.alert("Error", "Failed to delete geofence.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete geofence "${geofence.name}"?`)) {
        await confirmDelete();
      }
    } else {
      Alert.alert("Delete Geofence", `Delete "${geofence.name}"?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: confirmDelete },
      ]);
    }
  }, []);

  const handleToggleGeofenceActive = useCallback(async (geofence: Geofence) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const updated = await updateGeofence(geofence.id, {
        isActive: !geofence.isActive,
      });
      if (updated) {
        setGeofences((prev) =>
          prev.map((g) => (g.id === updated.id ? updated : g)),
        );
      }
    } catch (error) {
      console.error("Error toggling geofence:", error);
    }
  }, []);

  const handleStarCurrentLocation = useCallback(async () => {
    if (!location || !geocoded) {
      Alert.alert("No Location", "Unable to get current location to star.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const placeName = geocoded.city || geocoded.region || "My Location";

    const newPlace: StarredPlace = {
      id: generateLocationId(),
      name: placeName,
      location,
      geocoded,
      createdAt: new Date().toISOString(),
    };

    try {
      await addStarredPlace(newPlace);
      setStarredPlaces((prev) => [newPlace, ...prev]);

      if (Platform.OS === "web") {
        window.alert(`${placeName} has been starred!`);
      } else {
        Alert.alert(
          "Location Starred",
          `${placeName} has been saved to your starred places.`,
        );
      }
    } catch (error) {
      console.error("Error starring location:", error);
      Alert.alert("Error", "Failed to star location. Please try again.");
    }
  }, [location, geocoded]);

  const handleRemoveStarredPlace = useCallback(
    async (placeId: string, placeName: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const confirmRemove = async () => {
        try {
          await removeStarredPlace(placeId);
          setStarredPlaces((prev) => prev.filter((p) => p.id !== placeId));
        } catch (error) {
          console.error("Error removing starred place:", error);
          Alert.alert("Error", "Failed to remove starred place.");
        }
      };

      if (Platform.OS === "web") {
        if (window.confirm(`Remove ${placeName} from starred places?`)) {
          await confirmRemove();
        }
      } else {
        Alert.alert(
          "Remove Starred Place",
          `Remove ${placeName} from your starred places?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: confirmRemove },
          ],
        );
      }
    },
    [],
  );

  const handleToggleTracking = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isTracking) {
      stopTracking();
    } else {
      await startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  const renderTabButton = (
    tab: TabType,
    label: string,
    icon: keyof typeof Feather.glyphMap,
  ) => (
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
        size={16}
        color={activeTab === tab ? Colors.dark.primary : theme.textSecondary}
      />
      <ThemedText
        type="caption"
        style={[
          styles.tabLabel,
          {
            color:
              activeTab === tab ? Colors.dark.primary : theme.textSecondary,
          },
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
            <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>
              Current Location
            </ThemedText>
          </View>
          <View style={styles.statusBadge}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : permissionStatus === "granted" && location ? (
              <>
                <PulsingDot color={Colors.dark.success} size={8} />
                <ThemedText
                  type="caption"
                  style={{ marginLeft: Spacing.xs, color: Colors.dark.success }}
                >
                  Active
                </ThemedText>
              </>
            ) : (
              <ThemedText type="caption" style={{ color: Colors.dark.warning }}>
                {permissionStatus === "denied" ? "Denied" : "Inactive"}
              </ThemedText>
            )}
          </View>
        </View>

        {permissionStatus === "granted" && location ? (
          <>
            <View style={styles.locationDetails}>
              <ThemedText type="h3" style={{ marginBottom: Spacing.xs }}>
                {geocoded?.formattedAddress || "Getting address..."}
              </ThemedText>
              <ThemedText type="caption" secondary>
                {formatCoordinates(location.latitude, location.longitude)}
              </ThemedText>
              <ThemedText
                type="caption"
                secondary
                style={{ marginTop: Spacing.xs }}
              >
                Last updated: {lastUpdated || "Just now"}
              </ThemedText>
              {location.accuracy !== null && (
                <ThemedText
                  type="caption"
                  secondary
                  style={{ marginTop: Spacing.xs }}
                >
                  Accuracy: {Math.round(location.accuracy)}m
                </ThemedText>
              )}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleRefresh}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: `${Colors.dark.primary}20`,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather
                  name="refresh-cw"
                  size={18}
                  color={Colors.dark.primary}
                />
                <ThemedText
                  type="small"
                  style={{ marginLeft: Spacing.xs, color: Colors.dark.primary }}
                >
                  Refresh
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleStarCurrentLocation}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: `${Colors.dark.accent}20`,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather name="star" size={18} color={Colors.dark.accent} />
                <ThemedText
                  type="small"
                  style={{ marginLeft: Spacing.xs, color: Colors.dark.accent }}
                >
                  Star
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleToggleTracking}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: isTracking
                      ? `${Colors.dark.error}20`
                      : `${Colors.dark.success}20`,
                    opacity: pressed ? 0.7 : 1,
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
                    color: isTracking ? Colors.dark.error : Colors.dark.success,
                  }}
                >
                  {isTracking ? "Stop" : "Track"}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("Map");
                }}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: `${Colors.dark.secondary}20`,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Feather name="map" size={18} color={Colors.dark.secondary} />
                <ThemedText
                  type="small"
                  style={{
                    marginLeft: Spacing.xs,
                    color: Colors.dark.secondary,
                  }}
                >
                  Map
                </ThemedText>
              </Pressable>
            </View>
          </>
        ) : permissionStatus === "denied" ? (
          <View style={styles.permissionContainer}>
            <Feather name="alert-circle" size={48} color={Colors.dark.error} />
            <ThemedText
              type="body"
              style={{ marginTop: Spacing.md, textAlign: "center" }}
            >
              Location access denied
            </ThemedText>
            <ThemedText
              type="caption"
              secondary
              style={{ marginTop: Spacing.xs, textAlign: "center" }}
            >
              {Platform.OS !== "web"
                ? "Please enable location in your device settings."
                : "Enable location access in your browser."}
            </ThemedText>
            {Platform.OS !== "web" && (
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
                  <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                    Open Settings
                  </ThemedText>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.permissionContainer}>
            <Feather name="map-pin" size={48} color={Colors.dark.primary} />
            <ThemedText
              type="body"
              style={{ marginTop: Spacing.md, textAlign: "center" }}
            >
              Enable Location Access
            </ThemedText>
            <ThemedText
              type="caption"
              secondary
              style={{ marginTop: Spacing.xs, textAlign: "center" }}
            >
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
                <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                  Enable Location
                </ThemedText>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>

      <View
        style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }]}
      >
        <View style={styles.infoRow}>
          <Feather name="info" size={16} color={theme.textSecondary} />
          <ThemedText
            type="caption"
            secondary
            style={{ marginLeft: Spacing.sm, flex: 1 }}
          >
            ZEKE uses GPS for accurate location tracking. Your location data is
            stored locally and synced with your ZEKE account.
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
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Feather name="clock" size={48} color={theme.textSecondary} />
          <ThemedText
            type="body"
            secondary
            style={{ marginTop: Spacing.md, textAlign: "center" }}
          >
            No location history yet
          </ThemedText>
          <ThemedText
            type="caption"
            secondary
            style={{ marginTop: Spacing.xs, textAlign: "center" }}
          >
            Your location history will appear here as ZEKE tracks your
            movements.
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
                {record.geocoded?.formattedAddress ||
                  formatCoordinates(
                    record.location.latitude,
                    record.location.longitude,
                  )}
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
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Feather name="star" size={48} color={theme.textSecondary} />
          <ThemedText
            type="body"
            secondary
            style={{ marginTop: Spacing.md, textAlign: "center" }}
          >
            No starred places yet
          </ThemedText>
          <ThemedText
            type="caption"
            secondary
            style={{ marginTop: Spacing.xs, textAlign: "center" }}
          >
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
                place.location.longitude,
              )
            : null;

          return (
            <Pressable
              key={place.id}
              onLongPress={() => handleRemoveStarredPlace(place.id, place.name)}
              style={({ pressed }) => [
                styles.starredItem,
                {
                  backgroundColor: theme.backgroundDefault,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.starredIconContainer,
                  { backgroundColor: `${Colors.dark.accent}20` },
                ]}
              >
                <Feather name="star" size={20} color={Colors.dark.accent} />
              </View>
              <View style={styles.starredContent}>
                <ThemedText type="body" numberOfLines={1}>
                  {place.name}
                </ThemedText>
                <ThemedText type="caption" secondary numberOfLines={1}>
                  {place.geocoded?.formattedAddress ||
                    formatCoordinates(
                      place.location.latitude,
                      place.location.longitude,
                    )}
                </ThemedText>
                {distance !== null && (
                  <ThemedText
                    type="caption"
                    style={{ color: Colors.dark.primary, marginTop: 2 }}
                  >
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

  const renderGeofences = () => (
    <View style={styles.sectionContent}>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Feather
              name="radio"
              size={20}
              color={isMonitoring ? Colors.dark.success : theme.textSecondary}
            />
            <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>
              Geofence Monitoring
            </ThemedText>
          </View>
          <View style={styles.statusBadge}>
            {isMonitoring ? (
              <>
                <PulsingDot color={Colors.dark.success} size={8} />
                <ThemedText
                  type="caption"
                  style={{ marginLeft: Spacing.xs, color: Colors.dark.success }}
                >
                  Active
                </ThemedText>
              </>
            ) : (
              <ThemedText type="caption" secondary>
                Inactive
              </ThemedText>
            )}
          </View>
        </View>

        <View style={styles.monitoringToggleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body">Enable Monitoring</ThemedText>
            <ThemedText type="caption" secondary style={{ marginTop: 2 }}>
              Get notified when entering or leaving geofences
            </ThemedText>
          </View>
          <Switch
            value={monitoringEnabled}
            onValueChange={handleToggleMonitoring}
            trackColor={{ false: theme.border, true: Colors.dark.primary }}
            thumbColor={
              monitoringEnabled ? Colors.dark.success : theme.textSecondary
            }
            disabled={permissionStatus !== "granted"}
          />
        </View>

        {lastTrigger ? (
          <View
            style={[
              styles.lastTriggerCard,
              { backgroundColor: `${Colors.dark.primary}10` },
            ]}
          >
            <Feather
              name={lastTrigger.event === "enter" ? "log-in" : "log-out"}
              size={16}
              color={Colors.dark.primary}
            />
            <View style={{ marginLeft: Spacing.sm, flex: 1 }}>
              <ThemedText type="small">
                {lastTrigger.event === "enter" ? "Entered" : "Left"}{" "}
                {lastTrigger.geofenceName}
              </ThemedText>
              <ThemedText type="caption" secondary>
                {new Date(lastTrigger.timestamp).toLocaleTimeString()}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {nearbyGeofences.length > 0 ? (
          <View style={{ marginTop: Spacing.md }}>
            <ThemedText
              type="caption"
              secondary
              style={{ marginBottom: Spacing.xs }}
            >
              Nearby Geofences ({nearbyGeofences.length})
            </ThemedText>
            {nearbyGeofences.slice(0, 3).map(({ geofence, distance }) => (
              <View key={geofence.id} style={styles.nearbyGeofenceItem}>
                <Feather name="target" size={14} color={theme.textSecondary} />
                <ThemedText
                  type="small"
                  style={{ marginLeft: Spacing.xs, flex: 1 }}
                  numberOfLines={1}
                >
                  {geofence.name}
                </ThemedText>
                <ThemedText
                  type="caption"
                  style={{ color: Colors.dark.primary }}
                >
                  {distance < 1000
                    ? `${Math.round(distance)}m`
                    : `${(distance / 1000).toFixed(1)}km`}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: `${Colors.dark.warning}10`,
              marginTop: Spacing.md,
            },
          ]}
        >
          <View style={styles.infoRow}>
            <Feather name="info" size={14} color={Colors.dark.warning} />
            <ThemedText
              type="caption"
              style={{
                marginLeft: Spacing.sm,
                flex: 1,
                color: Colors.dark.warning,
              }}
            >
              Background monitoring requires a native build. In Expo Go,
              monitoring only works while the app is open.
            </ThemedText>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundDefault, marginTop: Spacing.md },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Feather name="folder" size={20} color={Colors.dark.accent} />
            <ThemedText type="h4" style={{ marginLeft: Spacing.sm }}>
              Location Lists
            </ThemedText>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddListModal(true);
            }}
            hitSlop={10}
          >
            <Feather name="plus" size={20} color={Colors.dark.primary} />
          </Pressable>
        </View>

        {isLoadingLists ? (
          <ActivityIndicator size="small" color={Colors.dark.primary} />
        ) : locationLists.length === 0 ? (
          <View style={{ paddingVertical: Spacing.md }}>
            <ThemedText type="body" secondary style={{ textAlign: "center" }}>
              No location lists yet
            </ThemedText>
            <ThemedText
              type="caption"
              secondary
              style={{ textAlign: "center", marginTop: Spacing.xs }}
            >
              Create lists to group geofences (e.g., Grocery Stores)
            </ThemedText>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNewListName("Grocery Stores");
                setNewListRadius("500");
                setNewListActionType("grocery_prompt");
                setShowAddListModal(true);
              }}
              style={({ pressed }) => [
                {
                  backgroundColor: `${Colors.dark.success}20`,
                  paddingVertical: Spacing.sm,
                  paddingHorizontal: Spacing.md,
                  borderRadius: BorderRadius.sm,
                  alignSelf: "center",
                  marginTop: Spacing.md,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: Colors.dark.success }}>
                Create Grocery Stores List
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: Spacing.sm }}>
            {locationLists.map((list) => (
              <View
                key={list.id}
                style={[
                  styles.nearbyGeofenceItem,
                  { paddingVertical: Spacing.sm },
                ]}
              >
                <Feather
                  name="folder"
                  size={16}
                  color={
                    list.actionType === "grocery_prompt"
                      ? Colors.dark.success
                      : Colors.dark.accent
                  }
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <ThemedText type="small">{list.name}</ThemedText>
                  <ThemedText type="caption" secondary>
                    {getActionTypeLabel(list.actionType)} -{" "}
                    {formatRadius(list.defaultRadius)}
                  </ThemedText>
                </View>
                <ThemedText
                  type="caption"
                  secondary
                  style={{ marginRight: Spacing.sm }}
                >
                  {list.geofenceIds?.length || 0} places
                </ThemedText>
                <Pressable
                  onPress={() => handleDeleteLocationList(list)}
                  hitSlop={10}
                >
                  <Feather name="trash-2" size={16} color={Colors.dark.error} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {isLoadingGeofences ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
          <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
            Loading geofences...
          </ThemedText>
        </View>
      ) : geofences.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <Feather name="target" size={48} color={theme.textSecondary} />
          <ThemedText
            type="body"
            secondary
            style={{ marginTop: Spacing.md, textAlign: "center" }}
          >
            No geofences yet
          </ThemedText>
          <ThemedText
            type="caption"
            secondary
            style={{ marginTop: Spacing.xs, textAlign: "center" }}
          >
            Create geofences to trigger actions when you enter or leave
            locations.
          </ThemedText>
          <Pressable
            onPress={handleOpenAddGeofence}
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
              <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                Add Geofence
              </ThemedText>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <>
          {geofences.map((geofence) => {
            const distance = location
              ? calculateDistanceToGeofence(
                  {
                    latitude: location.latitude,
                    longitude: location.longitude,
                  },
                  geofence,
                )
              : null;
            const geofenceList = getListById(geofence.listId);

            return (
              <Pressable
                key={geofence.id}
                onPress={() => handleEditGeofence(geofence)}
                style={({ pressed }) => [
                  styles.geofenceItem,
                  {
                    backgroundColor: theme.backgroundDefault,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.geofenceIconContainer,
                    {
                      backgroundColor: geofence.isActive
                        ? `${Colors.dark.primary}20`
                        : `${theme.textSecondary}20`,
                    },
                  ]}
                >
                  <Feather
                    name="target"
                    size={20}
                    color={
                      geofence.isActive
                        ? Colors.dark.primary
                        : theme.textSecondary
                    }
                  />
                </View>
                <View style={styles.geofenceContent}>
                  <ThemedText type="body" numberOfLines={1}>
                    {geofence.name}
                  </ThemedText>
                  {geofenceList ? (
                    <ThemedText
                      type="caption"
                      style={{ color: Colors.dark.success, marginTop: 2 }}
                    >
                      {geofenceList.name}
                    </ThemedText>
                  ) : null}
                  <View style={styles.geofenceMetaRow}>
                    <View
                      style={[
                        styles.geofenceBadge,
                        { backgroundColor: `${Colors.dark.secondary}20` },
                      ]}
                    >
                      <ThemedText
                        type="caption"
                        style={{ color: Colors.dark.secondary }}
                      >
                        {formatRadius(geofence.radius)}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.geofenceBadge,
                        { backgroundColor: `${Colors.dark.accent}20` },
                      ]}
                    >
                      <ThemedText
                        type="caption"
                        style={{ color: Colors.dark.accent }}
                      >
                        {getActionTypeLabel(geofence.actionType)}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.geofenceBadge,
                        { backgroundColor: `${theme.textSecondary}20` },
                      ]}
                    >
                      <ThemedText type="caption" secondary>
                        {getTriggerLabel(geofence.triggerOn)}
                      </ThemedText>
                    </View>
                  </View>
                  {distance !== null ? (
                    <ThemedText
                      type="caption"
                      style={{ color: Colors.dark.primary, marginTop: 4 }}
                    >
                      {formatDistance(distance)} away
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.geofenceActions}>
                  <Pressable
                    onPress={() => handleToggleGeofenceActive(geofence)}
                    hitSlop={10}
                    style={{ marginRight: Spacing.sm }}
                  >
                    <Feather
                      name={geofence.isActive ? "toggle-right" : "toggle-left"}
                      size={24}
                      color={
                        geofence.isActive
                          ? Colors.dark.success
                          : theme.textSecondary
                      }
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteGeofence(geofence)}
                    hitSlop={10}
                  >
                    <Feather
                      name="trash-2"
                      size={18}
                      color={Colors.dark.error}
                    />
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );

  const renderAddGeofenceModal = () => (
    <>
      <Modal
        visible={showAddGeofenceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowAddGeofenceModal(false);
          resetGeofenceForm();
        }}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: theme.border, paddingTop: insets.top + Spacing.md }]}
          >
            <Pressable
              onPress={() => {
                setShowAddGeofenceModal(false);
                resetGeofenceForm();
              }}
              hitSlop={10}
            >
              <ThemedText type="body" style={{ color: Colors.dark.primary }}>
                Cancel
              </ThemedText>
            </Pressable>
            <ThemedText type="h4">
              {editingGeofence ? "Edit Geofence" : "Add Geofence"}
            </ThemedText>
            <Pressable onPress={handleSaveGeofence} hitSlop={10}>
              <ThemedText
                type="body"
                style={{ color: Colors.dark.primary, fontWeight: "600" }}
              >
                Save
              </ThemedText>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalContent}
          >
            {!editingGeofence && location ? (
              <View style={{ marginBottom: Spacing.lg }}>
                <Pressable
                  onPress={handleQuickSetAsHome}
                  style={({ pressed }) => [
                    {
                      backgroundColor: isHomeLocation
                        ? `${Colors.dark.primary}30`
                        : `${Colors.dark.primary}15`,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.lg,
                      borderRadius: BorderRadius.md,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: Spacing.sm,
                      borderWidth: isHomeLocation ? 2 : 1,
                      borderColor: Colors.dark.primary,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather
                    name="home"
                    size={18}
                    color={Colors.dark.primary}
                  />
                  <ThemedText
                    type="body"
                    style={{
                      marginLeft: Spacing.sm,
                      color: Colors.dark.primary,
                      fontWeight: "600",
                    }}
                  >
                    {isHomeLocation ? "Home Location Selected" : "Set as Home"}
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={handleQuickAddAsGroceryStore}
                  style={({ pressed }) => [
                    {
                      backgroundColor: `${Colors.dark.success}20`,
                      paddingVertical: Spacing.md,
                      paddingHorizontal: Spacing.lg,
                      borderRadius: BorderRadius.md,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: Colors.dark.success,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather
                    name="shopping-cart"
                    size={18}
                    color={Colors.dark.success}
                  />
                  <ThemedText
                    type="body"
                    style={{
                      marginLeft: Spacing.sm,
                      color: Colors.dark.success,
                      fontWeight: "600",
                    }}
                  >
                    Add as Grocery Store
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}

            {isHomeLocation ? (
              <View
                style={[
                  styles.homeAutomationsCard,
                  { backgroundColor: `${Colors.dark.primary}10` },
                ]}
              >
                <View style={styles.homeAutomationsHeader}>
                  <Feather name="zap" size={16} color={Colors.dark.primary} />
                  <ThemedText
                    type="small"
                    style={{
                      marginLeft: Spacing.xs,
                      color: Colors.dark.primary,
                      fontWeight: "600",
                    }}
                  >
                    Home Automations
                  </ThemedText>
                </View>
                <ThemedText
                  type="caption"
                  secondary
                  style={{ marginBottom: Spacing.sm }}
                >
                  When you arrive or leave home, ZEKE can:
                </ThemedText>
                <View style={styles.automationItem}>
                  <Feather
                    name="check-square"
                    size={14}
                    color={Colors.dark.success}
                  />
                  <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
                    Show HOME-tagged tasks and reminders
                  </ThemedText>
                </View>
                <View style={styles.automationItem}>
                  <Feather
                    name="calendar"
                    size={14}
                    color={Colors.dark.success}
                  />
                  <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
                    Display family events and activities
                  </ThemedText>
                </View>
                <View style={styles.automationItem}>
                  <Feather
                    name="message-circle"
                    size={14}
                    color={Colors.dark.success}
                  />
                  <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
                    Notify contacts when you arrive home
                  </ThemedText>
                </View>
                <View style={styles.automationItem}>
                  <Feather
                    name="bell"
                    size={14}
                    color={Colors.dark.success}
                  />
                  <ThemedText type="small" style={{ marginLeft: Spacing.xs }}>
                    Send departure reminders
                  </ThemedText>
                </View>
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Name
              </ThemedText>
              <TextInput
                value={geofenceName}
                onChangeText={setGeofenceName}
                placeholder="e.g., Home, Office, Grocery Store"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Location
              </ThemedText>
              <View style={styles.locationToggle}>
                <Pressable
                  onPress={() => setUseCurrentLocation(true)}
                  style={[
                    styles.locationToggleButton,
                    {
                      backgroundColor: useCurrentLocation
                        ? `${Colors.dark.primary}20`
                        : theme.backgroundDefault,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Feather
                    name="navigation"
                    size={16}
                    color={
                      useCurrentLocation
                        ? Colors.dark.primary
                        : theme.textSecondary
                    }
                  />
                  <ThemedText
                    type="small"
                    style={{
                      marginLeft: Spacing.xs,
                      color: useCurrentLocation
                        ? Colors.dark.primary
                        : theme.textSecondary,
                    }}
                  >
                    Current
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setUseCurrentLocation(false)}
                  style={[
                    styles.locationToggleButton,
                    {
                      backgroundColor: !useCurrentLocation
                        ? `${Colors.dark.primary}20`
                        : theme.backgroundDefault,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Feather
                    name="edit-3"
                    size={16}
                    color={
                      !useCurrentLocation
                        ? Colors.dark.primary
                        : theme.textSecondary
                    }
                  />
                  <ThemedText
                    type="small"
                    style={{
                      marginLeft: Spacing.xs,
                      color: !useCurrentLocation
                        ? Colors.dark.primary
                        : theme.textSecondary,
                    }}
                  >
                    Manual
                  </ThemedText>
                </Pressable>
              </View>
              {!useCurrentLocation && (
                <View style={styles.coordinateInputs}>
                  <TextInput
                    value={manualLat}
                    onChangeText={setManualLat}
                    placeholder="Latitude"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    style={[
                      styles.textInput,
                      styles.coordinateInput,
                      {
                        backgroundColor: theme.backgroundDefault,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                  <TextInput
                    value={manualLon}
                    onChangeText={setManualLon}
                    placeholder="Longitude"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="decimal-pad"
                    style={[
                      styles.textInput,
                      styles.coordinateInput,
                      {
                        backgroundColor: theme.backgroundDefault,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Radius (meters)
              </ThemedText>
              <TextInput
                value={geofenceRadius}
                onChangeText={setGeofenceRadius}
                placeholder="500"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Trigger On
              </ThemedText>
              <View style={styles.optionsRow}>
                {(["enter", "exit", "both"] as const).map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setGeofenceTriggerOn(option)}
                    style={[
                      styles.optionButton,
                      {
                        backgroundColor:
                          geofenceTriggerOn === option
                            ? `${Colors.dark.primary}20`
                            : theme.backgroundDefault,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={{
                        color:
                          geofenceTriggerOn === option
                            ? Colors.dark.primary
                            : theme.textSecondary,
                      }}
                    >
                      {getTriggerLabel(option)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Action Type
              </ThemedText>
              <View style={styles.optionsRow}>
                {(["notification", "grocery_prompt", "custom"] as const).map(
                  (option) => (
                    <Pressable
                      key={option}
                      onPress={() => setGeofenceActionType(option)}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor:
                            geofenceActionType === option
                              ? `${Colors.dark.accent}20`
                              : theme.backgroundDefault,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        style={{
                          color:
                            geofenceActionType === option
                              ? Colors.dark.accent
                              : theme.textSecondary,
                        }}
                      >
                        {getActionTypeLabel(option)}
                      </ThemedText>
                    </Pressable>
                  ),
                )}
              </View>
            </View>

            {locationLists.length > 0 ? (
              <View style={styles.formGroup}>
                <ThemedText type="small" secondary style={styles.formLabel}>
                  Add to List (optional)
                </ThemedText>
                <View style={styles.optionsRow}>
                  <Pressable
                    onPress={() => setSelectedListId(undefined)}
                    style={[
                      styles.optionButton,
                      {
                        backgroundColor: !selectedListId
                          ? `${Colors.dark.primary}20`
                          : theme.backgroundDefault,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={{
                        color: !selectedListId
                          ? Colors.dark.primary
                          : theme.textSecondary,
                      }}
                    >
                      None
                    </ThemedText>
                  </Pressable>
                  {locationLists.map((list) => (
                    <Pressable
                      key={list.id}
                      onPress={() => setSelectedListId(list.id)}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor:
                            selectedListId === list.id
                              ? `${Colors.dark.success}20`
                              : theme.backgroundDefault,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        style={{
                          color:
                            selectedListId === list.id
                              ? Colors.dark.success
                              : theme.textSecondary,
                        }}
                      >
                        {list.name}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Pressable onPress={handleSaveGeofence} style={{ marginTop: Spacing.lg }}>
              <LinearGradient
                colors={Gradients.primary}
                style={styles.saveButton}
              >
                <Feather name="check" size={20} color="#FFFFFF" />
                <ThemedText
                  type="body"
                  style={{
                    marginLeft: Spacing.sm,
                    color: "#FFFFFF",
                    fontWeight: "600",
                  }}
                >
                  {editingGeofence ? "Update Geofence" : "Save Geofence"}
                </ThemedText>
              </LinearGradient>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={showAddListModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowAddListModal(false);
          resetListForm();
        }}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: theme.border, paddingTop: insets.top + Spacing.md }]}
          >
            <Pressable
              onPress={() => {
                setShowAddListModal(false);
                resetListForm();
              }}
              hitSlop={10}
            >
              <ThemedText type="body" style={{ color: Colors.dark.primary }}>
                Cancel
              </ThemedText>
            </Pressable>
            <ThemedText type="h4">New Location List</ThemedText>
            <Pressable onPress={handleSaveLocationList} hitSlop={10}>
              <ThemedText
                type="body"
                style={{ color: Colors.dark.primary, fontWeight: "600" }}
              >
                Save
              </ThemedText>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalContent}
          >
            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                List Name
              </ThemedText>
              <TextInput
                value={newListName}
                onChangeText={setNewListName}
                placeholder="e.g., Grocery Stores, Coffee Shops"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Default Radius (meters)
              </ThemedText>
              <TextInput
                value={newListRadius}
                onChangeText={setNewListRadius}
                placeholder="500"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText type="small" secondary style={styles.formLabel}>
                Default Action Type
              </ThemedText>
              <View style={styles.optionsRow}>
                {(["notification", "grocery_prompt", "custom"] as const).map(
                  (option) => (
                    <Pressable
                      key={option}
                      onPress={() => setNewListActionType(option)}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor:
                            newListActionType === option
                              ? `${Colors.dark.accent}20`
                              : theme.backgroundDefault,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <ThemedText
                        type="small"
                        style={{
                          color:
                            newListActionType === option
                              ? Colors.dark.accent
                              : theme.textSecondary,
                        }}
                      >
                        {getActionTypeLabel(option)}
                      </ThemedText>
                    </Pressable>
                  ),
                )}
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl + 80,
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

        <View
          style={[
            styles.tabContainer,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          {renderTabButton("current", "Current", "navigation")}
          {renderTabButton("history", "History", "clock")}
          {renderTabButton("starred", "Starred", "star")}
          {renderTabButton("geofences", "Fences", "target")}
        </View>

        {activeTab === "current" && renderCurrentLocation()}
        {activeTab === "history" && renderLocationHistory()}
        {activeTab === "starred" && renderStarredPlaces()}
        {activeTab === "geofences" && renderGeofences()}
      </ScrollView>

      {activeTab === "geofences" && geofences.length > 0 && (
        <FloatingActionButton
          onPress={handleOpenAddGeofence}
          bottom={insets.bottom + Spacing.xl}
        />
      )}

      {renderAddGeofenceModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: Spacing.lg,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationDetails: {
    marginBottom: Spacing.lg,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginHorizontal: Spacing.xs,
  },
  permissionContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  enableButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  enableButtonGradient: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
  },
  infoCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  emptyCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  historyContent: {
    flex: 1,
  },
  starredItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  starredIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  starredContent: {
    flex: 1,
  },
  geofenceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  geofenceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  geofenceContent: {
    flex: 1,
  },
  geofenceMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  geofenceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  geofenceActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  formLabel: {
    marginBottom: Spacing.sm,
  },
  textInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 16,
  },
  locationToggle: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  locationToggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  coordinateInputs: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  coordinateInput: {
    flex: 1,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  monitoringToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  lastTriggerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  nearbyGeofenceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  homeAutomationsCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  homeAutomationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  automationItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
