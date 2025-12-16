import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  SectionList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { queryClient, isZekeSyncMode, getApiUrl } from "@/lib/query-client";
import {
  getGroceryItems,
  addGroceryItem,
  toggleGroceryPurchased,
  deleteGroceryItem,
  chatWithZeke,
  type ZekeGroceryItem,
} from "@/lib/zeke-api-adapter";

type FilterType = "all" | "unpurchased";

const CATEGORY_ORDER = [
  "Produce",
  "Dairy",
  "Meat",
  "Seafood",
  "Bakery",
  "Pantry",
  "Frozen",
  "Beverages",
  "Snacks",
  "Other",
];

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    Produce: "#10B981",
    Dairy: "#3B82F6",
    Meat: "#EF4444",
    Seafood: "#06B6D4",
    Bakery: "#F59E0B",
    Pantry: "#8B5CF6",
    Frozen: "#6366F1",
    Beverages: "#EC4899",
    Snacks: "#F97316",
    Other: "#94A3B8",
  };
  return colors[category] || colors.Other;
}

interface GroceryItemRowProps {
  item: ZekeGroceryItem;
  onToggle: (id: string, purchased: boolean) => void;
  onDelete: (id: string) => void;
  theme: any;
}

function GroceryItemRow({ item, onToggle, onDelete, theme }: GroceryItemRowProps) {
  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(item.id, !item.isPurchased);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete Item",
      `Remove "${item.name}" from your grocery list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(item.id),
        },
      ]
    );
  };

  const categoryColor = getCategoryColor(item.category || "Other");

  return (
    <Pressable
      onPress={handleToggle}
      onLongPress={handleDelete}
      style={[
        styles.itemRow,
        { backgroundColor: theme.backgroundSecondary },
        item.isPurchased && styles.itemRowPurchased,
      ]}
    >
      <View style={styles.checkbox}>
        {item.isPurchased ? (
          <View style={[styles.checkboxChecked, { backgroundColor: Colors.dark.success }]}>
            <Feather name="check" size={14} color="#fff" />
          </View>
        ) : (
          <View style={[styles.checkboxUnchecked, { borderColor: theme.textSecondary }]} />
        )}
      </View>
      <View style={styles.itemContent}>
        <ThemedText
          style={[
            styles.itemName,
            item.isPurchased && styles.itemNamePurchased,
          ]}
        >
          {item.name}
        </ThemedText>
        {item.quantity || item.unit ? (
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {item.quantity ? `${item.quantity}` : ""}
            {item.quantity && item.unit ? " " : ""}
            {item.unit || ""}
          </ThemedText>
        ) : null}
      </View>
      {item.category ? (
        <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}20` }]}>
          <ThemedText style={[styles.categoryText, { color: categoryColor }]}>
            {item.category}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function GroceryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const isSyncMode = isZekeSyncMode();

  const [filter, setFilter] = useState<FilterType>("all");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  const {
    data: groceryItems = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ZekeGroceryItem[]>({
    queryKey: ["grocery-items"],
    queryFn: getGroceryItems,
    enabled: isSyncMode,
  });

  const addMutation = useMutation({
    mutationFn: (data: { name: string; quantity?: number; unit?: string; category?: string }) =>
      addGroceryItem(data.name, data.quantity, data.unit, data.category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-items"] });
      setIsAddModalVisible(false);
      resetForm();
    },
    onError: (error) => {
      Alert.alert("Error", "Failed to add item. Please try again.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, purchased }: { id: string; purchased: boolean }) =>
      toggleGroceryPurchased(id, purchased),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-items"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update item. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroceryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grocery-items"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete item. Please try again.");
    },
  });

  const resetForm = () => {
    setNewItemName("");
    setNewItemQuantity("");
    setNewItemUnit("");
    setNewItemCategory("");
  };

  const handleAddItem = () => {
    if (!newItemName.trim()) {
      Alert.alert("Error", "Please enter an item name.");
      return;
    }

    addMutation.mutate({
      name: newItemName.trim(),
      quantity: newItemQuantity ? parseFloat(newItemQuantity) : undefined,
      unit: newItemUnit.trim() || undefined,
      category: newItemCategory.trim() || undefined,
    });
  };

  const handleToggle = useCallback((id: string, purchased: boolean) => {
    toggleMutation.mutate({ id, purchased });
  }, [toggleMutation]);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const handleVoiceRecordingComplete = async (audioUri: string, durationSeconds: number) => {
    setIsProcessingVoice(true);
    try {
      const response = await chatWithZeke(
        "I just recorded a voice message to add items to my grocery list. Please help me add the items I mentioned.",
        "mobile-app"
      );
      await refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        "Voice Input",
        "Voice input was recorded. To add items via voice, please use the Chat feature and say something like 'Add eggs and milk to my grocery list'."
      );
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (filter === "unpurchased") {
      return groceryItems.filter((item) => !item.isPurchased);
    }
    return groceryItems;
  }, [groceryItems, filter]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, ZekeGroceryItem[]> = {};

    filteredItems.forEach((item) => {
      const category = item.category || "Other";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return CATEGORY_ORDER.filter((cat) => groups[cat]?.length > 0).map((category) => ({
      title: category,
      data: groups[category],
    }));
  }, [filteredItems]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (!isSyncMode) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
      >
        <EmptyState
          icon="wifi-off"
          title="Connection Required"
          description="Grocery list sync requires a connection to ZEKE. Please connect to ZEKE in Settings to access your grocery list."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View
        style={[
          styles.headerControls,
          {
            paddingTop: headerHeight + Spacing.md,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setFilter("all")}
            style={[
              styles.filterButton,
              filter === "all" && styles.filterButtonActive,
              { borderColor: filter === "all" ? Colors.dark.primary : theme.border },
            ]}
          >
            <ThemedText
              style={[
                styles.filterText,
                filter === "all" && { color: Colors.dark.primary },
              ]}
            >
              All
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setFilter("unpurchased")}
            style={[
              styles.filterButton,
              filter === "unpurchased" && styles.filterButtonActive,
              { borderColor: filter === "unpurchased" ? Colors.dark.primary : theme.border },
            ]}
          >
            <ThemedText
              style={[
                styles.filterText,
                filter === "unpurchased" && { color: Colors.dark.primary },
              ]}
            >
              Unpurchased
            </ThemedText>
          </Pressable>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setIsAddModalVisible(true)}
            style={[styles.addButton, { backgroundColor: Colors.dark.primary }]}
          >
            <Feather name="plus" size={20} color="#fff" />
            <ThemedText style={styles.addButtonText}>Add Item</ThemedText>
          </Pressable>
          <View style={styles.voiceContainer}>
            {isProcessingVoice ? (
              <ActivityIndicator color={Colors.dark.primary} />
            ) : (
              <VoiceInputButton
                onRecordingComplete={handleVoiceRecordingComplete}
                disabled={isProcessingVoice}
              />
            )}
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : groupedItems.length === 0 ? (
        <View
          style={[
            styles.emptyContainer,
            { paddingBottom: tabBarHeight + Spacing.xl },
          ]}
        >
          <EmptyState
            icon="shopping-cart"
            title="No Items Yet"
            description={
              filter === "unpurchased"
                ? "All items have been purchased! Switch to 'All' to see your complete list."
                : "Add items to your grocery list using the button above or voice input."
            }
          />
        </View>
      ) : (
        <SectionList
          sections={groupedItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <GroceryItemRow
              item={item}
              onToggle={handleToggle}
              onDelete={handleDelete}
              theme={theme}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
              <View
                style={[
                  styles.sectionDot,
                  { backgroundColor: getCategoryColor(section.title) },
                ]}
              />
              <ThemedText type="h4" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                {section.data.length} item{section.data.length !== 1 ? "s" : ""}
              </ThemedText>
            </View>
          )}
          contentContainerStyle={{
            paddingBottom: tabBarHeight + Spacing.xl,
            paddingHorizontal: Spacing.lg,
          }}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          SectionSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        />
      )}

      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setIsAddModalVisible(false)}>
              <ThemedText style={{ color: Colors.dark.primary }}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="h4">Add Item</ThemedText>
            <Pressable onPress={handleAddItem} disabled={addMutation.isPending}>
              {addMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <ThemedText style={{ color: Colors.dark.primary, fontWeight: "600" }}>
                  Add
                </ThemedText>
              )}
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat>
            <View style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.inputLabel}>
                  Item Name *
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  placeholder="e.g., Milk"
                  placeholderTextColor={theme.textSecondary}
                  value={newItemName}
                  onChangeText={setNewItemName}
                  autoFocus
                />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText type="small" style={styles.inputLabel}>
                    Quantity
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    placeholder="e.g., 2"
                    placeholderTextColor={theme.textSecondary}
                    value={newItemQuantity}
                    onChangeText={setNewItemQuantity}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ width: Spacing.md }} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText type="small" style={styles.inputLabel}>
                    Unit
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    placeholder="e.g., gallons"
                    placeholderTextColor={theme.textSecondary}
                    value={newItemUnit}
                    onChangeText={setNewItemUnit}
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.inputLabel}>
                  Category
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  placeholder="e.g., Dairy"
                  placeholderTextColor={theme.textSecondary}
                  value={newItemCategory}
                  onChangeText={setNewItemCategory}
                />
                <View style={styles.categoryHints}>
                  {CATEGORY_ORDER.slice(0, 6).map((cat) => (
                    <Pressable
                      key={cat}
                      onPress={() => setNewItemCategory(cat)}
                      style={[
                        styles.categoryHint,
                        {
                          backgroundColor: `${getCategoryColor(cat)}20`,
                          borderColor: getCategoryColor(cat),
                        },
                      ]}
                    >
                      <ThemedText
                        type="caption"
                        style={{ color: getCategoryColor(cat) }}
                      >
                        {cat}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerControls: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  filterButtonActive: {
    backgroundColor: `${Colors.dark.primary}15`,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "500",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  voiceContainer: {
    marginLeft: "auto",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    flex: 1,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  itemRowPurchased: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxUnchecked: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
  },
  checkboxChecked: {
    width: 22,
    height: 22,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "500",
  },
  itemNamePurchased: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontWeight: "500",
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    borderWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
  },
  categoryHints: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  categoryHint: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
});
