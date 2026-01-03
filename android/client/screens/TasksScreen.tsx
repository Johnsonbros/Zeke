import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  Modal,
  Alert,
  SectionList,
  Platform,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
import { EmptyState } from "@/components/EmptyState";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { SkeletonListItem } from "@/components/Skeleton";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { queryClient, isZekeSyncMode } from "@/lib/query-client";
import {
  getAllTasks,
  createTask,
  deleteTask,
  toggleTaskComplete,
  chatWithZeke,
  type ZekeTask,
} from "@/lib/zeke-api-adapter";

type FilterType = "all" | "pending" | "completed";

const PRIORITY_COLORS: Record<string, string> = {
  high: Colors.dark.error,
  medium: Colors.dark.warning,
  low: Colors.dark.success,
};

function getPriorityColor(priority?: string): string {
  return PRIORITY_COLORS[priority || "low"] || Colors.dark.success;
}

function getTaskGroup(dueDate?: string): string {
  if (!dueDate) return "No Due Date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const taskDate = new Date(dueDate);
  taskDate.setHours(0, 0, 0, 0);

  if (taskDate.getTime() === today.getTime()) return "Today";
  if (taskDate.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (taskDate <= endOfWeek && taskDate > today) return "This Week";
  return "Later";
}

const GROUP_ORDER = ["Today", "Tomorrow", "This Week", "Later", "No Due Date"];

function formatDueDate(dueDate?: string): string {
  if (!dueDate) return "";
  const date = new Date(dueDate);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface TaskItemRowProps {
  item: ZekeTask;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  theme: any;
}

function TaskItemRow({ item, onToggle, onDelete, theme }: TaskItemRowProps) {
  const translateX = useSharedValue(0);
  const isCompleted = item.status === "completed";

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(item.id, !isCompleted);
  };

  const triggerDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Delete Task", `Remove "${item.title}" from your tasks?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(item.id),
      },
    ]);
  }, [item.id, item.title, onDelete]);

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

  const priorityColor = getPriorityColor(item.priority);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={handleToggle}
          style={[
            styles.itemRow,
            { backgroundColor: theme.backgroundSecondary },
            isCompleted && styles.itemRowCompleted,
          ]}
        >
          <View style={styles.checkbox}>
            {isCompleted ? (
              <View
                style={[
                  styles.checkboxChecked,
                  { backgroundColor: Colors.dark.success },
                ]}
              >
                <Feather name="check" size={14} color="#fff" />
              </View>
            ) : (
              <View
                style={[
                  styles.checkboxUnchecked,
                  { borderColor: theme.textSecondary },
                ]}
              />
            )}
          </View>
          <View style={styles.itemContent}>
            <ThemedText
              style={[
                styles.itemTitle,
                isCompleted && styles.itemTitleCompleted,
              ]}
              numberOfLines={2}
            >
              {item.title}
            </ThemedText>
            {item.dueDate ? (
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                {formatDueDate(item.dueDate)}
              </ThemedText>
            ) : null}
          </View>
          {item.priority ? (
            <View
              style={[
                styles.priorityIndicator,
                { backgroundColor: priorityColor },
              ]}
            />
          ) : null}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const isSyncMode = isZekeSyncMode();

  const [filter, setFilter] = useState<FilterType>("all");
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<
    "low" | "medium" | "high"
  >("medium");
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isIOSDatePickerVisible, setIsIOSDatePickerVisible] = useState(false);

  const {
    data: tasks = [],
    refetch,
    isRefetching,
    isLoading,
  } = useQuery<ZekeTask[]>({
    queryKey: ["tasks"],
    queryFn: getAllTasks,
    enabled: isSyncMode,
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      title: string;
      dueDate?: string;
      priority?: string;
    }) => createTask(data.title, data.dueDate, data.priority),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setIsAddModalVisible(false);
      resetForm();
    },
    onError: () => {
      Alert.alert("Error", "Failed to add task. Please try again.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      toggleTaskComplete(id, completed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update task. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete task. Please try again.");
    },
  });

  const resetForm = () => {
    setNewTaskTitle("");
    setNewTaskDueDate("");
    setNewTaskPriority("medium");
    setIsIOSDatePickerVisible(false);
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) {
      Alert.alert("Error", "Please enter a task title.");
      return;
    }

    addMutation.mutate({
      title: newTaskTitle.trim(),
      dueDate: newTaskDueDate || undefined,
      priority: newTaskPriority,
    });
  };

  const handleToggle = useCallback(
    (id: string, completed: boolean) => {
      toggleMutation.mutate({ id, completed });
    },
    [toggleMutation],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  const handleVoiceRecordingComplete = async (
    audioUri: string,
    durationSeconds: number,
  ) => {
    setIsProcessingVoice(true);
    try {
      await chatWithZeke(
        "I just recorded a voice message to add a task. Please help me create the task I mentioned.",
        "mobile-app",
      );
      await refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert(
        "Voice Input",
        "Voice input was recorded. To add tasks via voice, please use the Chat feature and say something like 'Add a task to call Mom tomorrow'.",
      );
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (filter === "pending") {
      return tasks.filter((task) => task.status === "pending");
    }
    if (filter === "completed") {
      return tasks.filter((task) => task.status === "completed");
    }
    return tasks;
  }, [tasks, filter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, ZekeTask[]> = {};

    filteredTasks.forEach((task) => {
      const group = getTaskGroup(task.dueDate || undefined);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(task);
    });

    return GROUP_ORDER.filter((group) => groups[group]?.length > 0).map(
      (group) => ({
        title: group,
        data: groups[group],
      }),
    );
  }, [filteredTasks]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const openDatePicker = useCallback(() => {
    const currentDate = newTaskDueDate ? new Date(newTaskDueDate) : new Date();

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: "date",
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === "set" && date) {
            setNewTaskDueDate(date.toISOString().split("T")[0]);
          }
        },
      });
      return;
    }

    setIsIOSDatePickerVisible((prev) => !prev);
  }, [newTaskDueDate]);

  const handleIOSDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setNewTaskDueDate(selectedDate.toISOString().split("T")[0]);
    }
  };

  const clearDueDate = () => {
    setNewTaskDueDate("");
    setIsIOSDatePickerVisible(false);
  };

  if (!isSyncMode) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: Platform.OS === "android" ? Spacing.xl : headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
      >
        <EmptyState
          icon="wifi-off"
          title="Connection Required"
          description="Task sync requires a connection to ZEKE. Please connect to ZEKE in Settings to access your tasks."
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
            marginTop: Platform.OS === "android" ? Spacing.md : headerHeight + Spacing.md,
          },
        ]}
      >
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setFilter("all")}
            style={[
              styles.filterButton,
              filter === "all" && styles.filterButtonActive,
              {
                backgroundColor:
                  filter === "all"
                    ? Colors.dark.primary
                    : theme.backgroundSecondary,
              },
            ]}
          >
            <ThemedText style={styles.filterText}>All</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setFilter("pending")}
            style={[
              styles.filterButton,
              filter === "pending" && styles.filterButtonActive,
              {
                backgroundColor:
                  filter === "pending"
                    ? Colors.dark.primary
                    : theme.backgroundSecondary,
              },
            ]}
          >
            <ThemedText style={styles.filterText}>Pending</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setFilter("completed")}
            style={[
              styles.filterButton,
              filter === "completed" && styles.filterButtonActive,
              {
                backgroundColor:
                  filter === "completed"
                    ? Colors.dark.primary
                    : theme.backgroundSecondary,
              },
            ]}
          >
            <ThemedText style={styles.filterText}>Completed</ThemedText>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => setIsAddModalVisible(true)}
            style={[styles.addButton, { backgroundColor: Colors.dark.primary }]}
          >
            <Feather name="plus" size={20} color="#fff" />
            <ThemedText style={styles.addButtonText}>Add Task</ThemedText>
          </Pressable>
          <VoiceInputButton
            onRecordingComplete={handleVoiceRecordingComplete}
            disabled={isProcessingVoice}
          />
        </View>
      </View>

      {isLoading ? (
        <View
          style={[
            styles.loadingContainer,
            { paddingBottom: tabBarHeight + Spacing.xl },
          ]}
        >
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      ) : groupedTasks.length === 0 ? (
        <View
          style={[
            styles.emptyContainer,
            { paddingBottom: tabBarHeight + Spacing.xl },
          ]}
        >
          <EmptyState
            icon="check-square"
            title={filter === "all" ? "No Tasks Yet" : `No ${filter} Tasks`}
            description={
              filter === "all"
                ? "Add your first task to get started."
                : `You don't have any ${filter} tasks.`
            }
          />
        </View>
      ) : (
        <SectionList
          sections={groupedTasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TaskItemRow
              item={item}
              onToggle={handleToggle}
              onDelete={handleDelete}
              theme={theme}
            />
          )}
          renderSectionHeader={({ section: { title } }) => (
            <View
              style={[
                styles.sectionHeader,
                { backgroundColor: theme.backgroundRoot },
              ]}
            >
              <ThemedText type="h4" style={styles.sectionTitle}>
                {title}
              </ThemedText>
            </View>
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
          stickySectionHeadersEnabled
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          SectionSeparatorComponent={() => (
            <View style={{ height: Spacing.md }} />
          )}
        />
      )}

      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.backgroundRoot },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              { paddingTop: insets.top + Spacing.md },
            ]}
          >
            <Pressable onPress={() => setIsAddModalVisible(false)}>
              <ThemedText style={{ color: Colors.dark.primary }}>
                Cancel
              </ThemedText>
            </Pressable>
            <ThemedText type="h4">New Task</ThemedText>
            <Pressable onPress={handleAddTask} disabled={addMutation.isPending}>
              <ThemedText style={{ color: Colors.dark.primary }}>
                {addMutation.isPending ? "Adding..." : "Add"}
              </ThemedText>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            style={styles.modalContent}
            contentContainerStyle={{
              paddingBottom: insets.bottom + Spacing.xl,
            }}
          >
            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.inputLabel}>
                Task Title
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
                placeholder="What needs to be done?"
                placeholderTextColor={theme.textSecondary}
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.inputLabel}>
                Due Date (Optional)
              </ThemedText>
              <Pressable
                onPress={openDatePicker}
                style={[
                  styles.datePickerTrigger,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View>
                  <ThemedText style={{ color: theme.text }}>
                    {newTaskDueDate
                      ? formatDueDate(newTaskDueDate)
                      : "Select a date"}
                  </ThemedText>
                  {newTaskDueDate ? (
                    <ThemedText
                      type="caption"
                      style={{ color: theme.textSecondary }}
                    >
                      {newTaskDueDate}
                    </ThemedText>
                  ) : null}
                </View>

                <View style={styles.datePickerActions}>
                  {newTaskDueDate ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        clearDueDate();
                      }}
                      hitSlop={8}
                    >
                      <Feather
                        name="x-circle"
                        size={18}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                  ) : null}
                  <Feather
                    name="calendar"
                    size={18}
                    color={theme.textSecondary}
                  />
                </View>
              </Pressable>

              {Platform.OS === "ios" && isIOSDatePickerVisible ? (
                <DateTimePicker
                  mode="date"
                  display="spinner"
                  value={newTaskDueDate ? new Date(newTaskDueDate) : new Date()}
                  onChange={handleIOSDateChange}
                  style={styles.iosDatePicker}
                />
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.inputLabel}>
                Priority
              </ThemedText>
              <View style={styles.prioritySelector}>
                {(["low", "medium", "high"] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setNewTaskPriority(p)}
                    style={[
                      styles.priorityOption,
                      {
                        backgroundColor:
                          newTaskPriority === p
                            ? PRIORITY_COLORS[p]
                            : theme.backgroundSecondary,
                        borderColor:
                          newTaskPriority === p
                            ? PRIORITY_COLORS[p]
                            : theme.border,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.priorityText,
                        { color: newTaskPriority === p ? "#fff" : theme.text },
                      ]}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </ThemedText>
                  </Pressable>
                ))}
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
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  filterButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  filterButtonActive: {},
  filterText: {
    fontSize: 14,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  addButton: {
    flex: 1,
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
  },
  sectionHeader: {
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  itemRowCompleted: {
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
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 16,
  },
  itemTitleCompleted: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
  priorityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  datePickerTrigger: {
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  datePickerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iosDatePicker: {
    marginTop: Spacing.sm,
  },
  prioritySelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  priorityOption: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  priorityText: {
    fontWeight: "500",
  },
});
