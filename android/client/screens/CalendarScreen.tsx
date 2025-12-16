import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
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

import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { queryClient } from "@/lib/query-client";
import {
  getTodayEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarList,
  getZekeCalendar,
  chatWithZeke,
  type ZekeEvent,
  type ZekeCalendar,
} from "@/lib/zeke-api-adapter";

const HOUR_HEIGHT = 60;
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 23;

const CALENDAR_NAME_MAP: Record<string, string> = {
  "krazedrecords@gmail.com": "Nate",
};

const CALENDARS_TO_EXCLUDE = [
  "Venture Café Cambridge",
];

function getCalendarDisplayName(calendarName: string): string {
  return CALENDAR_NAME_MAP[calendarName] || calendarName;
}

function shouldShowCalendar(calendarName: string): boolean {
  return !CALENDARS_TO_EXCLUDE.includes(calendarName);
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateHeader(): string {
  const today = new Date();
  return today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getEventPosition(startTime: string): number {
  const date = new Date(startTime);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = (hours - TIMELINE_START_HOUR) * 60 + minutes;
  return (totalMinutes / 60) * HOUR_HEIGHT;
}

function getEventHeight(startTime: string, endTime?: string): number {
  if (!endTime) return HOUR_HEIGHT;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
  return Math.max((durationMinutes / 60) * HOUR_HEIGHT, 30);
}

function getCurrentTimePosition(): number {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  if (hours < TIMELINE_START_HOUR || hours > TIMELINE_END_HOUR) return -1;
  const totalMinutes = (hours - TIMELINE_START_HOUR) * 60 + minutes;
  return (totalMinutes / 60) * HOUR_HEIGHT;
}

interface EventWithLayout extends ZekeEvent {
  column: number;
  totalColumns: number;
}

function calculateEventLayout(events: ZekeEvent[]): EventWithLayout[] {
  if (events.length === 0) return [];

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const eventsWithLayout: EventWithLayout[] = [];

  for (const event of sortedEvents) {
    const startTime = new Date(event.startTime).getTime();
    const endTime = event.endTime
      ? new Date(event.endTime).getTime()
      : startTime + 60 * 60 * 1000;

    const overlappingEvents = eventsWithLayout.filter((e) => {
      const eStart = new Date(e.startTime).getTime();
      const eEnd = e.endTime
        ? new Date(e.endTime).getTime()
        : eStart + 60 * 60 * 1000;
      return startTime < eEnd && endTime > eStart;
    });

    const usedColumns = new Set(overlappingEvents.map((e) => e.column));
    let column = 0;
    while (usedColumns.has(column)) {
      column++;
    }

    eventsWithLayout.push({
      ...event,
      column,
      totalColumns: 1,
    });
  }

  for (let i = 0; i < eventsWithLayout.length; i++) {
    const event = eventsWithLayout[i];
    const startTime = new Date(event.startTime).getTime();
    const endTime = event.endTime
      ? new Date(event.endTime).getTime()
      : startTime + 60 * 60 * 1000;

    const overlappingEvents = eventsWithLayout.filter((e) => {
      const eStart = new Date(e.startTime).getTime();
      const eEnd = e.endTime
        ? new Date(e.endTime).getTime()
        : eStart + 60 * 60 * 1000;
      return startTime < eEnd && endTime > eStart;
    });

    const maxColumn = Math.max(...overlappingEvents.map((e) => e.column));
    event.totalColumns = maxColumn + 1;
  }

  return eventsWithLayout;
}

interface EventCardProps {
  event: EventWithLayout;
  onPress: (event: ZekeEvent) => void;
  onDelete: (event: ZekeEvent) => void;
  theme: any;
}

function EventCard({ event, onPress, onDelete, theme }: EventCardProps) {
  const color = event.color || Colors.dark.primary;
  const top = getEventPosition(event.startTime);
  const height = getEventHeight(event.startTime, event.endTime);

  const columnWidth = 100 / event.totalColumns;
  const leftPercent = event.column * columnWidth;

  const handlePress = () => {
    onPress(event);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Event Options",
      `"${event.title}"${event.calendarName ? ` (${event.calendarName})` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Edit",
          onPress: () => onPress(event),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(event),
        },
      ]
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={[
        styles.eventCard,
        {
          top,
          height,
          left: `${leftPercent}%`,
          width: `${columnWidth - 1}%`,
          backgroundColor: `${color}20`,
          borderLeftColor: color,
        },
      ]}
    >
      <View style={styles.eventContent}>
        <View style={styles.eventHeader}>
          <ThemedText style={[styles.eventTime, { color }]} numberOfLines={1}>
            {formatTime(event.startTime)}
            {event.endTime ? ` - ${formatTime(event.endTime)}` : ""}
          </ThemedText>
          {event.calendarName ? (
            <View style={[styles.calendarBadge, { backgroundColor: `${color}40` }]}>
              <ThemedText style={[styles.calendarBadgeText, { color }]} numberOfLines={1}>
                {getCalendarDisplayName(event.calendarName)}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </ThemedText>
        {event.location ? (
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={12} color={theme.textSecondary} />
            <ThemedText
              type="caption"
              style={{ color: theme.textSecondary, marginLeft: 4 }}
              numberOfLines={1}
            >
              {event.location}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ZekeEvent | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("primary");
  const [filterCalendarId, setFilterCalendarId] = useState<string | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  const {
    data: events = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<ZekeEvent[]>({
    queryKey: ["calendar-events-today"],
    queryFn: getTodayEvents,
  });

  const { data: calendars = [] } = useQuery<ZekeCalendar[]>({
    queryKey: ["calendar-list"],
    queryFn: getCalendarList,
  });

  const { data: zekeCalendar } = useQuery<ZekeCalendar | null>({
    queryKey: ["zeke-calendar"],
    queryFn: getZekeCalendar,
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      title: string;
      startTime: string;
      endTime?: string;
      location?: string;
      calendarId?: string;
      description?: string;
    }) =>
      createCalendarEvent(
        data.title,
        data.startTime,
        data.endTime,
        data.location,
        data.calendarId,
        data.description
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events-today"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-list"] });
      closeModal();
    },
    onError: () => {
      Alert.alert("Error", "Failed to add event. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: {
      eventId: string;
      updates: {
        title?: string;
        startTime?: string;
        endTime?: string;
        location?: string;
        description?: string;
        calendarId?: string;
      };
    }) => updateCalendarEvent(data.eventId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events-today"] });
      closeModal();
    },
    onError: () => {
      Alert.alert("Error", "Failed to update event. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (event: ZekeEvent) => deleteCalendarEvent(event.id, event.calendarId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events-today"] });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete event. Please try again.");
    },
  });

  const resetForm = () => {
    setEventTitle("");
    setEventStartTime("");
    setEventEndTime("");
    setEventLocation("");
    setEventDescription("");
    setSelectedCalendarId("primary");
    setEditingEvent(null);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    resetForm();
  };

  const openAddModal = () => {
    resetForm();
    if (zekeCalendar) {
      setSelectedCalendarId(zekeCalendar.id);
    }
    setIsModalVisible(true);
  };

  const openEditModal = (event: ZekeEvent) => {
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventStartTime(formatTimeForInput(event.startTime));
    setEventEndTime(event.endTime ? formatTimeForInput(event.endTime) : "");
    setEventLocation(event.location || "");
    setEventDescription(event.description || "");
    setSelectedCalendarId(event.calendarId || "primary");
    setIsModalVisible(true);
  };

  const handleSaveEvent = () => {
    if (!eventTitle.trim()) {
      Alert.alert("Error", "Please enter an event title.");
      return;
    }
    if (!eventStartTime.trim()) {
      Alert.alert("Error", "Please enter a start time (e.g., 2:00 PM).");
      return;
    }

    const today = new Date();
    const startTimeDate = parseTimeString(eventStartTime, today);
    if (!startTimeDate) {
      Alert.alert("Error", "Invalid start time format. Use format like '2:00 PM' or '14:00'.");
      return;
    }

    let endTimeDate: Date | undefined;
    if (eventEndTime.trim()) {
      const parsedEndTime = parseTimeString(eventEndTime, today);
      if (!parsedEndTime) {
        Alert.alert("Error", "Invalid end time format. Use format like '3:00 PM' or '15:00'.");
        return;
      }
      endTimeDate = parsedEndTime;
    }

    if (editingEvent) {
      updateMutation.mutate({
        eventId: editingEvent.id,
        updates: {
          title: eventTitle.trim(),
          startTime: startTimeDate.toISOString(),
          endTime: endTimeDate?.toISOString(),
          location: eventLocation.trim() || undefined,
          description: eventDescription.trim() || undefined,
          calendarId: selectedCalendarId || editingEvent.calendarId,
        },
      });
    } else {
      addMutation.mutate({
        title: eventTitle.trim(),
        startTime: startTimeDate.toISOString(),
        endTime: endTimeDate?.toISOString(),
        location: eventLocation.trim() || undefined,
        calendarId: selectedCalendarId,
        description: eventDescription.trim() || undefined,
      });
    }
  };

  const handleDeleteEvent = useCallback(
    (event: ZekeEvent) => {
      deleteMutation.mutate(event);
    },
    [deleteMutation]
  );

  const handleVoiceRecordingComplete = async (
    audioUri: string,
    durationSeconds: number
  ) => {
    setIsProcessingVoice(true);
    try {
      await chatWithZeke(
        "I just recorded a voice message to add an event to my calendar. Please help me create the event I mentioned.",
        "mobile-app"
      );
      await refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert(
        "Voice Input",
        "Voice input was recorded. To add events via voice, please use the Chat feature and say something like 'Add a meeting at 2pm tomorrow'."
      );
    } finally {
      setIsProcessingVoice(false);
    }
  };

  function formatTimeForInput(dateString: string): string {
    const date = new Date(dateString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
  }

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredEvents = useMemo(() => {
    let result = events.filter(e => e.calendarName && shouldShowCalendar(e.calendarName));
    if (!filterCalendarId) return result;
    return result.filter(e => e.calendarId === filterCalendarId);
  }, [events, filterCalendarId]);

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: ZekeEvent[] = [];
    const timed: ZekeEvent[] = [];
    
    for (const event of filteredEvents) {
      if (event.allDay) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    }
    
    allDay.sort((a, b) => a.title.localeCompare(b.title));
    timed.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    
    return { allDayEvents: allDay, timedEvents: timed };
  }, [filteredEvents]);

  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [filteredEvents]);

  const currentTimePosition = getCurrentTimePosition();

  const timelineHeight = (TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1) * HOUR_HEIGHT;

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
        <View style={styles.dateHeader}>
          <ThemedText type="h3" style={styles.dateText}>
            {formatDateHeader()}
          </ThemedText>
          <ThemedText type="caption" style={{ color: theme.textSecondary }}>
            {sortedEvents.length} event{sortedEvents.length !== 1 ? "s" : ""} today
          </ThemedText>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            onPress={openAddModal}
            style={[styles.addButton, { backgroundColor: Colors.dark.primary }]}
          >
            <Feather name="plus" size={20} color="#fff" />
            <ThemedText style={styles.addButtonText}>Add Event</ThemedText>
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

        {calendars.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.calendarFilters}
          >
            <Pressable
              onPress={() => setFilterCalendarId(null)}
              style={[
                styles.calendarChip,
                {
                  backgroundColor: !filterCalendarId ? Colors.dark.primary : theme.backgroundSecondary,
                  borderColor: !filterCalendarId ? Colors.dark.primary : theme.border,
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.calendarChipText,
                  { color: !filterCalendarId ? "#fff" : theme.textSecondary },
                ]}
              >
                All Calendars
              </ThemedText>
            </Pressable>
            {calendars.filter((cal) => shouldShowCalendar(cal.name)).map((cal) => (
              <Pressable
                key={cal.id}
                onPress={() => setFilterCalendarId(filterCalendarId === cal.id ? null : cal.id)}
                style={[
                  styles.calendarChip,
                  {
                    backgroundColor: filterCalendarId === cal.id ? `${cal.color}` : theme.backgroundSecondary,
                    borderColor: filterCalendarId === cal.id ? cal.color : theme.border,
                  },
                ]}
              >
                <View style={[styles.calendarDot, { backgroundColor: cal.color }]} />
                <ThemedText
                  style={[
                    styles.calendarChipText,
                    { color: filterCalendarId === cal.id ? "#fff" : theme.text },
                  ]}
                  numberOfLines={1}
                >
                  {getCalendarDisplayName(cal.name)}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : sortedEvents.length === 0 ? (
        <View
          style={[
            styles.emptyContainer,
            { paddingBottom: tabBarHeight + Spacing.xl },
          ]}
        >
          <EmptyState
            icon="calendar"
            title="No Events Today"
            description="Add events to your calendar using the button above or voice input."
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: tabBarHeight + Spacing.xl,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.primary}
            />
          }
        >
          {allDayEvents.length > 0 ? (
            <View style={styles.allDaySection}>
              <ThemedText type="small" style={[styles.allDaySectionTitle, { color: theme.textSecondary }]}>
                All-Day Events
              </ThemedText>
              {allDayEvents.map((event) => {
                const color = event.color || Colors.dark.primary;
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => openEditModal(event)}
                    onLongPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      Alert.alert(
                        "Event Options",
                        `"${event.title}"${event.calendarName ? ` (${getCalendarDisplayName(event.calendarName)})` : ""}`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Edit", onPress: () => openEditModal(event) },
                          { text: "Delete", style: "destructive", onPress: () => handleDeleteEvent(event) },
                        ]
                      );
                    }}
                    style={[
                      styles.allDayEventCard,
                      {
                        backgroundColor: `${color}20`,
                        borderLeftColor: color,
                      },
                    ]}
                  >
                    <View style={styles.allDayEventContent}>
                      <ThemedText style={styles.allDayEventTitle} numberOfLines={1}>
                        {event.title}
                      </ThemedText>
                      {event.calendarName ? (
                        <View style={[styles.calendarBadge, { backgroundColor: `${color}40` }]}>
                          <ThemedText style={[styles.calendarBadgeText, { color }]} numberOfLines={1}>
                            {getCalendarDisplayName(event.calendarName)}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={[styles.timeline, { height: timelineHeight }]}>
            {Array.from(
              { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
              (_, i) => {
                const hour = TIMELINE_START_HOUR + i;
                const hourLabel =
                  hour === 0
                    ? "12 AM"
                    : hour < 12
                    ? `${hour} AM`
                    : hour === 12
                    ? "12 PM"
                    : `${hour - 12} PM`;
                return (
                  <View
                    key={hour}
                    style={[styles.hourRow, { top: i * HOUR_HEIGHT }]}
                  >
                    <ThemedText
                      type="caption"
                      style={[styles.hourLabel, { color: theme.textSecondary }]}
                    >
                      {hourLabel}
                    </ThemedText>
                    <View
                      style={[
                        styles.hourLine,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  </View>
                );
              }
            )}

            {currentTimePosition >= 0 ? (
              <View
                style={[styles.currentTimeIndicator, { top: currentTimePosition }]}
              >
                <View
                  style={[
                    styles.currentTimeDot,
                    { backgroundColor: Colors.dark.error },
                  ]}
                />
                <View
                  style={[
                    styles.currentTimeLine,
                    { backgroundColor: Colors.dark.error },
                  ]}
                />
              </View>
            ) : null}

            <View style={styles.eventsContainer}>
              {calculateEventLayout(timedEvents).map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={openEditModal}
                  onDelete={handleDeleteEvent}
                  theme={theme}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View
          style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={closeModal}>
              <ThemedText style={{ color: Colors.dark.primary }}>
                Cancel
              </ThemedText>
            </Pressable>
            <ThemedText type="h4">{editingEvent ? "Edit Event" : "Add Event"}</ThemedText>
            <Pressable onPress={handleSaveEvent} disabled={addMutation.isPending || updateMutation.isPending}>
              {(addMutation.isPending || updateMutation.isPending) ? (
                <ActivityIndicator size="small" color={Colors.dark.primary} />
              ) : (
                <ThemedText
                  style={{ color: Colors.dark.primary, fontWeight: "600" }}
                >
                  {editingEvent ? "Save" : "Add"}
                </ThemedText>
              )}
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat>
            <View style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.inputLabel}>
                  Event Title *
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
                  placeholder="e.g., Team Meeting"
                  placeholderTextColor={theme.textSecondary}
                  value={eventTitle}
                  onChangeText={setEventTitle}
                  autoFocus
                />
              </View>

              {calendars.length > 0 ? (
                <View style={styles.inputGroup}>
                  <ThemedText type="small" style={styles.inputLabel}>
                    Calendar
                  </ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.calendarPickerRow}
                  >
                    {calendars.map((cal) => (
                      <Pressable
                        key={cal.id}
                        onPress={() => setSelectedCalendarId(cal.id)}
                        style={[
                          styles.calendarPickerChip,
                          {
                            backgroundColor: selectedCalendarId === cal.id ? cal.color : theme.backgroundSecondary,
                            borderColor: selectedCalendarId === cal.id ? cal.color : theme.border,
                          },
                        ]}
                      >
                        <View style={[styles.calendarDot, { backgroundColor: selectedCalendarId === cal.id ? "#fff" : cal.color }]} />
                        <ThemedText
                          style={[
                            styles.calendarChipText,
                            { color: selectedCalendarId === cal.id ? "#fff" : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {cal.name}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText type="small" style={styles.inputLabel}>
                    Start Time *
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
                    placeholder="e.g., 2:00 PM"
                    placeholderTextColor={theme.textSecondary}
                    value={eventStartTime}
                    onChangeText={setEventStartTime}
                  />
                </View>
                <View style={{ width: Spacing.md }} />
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText type="small" style={styles.inputLabel}>
                    End Time
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
                    placeholder="e.g., 3:00 PM"
                    placeholderTextColor={theme.textSecondary}
                    value={eventEndTime}
                    onChangeText={setEventEndTime}
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.inputLabel}>
                  Location
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
                  placeholder="e.g., Conference Room A"
                  placeholderTextColor={theme.textSecondary}
                  value={eventLocation}
                  onChangeText={setEventLocation}
                />
              </View>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.inputLabel}>
                  Description
                </ThemedText>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  placeholder="Add notes or description..."
                  placeholderTextColor={theme.textSecondary}
                  value={eventDescription}
                  onChangeText={setEventDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {editingEvent ? (
                <Pressable
                  onPress={() => {
                    closeModal();
                    handleDeleteEvent(editingEvent);
                  }}
                  style={[styles.deleteButton, { backgroundColor: `${Colors.dark.error}15` }]}
                >
                  <Feather name="trash-2" size={18} color={Colors.dark.error} />
                  <ThemedText style={{ color: Colors.dark.error, fontWeight: "600" }}>
                    Delete Event
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

function parseTimeString(timeStr: string, baseDate: Date): Date | null {
  const cleaned = timeStr.trim().toLowerCase();
  
  const match12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const period = match12[3];
    
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    
    if (period === "am") {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
    
    const result = new Date(baseDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
  
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    
    const result = new Date(baseDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }
  
  return null;
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
  dateHeader: {
    gap: Spacing.xs,
  },
  dateText: {
    color: Colors.dark.text,
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
  timeline: {
    position: "relative",
    marginLeft: Spacing.lg,
    marginRight: Spacing.lg,
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    width: 50,
    fontSize: 11,
    marginTop: -6,
  },
  hourLine: {
    flex: 1,
    height: 1,
    marginLeft: Spacing.sm,
  },
  currentTimeIndicator: {
    position: "absolute",
    left: 48,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  currentTimeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
  },
  eventsContainer: {
    position: "absolute",
    left: 60,
    right: 0,
    top: 0,
    bottom: 0,
  },
  eventCard: {
    position: "absolute",
    borderLeftWidth: 3,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    overflow: "hidden",
  },
  eventContent: {
    gap: 2,
  },
  eventTime: {
    fontSize: 11,
    fontWeight: "600",
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
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
  textArea: {
    height: 80,
    paddingTop: Spacing.md,
    textAlignVertical: "top",
  },
  inputRow: {
    flexDirection: "row",
  },
  calendarFilters: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  calendarChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  calendarChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  calendarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  calendarPickerRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  calendarPickerChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  calendarBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  calendarBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  allDaySection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  allDaySectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  allDayEventCard: {
    borderLeftWidth: 3,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  allDayEventContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  allDayEventTitle: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
});
