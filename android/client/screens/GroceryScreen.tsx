import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
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

import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import {
  getGroceryItems,
  addGroceryItem,
  updateGroceryItem,
  deleteGroceryItem,
  toggleGroceryPurchased,
  type ZekeGroceryItem,
} from "@/lib/zeke-api-adapter";

type GroceryItemData = ZekeGroceryItem;

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
  item: GroceryItemData;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  theme: any;
}

function GroceryItemRow({ item, onToggle, onDelete, theme }: GroceryItemRowProps) {
  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(item.id);
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

  const [groceryItems, setGroceryItems] = useState<GroceryItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const items = await getGroceryItems();
      setGroceryItems(items);
    } catch (err) {
      console.error("Error loading grocery items:", err);
    }
  }, []);

  React.useEffect(() => {
    setIsLoading(true);
    loadItems().finally(() => setIsLoading(false));
  }, [loadItems]);

  const refetch = useCallback(async () => {
    setIsRefetching(true);
    await loadItems();
    setIsRefetching(false);
  }, [loadItems]);

  const resetForm = () => {
    setNewItemName("");
    setNewItemQuantity("");
    setNewItemUnit("");
    setNewItemCategory("");
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert("Error", "Please enter an item name.");
      return;
    }

    setIsAddingItem(true);
    try {
      await addGroceryItem(
        newItemName.trim(),
        newItemQuantity ? parseFloat(newItemQuantity) : undefined,
        newItemUnit.trim() || undefined,
        newItemCategory.trim() || undefined
      );
      await loadItems();
      setIsAddModalVisible(false);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Failed to add item. Please try again.");
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleToggle = useCallback(async (id: string) => {
    try {
      const item = groceryItems.find(i => i.id === id);
      if (item) {
        await toggleGroceryPurchased(id, !item.isPurchased);
        await loadItems();
      }
    } catch (err) {
      Alert.alert("Error", "Failed to update item. Please try again.");
    }
  }, [loadItems, groceryItems]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteGroceryItem(id);
      await loadItems();
    } catch (err) {
      Alert.alert("Error", "Failed to delete item. Please try again.");
    }
  }, [loadItems]);

  const handleClearPurchased = async () => {
    const purchasedItems = groceryItems.filter(i => i.isPurchased);
    if (purchasedItems.length === 0) {
      Alert.alert("No Items", "There are no purchased items to clear.");
      return;
    }
    Alert.alert(
      "Clear Purchased Items",
      `Remove ${purchasedItems.length} purchased item${purchasedItems.length > 1 ? 's' : ''}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await Promise.all(purchasedItems.map(item => deleteGroceryItem(item.id)));
              await loadItems();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              Alert.alert("Error", "Failed to clear purchased items. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleVoiceRecordingComplete = async (audioUri: string, durationSeconds: number) => {
    Alert.alert(
      "Voice Input",
      "Voice input recorded. Use the Chat feature and say something like 'Add eggs and milk to my grocery list' to add items via voice."
    );
  };

  const filteredItems = useMemo(() => {
    if (filter === "unpurchased") {
      return groceryItems.filter((item) => !item.isPurchased);
    }
    return groceryItems;
  }, [groceryItems, filter]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, GroceryItemData[]> = {};

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

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View
        style={[
          styles.headerControls,
          {
            marginTop: headerHeight + Spacing.md,
          },
        ]}
      >
        <View style={styles.topRow}>
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
          <View style={styles.syncStatusRow}>
            <Feather name="cloud" size={14} color={Colors.dark.success} />
          </View>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setIsAddModalVisible(true)}
            style={[styles.addButton, { backgroundColor: Colors.dark.primary }]}
          >
            <Feather name="plus" size={20} color="#fff" />
            <ThemedText style={styles.addButtonText}>Add Item</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleClearPurchased}
            style={[styles.clearButton, { borderColor: theme.border }]}
          >
            <Feather name="trash-2" size={18} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.voiceContainer}>
            <VoiceInputButton
              onRecordingComplete={handleVoiceRecordingComplete}
              disabled={false}
            />
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
                : "Add items to your grocery list. Items sync with your ZEKE account."
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
          onRefresh={refetch}
          refreshing={isRefetching}
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
            <Pressable onPress={handleAddItem} disabled={isAddingItem}>
              {isAddingItem ? (
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
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  syncStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  syncButton: {
    padding: Spacing.xs,
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
  clearButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
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
