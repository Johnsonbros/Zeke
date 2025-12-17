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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { useLocalLists, useSyncStatus, type ListWithItems } from "@/hooks/useLocalLists";
import type { ListData, ListItemData } from "@/lib/filesystem-repository";

const LIST_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#84CC16",
];

interface ListItemRowProps {
  item: ListItemData;
  listId: string;
  onToggle: (listId: string, itemId: string) => void;
  onDelete: (listId: string, itemId: string) => void;
  theme: any;
}

function ListItemRow({ item, listId, onToggle, onDelete, theme }: ListItemRowProps) {
  const translateX = useSharedValue(0);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(listId, item.id);
  };

  const triggerDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete Item",
      `Remove this item from the list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(listId, item.id),
        },
      ]
    );
  }, [listId, item.id, onDelete]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      if (e.translationX < 0) {
        translateX.value = Math.max(e.translationX, -100);
      }
    })
    .onEnd((e) => {
      if (e.translationX < -60) {
        runOnJS(triggerDelete)();
      }
      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={handleToggle}
          style={[
            styles.listItemRow,
            { backgroundColor: theme.backgroundSecondary },
            item.checked && styles.listItemRowChecked,
          ]}
        >
          <View style={styles.checkbox}>
            {item.checked ? (
              <View style={[styles.checkboxChecked, { backgroundColor: Colors.dark.success }]}>
                <Feather name="check" size={14} color="#fff" />
              </View>
            ) : (
              <View style={[styles.checkboxUnchecked, { borderColor: theme.textSecondary }]} />
            )}
          </View>
          <ThemedText
            style={[
              styles.listItemText,
              item.checked && styles.listItemTextChecked,
            ]}
            numberOfLines={2}
          >
            {item.text}
          </ThemedText>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

interface ListCardProps {
  list: ListData & { itemCount?: number };
  onPress: (list: ListData) => void;
  onDelete: (id: string) => void;
  theme: any;
}

function ListCard({ list, onPress, onDelete, theme }: ListCardProps) {
  const listColor = list.color || LIST_COLORS[0];

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Delete List",
      `Are you sure you want to delete "${list.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(list.id),
        },
      ]
    );
  };

  return (
    <Pressable onPress={() => onPress(list)} onLongPress={handleLongPress}>
      <Card style={styles.listCard}>
        <View style={styles.listCardHeader}>
          <View style={[styles.colorDot, { backgroundColor: listColor }]} />
          <View style={styles.listCardTitleContainer}>
            <ThemedText type="h4" numberOfLines={1}>
              {list.name}
            </ThemedText>
            {list.description ? (
              <ThemedText type="caption" style={{ color: theme.textSecondary }} numberOfLines={1}>
                {list.description}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.itemCountBadge}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {list.itemCount || 0} items
            </ThemedText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const {
    lists,
    isLoading,
    isRefetching,
    refetch,
    createList,
    deleteList,
    getListWithItems,
    addListItem,
    toggleListItem,
    deleteListItem,
    clearCheckedItems,
  } = useLocalLists();

  const { pendingChanges, isSyncing, syncNow } = useSyncStatus();

  const [isAddListModalVisible, setIsAddListModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [selectedList, setSelectedList] = useState<ListWithItems | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [newItemText, setNewItemText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);

  const resetAddListForm = () => {
    setNewListName("");
    setNewListDescription("");
    setNewListColor(LIST_COLORS[0]);
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      Alert.alert("Error", "Please enter a list name.");
      return;
    }
    setIsCreating(true);
    try {
      await createList(
        newListName.trim(),
        newListDescription.trim() || undefined,
        newListColor
      );
      setIsAddListModalVisible(false);
      resetAddListForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Failed to create list. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenList = useCallback(async (list: ListData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const listWithItems = await getListWithItems(list.id);
    if (listWithItems) {
      setSelectedList(listWithItems);
      setIsDetailModalVisible(true);
    }
  }, [getListWithItems]);

  const handleDeleteList = useCallback(async (id: string) => {
    try {
      await deleteList(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Failed to delete list. Please try again.");
    }
  }, [deleteList]);

  const handleToggleItem = useCallback(async (listId: string, itemId: string) => {
    try {
      await toggleListItem(listId, itemId);
      const updated = await getListWithItems(listId);
      if (updated) setSelectedList(updated);
    } catch (err) {
      Alert.alert("Error", "Failed to update item. Please try again.");
    }
  }, [toggleListItem, getListWithItems]);

  const handleDeleteItem = useCallback(async (listId: string, itemId: string) => {
    try {
      await deleteListItem(listId, itemId);
      const updated = await getListWithItems(listId);
      if (updated) setSelectedList(updated);
    } catch (err) {
      Alert.alert("Error", "Failed to delete item. Please try again.");
    }
  }, [deleteListItem, getListWithItems]);

  const handleAddItem = async () => {
    if (!newItemText.trim() || !selectedList) return;
    setIsAddingItem(true);
    try {
      await addListItem(selectedList.id, newItemText.trim());
      const updated = await getListWithItems(selectedList.id);
      if (updated) setSelectedList(updated);
      setNewItemText("");
    } catch (err) {
      Alert.alert("Error", "Failed to add item. Please try again.");
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleClearChecked = async () => {
    if (!selectedList) return;
    const checkedCount = selectedList.items.filter(i => i.checked).length;
    if (checkedCount === 0) {
      Alert.alert("No Items", "There are no checked items to clear.");
      return;
    }
    Alert.alert(
      "Clear Checked Items",
      `Remove ${checkedCount} checked item${checkedCount > 1 ? 's' : ''}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearCheckedItems(selectedList.id);
              const updated = await getListWithItems(selectedList.id);
              if (updated) setSelectedList(updated);
            } catch (err) {
              Alert.alert("Error", "Failed to clear checked items. Please try again.");
            }
          },
        },
      ]
    );
  };

  const sortedItems = useMemo(() => {
    if (!selectedList) return [];
    return [...selectedList.items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return (a.order || 0) - (b.order || 0);
    });
  }, [selectedList]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
        <View style={styles.syncStatusRow}>
          {pendingChanges > 0 ? (
            <Pressable 
              onPress={syncNow} 
              disabled={isSyncing}
              style={styles.syncButton}
            >
              <Feather 
                name={isSyncing ? "loader" : "cloud"} 
                size={16} 
                color={Colors.dark.warning} 
              />
              <ThemedText type="caption" style={{ color: Colors.dark.warning }}>
                {isSyncing ? "Syncing..." : `${pendingChanges} pending`}
              </ThemedText>
            </Pressable>
          ) : (
            <View style={styles.syncButton}>
              <Feather name="check-circle" size={16} color={Colors.dark.success} />
              <ThemedText type="caption" style={{ color: Colors.dark.success }}>
                Synced locally
              </ThemedText>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => setIsAddListModalVisible(true)}
          style={[styles.addButton, { backgroundColor: Colors.dark.primary }]}
        >
          <Feather name="plus" size={20} color="#fff" />
          <ThemedText style={styles.addButtonText}>Add List</ThemedText>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : lists.length === 0 ? (
        <View style={[styles.emptyContainer, { paddingBottom: tabBarHeight + Spacing.xl }]}>
          <EmptyState
            icon="list"
            title="No Lists Yet"
            description="Create your first list to get organized. Lists are stored locally on your device."
            actionLabel="Create List"
            onAction={() => setIsAddListModalVisible(true)}
          />
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListCard
              list={item}
              onPress={handleOpenList}
              onDelete={handleDeleteList}
              theme={theme}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        />
      )}

      <Modal
        visible={isAddListModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsAddListModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.md }]}>
            <Pressable onPress={() => setIsAddListModalVisible(false)}>
              <ThemedText style={{ color: Colors.dark.primary }}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="h4">New List</ThemedText>
            <Pressable onPress={handleCreateList} disabled={isCreating}>
              <ThemedText style={{ color: Colors.dark.primary }}>
                {isCreating ? "Creating..." : "Create"}
              </ThemedText>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.modalContent}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          >
            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.inputLabel}>
                List Name
              </ThemedText>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="e.g., Shopping, Movies to Watch..."
                placeholderTextColor={theme.textSecondary}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.inputLabel}>
                Description (Optional)
              </ThemedText>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="What's this list for?"
                placeholderTextColor={theme.textSecondary}
                value={newListDescription}
                onChangeText={setNewListDescription}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.inputLabel}>
                Color
              </ThemedText>
              <View style={styles.colorSelector}>
                {LIST_COLORS.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setNewListColor(color)}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newListColor === color && styles.colorOptionSelected,
                    ]}
                  >
                    {newListColor === color ? (
                      <Feather name="check" size={16} color="#fff" />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal
        visible={isDetailModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsDetailModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + Spacing.md }]}>
            <Pressable onPress={() => setIsDetailModalVisible(false)}>
              <Feather name="chevron-left" size={24} color={Colors.dark.primary} />
            </Pressable>
            <View style={styles.modalTitleContainer}>
              <View style={[styles.colorDotSmall, { backgroundColor: selectedList?.color || LIST_COLORS[0] }]} />
              <ThemedText type="h4" numberOfLines={1}>
                {selectedList?.name || "List"}
              </ThemedText>
            </View>
            <Pressable onPress={handleClearChecked}>
              <Feather name="trash-2" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.addItemRow}>
            <TextInput
              style={[
                styles.addItemInput,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder="Add an item..."
              placeholderTextColor={theme.textSecondary}
              value={newItemText}
              onChangeText={setNewItemText}
              onSubmitEditing={handleAddItem}
              returnKeyType="done"
            />
            <Pressable
              onPress={handleAddItem}
              disabled={!newItemText.trim() || isAddingItem}
              style={[
                styles.addItemButton,
                { backgroundColor: Colors.dark.primary },
                (!newItemText.trim() || isAddingItem) && { opacity: 0.5 },
              ]}
            >
              <Feather name="plus" size={20} color="#fff" />
            </Pressable>
          </View>

          {sortedItems.length === 0 ? (
            <View style={styles.emptyListItems}>
              <EmptyState
                icon="inbox"
                title="No Items"
                description="Add your first item to this list."
              />
            </View>
          ) : (
            <FlatList
              data={sortedItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ListItemRow
                  item={item}
                  listId={selectedList?.id || ""}
                  onToggle={handleToggleItem}
                  onDelete={handleDeleteItem}
                  theme={theme}
                />
              )}
              contentContainerStyle={{
                paddingHorizontal: Spacing.lg,
                paddingBottom: insets.bottom + Spacing.xl,
              }}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            />
          )}
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
  syncStatusRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
  },
  listCard: {
    padding: Spacing.lg,
  },
  listCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  colorDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  listCardTitleContainer: {
    flex: 1,
    gap: 2,
  },
  itemCountBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
    justifyContent: "center",
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    marginBottom: Spacing.sm,
    fontWeight: "500",
  },
  textInput: {
    height: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    borderWidth: 1,
  },
  colorSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionSelected: {
    borderWidth: 2,
    borderColor: "#fff",
  },
  addItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  addItemInput: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    borderWidth: 1,
  },
  addItemButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyListItems: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  listItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  listItemRowChecked: {
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
  listItemText: {
    flex: 1,
    fontSize: 16,
  },
  listItemTextChecked: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
});
