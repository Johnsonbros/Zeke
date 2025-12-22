import React, { useState } from "react";
import {
  View,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

interface SpeakerProfile {
  id: string;
  deviceId: string;
  name: string;
  voiceCharacteristics?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export function SpeakerProfilesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { deviceId } = useAuth();
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: speakers = [], isLoading } = useQuery<SpeakerProfile[]>({
    queryKey: ["/api/speakers", deviceId],
    enabled: !!deviceId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, name }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/speakers", deviceId] });
      setNewSpeakerName("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/speakers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/speakers", deviceId] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/speakers/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/speakers", deviceId] });
    },
  });

  const handleAddSpeaker = () => {
    if (!newSpeakerName.trim()) {
      Alert.alert("Error", "Please enter a speaker name");
      return;
    }
    createMutation.mutate(newSpeakerName.trim());
  };

  const handleSaveEdit = () => {
    if (!editingName.trim()) {
      Alert.alert("Error", "Speaker name cannot be empty");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, name: editingName.trim() });
    }
  };

  const handleDeleteSpeaker = (id: string) => {
    Alert.alert(
      "Delete Speaker",
      "Are you sure you want to delete this speaker profile?",
      [
        { text: "Cancel", onPress: () => {} },
        {
          text: "Delete",
          onPress: () => deleteMutation.mutate(id),
          style: "destructive",
        },
      ]
    );
  };

  const renderSpeakerItem = ({ item }: { item: SpeakerProfile }) => {
    const isEditing = editingId === item.id;

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundSecondary, marginBottom: Spacing.lg },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
          }}
        >
          {isEditing ? (
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.md,
              }}
            >
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.backgroundTertiary, color: theme.text },
                ]}
                value={editingName}
                onChangeText={setEditingName}
                placeholder="Speaker name"
                placeholderTextColor={theme.textSecondary}
              />
              <Pressable onPress={handleSaveEdit} style={{ padding: Spacing.sm }}>
                <Feather name="check" size={20} color={theme.primary} />
              </Pressable>
              <Pressable
                onPress={() => setEditingId(null)}
                style={{ padding: Spacing.sm }}
              >
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 16, fontWeight: "500" }}>
                  {item.name}
                </ThemedText>
              </View>
              <Pressable
                onPress={() => {
                  setEditingId(item.id);
                  setEditingName(item.name);
                }}
                style={{ padding: Spacing.sm }}
              >
                <Feather name="edit-2" size={18} color={theme.primary} />
              </Pressable>
              <Pressable
                onPress={() => handleDeleteSpeaker(item.id)}
                style={{ padding: Spacing.sm }}
              >
                <Feather name="trash-2" size={18} color={theme.error} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: headerHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          backgroundColor: theme.backgroundRoot,
        },
      ]}
    >
      <View style={{ marginBottom: Spacing.xl }}>
        <ThemedText style={{ fontSize: 18, fontWeight: "600", marginBottom: Spacing.md }}>
          Add New Speaker
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            gap: Spacing.md,
            alignItems: "center",
          }}
        >
          <TextInput
            style={[
              styles.input,
              {
                flex: 1,
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
              },
            ]}
            value={newSpeakerName}
            onChangeText={setNewSpeakerName}
            placeholder="Speaker name"
            placeholderTextColor={theme.textSecondary}
          />
          <Pressable
            onPress={handleAddSpeaker}
            disabled={createMutation.isPending}
            style={[
              styles.addButton,
              { backgroundColor: theme.primary },
            ]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Feather name="plus" size={20} color="white" />
            )}
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={{ justifyContent: "center", alignItems: "center", marginTop: Spacing.xl }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : speakers.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: Spacing.xl }}>
          <Feather name="users" size={48} color={theme.textSecondary} />
          <ThemedText
            style={{
              marginTop: Spacing.md,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            No speakers yet. Add one to get started.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={speakers}
          renderItem={renderSpeakerItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: Spacing.lg }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    fontFamily: "system",
  },
  addButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
