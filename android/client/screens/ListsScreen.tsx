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
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { queryClient, isZekeSyncMode } from "@/lib/query-client";
import {
  getLists,
  getListWithItems,
  createList,
  deleteList,
  addListItem,
  toggleListItem,
  deleteListItem,
  clearCheckedItems,
  type ZekeList,
  type ZekeListItem,
  type ZekeListWithItems,
} from "@/lib/zeke-api-adapter";

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
  item: ZekeListItem;
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
  list: ZekeList;
  onPress: (list: ZekeList) => void;
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
  const isSyncMode = isZekeSyncMode();

  const [isAddListModalVisible, setIsAddListModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [selectedList, setSelectedList] = useState<ZekeListWithItems | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [newListColor, setNewListColor] = useState(LIST_COLORS[0]);
  const [newItemText, setNewItemText] = useState("");

  const {
    data: lists = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ZekeList[]>({
    queryKey: ["lists"],
    queryFn: getLists,
    enabled: isSyncMode,
  });

  const createListMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string }) =>
      createList(data.name, data.description, data.color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setIsAddListModalVisible(false);
      resetAddListForm();
    },
    onError: () => {
      Alert.alert("Error", "Failed to create list. Please try again.");
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete list. Please try again.");
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({ listId, text }: { listId: string; text: string }) =>
      addListItem(listId, text),
    onSuccess: async () => {
      if (selectedList) {
        const updated = await getListWithItems(selectedList.id);
        if (updated) setSelectedList(updated);
      }
      queryClient.invalidateQueries({ queryKey: ["lists"] });
      setNewItemText("");
    },
    onError: () => {
      Alert.alert("Error", "Failed to add item. Please try again.");
    },
  });

  const toggleItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      toggleListItem(listId, itemId),
    onSuccess: async () => {
      if (selectedList) {
        const updated = await getListWithItems(selectedList.id);
        if (updated) setSelectedList(updated);
      }
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update item. Please try again.");
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      deleteListItem(listId, itemId),
    onSuccess: async () => {
      if (selectedList) {
        const updated = await getListWithItems(selectedList.id);
        if (updated) setSelectedList(updated);
      }
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete item. Please try again.");
    },
  });

  const clearCheckedMutation = useMutation({
    mutationFn: (listId: string) => clearCheckedItems(listId),
    onSuccess: async () => {
      if (selectedList) {
        const updated = await getListWithItems(selectedList.id);
        if (updated) setSelectedList(updated);
      }
      queryClient.invalidateQueries({ queryKey: ["lists"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to clear checked items. Please try again.");
    },
  });

  const resetAddListForm = () => {
    setNewListName("");
    setNewListDescription("");
    setNewListColor(LIST_COLORS[0]);
  };

  const handleCreateList = () => {
    if (!newListName.trim()) {
      Alert.alert("Error", "Please enter a list name.");
      return;
    }
    createListMutation.mutate({
      name: newListName.trim(),
      description: newListDescription.trim() || undefined,
      color: newListColor,
    });
  };

  const handleOpenList = useCallback(async (list: ZekeList) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const listWithItems = await getListWithItems(list.id);
    if (listWithItems) {
      setSelectedList(listWithItems);
      setIsDetailModalVisible(true);
    }
  }, []);

  const handleDeleteList = useCallback((id: string) => {
    deleteListMutation.mutate(id);
  }, [deleteListMutation]);

  const handleToggleItem = useCallback((listId: string, itemId: string) => {
    toggleItemMutation.mutate({ listId, itemId });
  }, [toggleItemMutation]);

  const handleDeleteItem = useCallback((listId: string, itemId: string) => {
    deleteItemMutation.mutate({ listId, itemId });
  }, [deleteItemMutation]);

  const handleAddItem = () => {
    if (!newItemText.trim() || !selectedList) return;
    addItemMutation.mutate({ listId: selectedList.id, text: newItemText.trim() });
  };

  const handleClearChecked = () => {
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
          onPress: () => clearCheckedMutation.mutate(selectedList.id),
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
          description="Lists require a connection to ZEKE. Please connect to ZEKE in Settings to access your lists."
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
            description="Create your first list to get organized."
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
            <Pressable onPress={handleCreateList} disabled={createListMutation.isPending}>
              <ThemedText style={{ color: Colors.dark.primary }}>
                {createListMutation.isPending ? "Creating..." : "Create"}
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
              disabled={!newItemText.trim() || addItemMutation.isPending}
              style={[
                styles.addItemButton,
                { backgroundColor: Colors.dark.primary },
                (!newItemText.trim() || addItemMutation.isPending) && { opacity: 0.5 },
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    marginBottom: Spacing.sm,
    opacity: 0.7,
  },
  textInput: {
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 16,
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
    borderWidth: 3,
    borderColor: "#fff",
  },
  addItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  addItemInput: {
    flex: 1,
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    fontSize: 16,
  },
  addItemButton: {
    width: Spacing.inputHeight,
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyListItems: {
    flex: 1,
    justifyContent: "center",
  },
  listItemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
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
  checkboxChecked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxUnchecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
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
