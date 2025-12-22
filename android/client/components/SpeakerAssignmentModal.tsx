import React, { useState, useEffect } from "react";
import {
  View,
  Modal,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ThemedText } from "./ThemedText";
import { SpeakerTag } from "./SpeakerTag";
import { Button } from "./Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import {
  type SpeakerMapping,
  getSpeakerColor,
  createDefaultMappings,
  assignProfileToSpeaker,
} from "@/lib/speaker-matcher";

interface SpeakerProfile {
  id: string;
  deviceId: string;
  name: string;
  voiceCharacteristics?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface SpeakerAssignmentModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (mappings: SpeakerMapping[], speakerNames: string[]) => void;
  speakerCount: number;
  sessionId?: string;
}

export function SpeakerAssignmentModal({
  visible,
  onClose,
  onComplete,
  speakerCount,
  sessionId,
}: SpeakerAssignmentModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { deviceId } = useAuth();
  const queryClient = useQueryClient();

  const [mappings, setMappings] = useState<SpeakerMapping[]>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<number | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");

  const { data: profiles = [], isLoading } = useQuery<SpeakerProfile[]>({
    queryKey: ["/api/speakers", deviceId],
    enabled: visible && !!deviceId,
  });

  const createProfileMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, name }),
      });
      return res.json();
    },
    onSuccess: (newProfile) => {
      queryClient.invalidateQueries({ queryKey: ["/api/speakers", deviceId] });
      if (selectedSpeaker !== null) {
        handleAssignProfile(selectedSpeaker, newProfile);
      }
      setNewSpeakerName("");
    },
  });

  useEffect(() => {
    if (visible && speakerCount > 0) {
      setMappings(createDefaultMappings(speakerCount));
      setSelectedSpeaker(null);
    }
  }, [visible, speakerCount]);

  const handleAssignProfile = (speakerNumber: number, profile: SpeakerProfile) => {
    setMappings((prev) => assignProfileToSpeaker(prev, speakerNumber, profile));
    setSelectedSpeaker(null);
  };

  const handleCreateAndAssign = () => {
    if (!newSpeakerName.trim()) {
      Alert.alert("Error", "Please enter a name for the speaker");
      return;
    }
    createProfileMutation.mutate(newSpeakerName.trim());
  };

  const handleComplete = () => {
    const speakerNames = mappings.map((m) =>
      m.profileName || `Speaker ${m.speakerNumber + 1}`
    );
    onComplete(mappings, speakerNames);
  };

  const handleSkip = () => {
    const defaultNames = Array.from({ length: speakerCount }, (_, i) => `Speaker ${i + 1}`);
    onComplete(createDefaultMappings(speakerCount), defaultNames);
  };

  const renderSpeakerItem = ({ item }: { item: SpeakerMapping }) => (
    <Pressable
      onPress={() => setSelectedSpeaker(item.speakerNumber)}
      style={[
        styles.speakerItem,
        { backgroundColor: theme.backgroundDefault },
        selectedSpeaker === item.speakerNumber && {
          borderColor: theme.primary,
          borderWidth: 2,
        },
      ]}
    >
      <SpeakerTag
        label={item.profileName || `Speaker ${item.speakerNumber + 1}`}
        color={getSpeakerColor(item.speakerNumber)}
        isUnknown={item.isUnknown}
        size="medium"
      />
      {item.isUnknown ? (
        <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>
          Tap to assign
        </ThemedText>
      ) : (
        <Feather name="check-circle" size={20} color={theme.success} />
      )}
    </Pressable>
  );

  const renderProfileItem = ({ item }: { item: SpeakerProfile }) => (
    <Pressable
      onPress={() => {
        if (selectedSpeaker !== null) {
          handleAssignProfile(selectedSpeaker, item);
        }
      }}
      style={[
        styles.profileItem,
        { backgroundColor: theme.backgroundSecondary },
      ]}
    >
      <Feather name="user" size={18} color={theme.primary} />
      <ThemedText style={{ marginLeft: Spacing.sm }}>{item.name}</ThemedText>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
          },
        ]}
      >
        <View style={styles.header}>
          <View>
            <ThemedText type="h3">Label Speakers</ThemedText>
            <ThemedText style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
              Identify who was speaking
            </ThemedText>
          </View>
          <Pressable onPress={onClose} hitSlop={16}>
            <Feather name="x" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.speakersSection}>
          <ThemedText type="h4" style={{ marginBottom: Spacing.md }}>
            Detected Speakers ({speakerCount})
          </ThemedText>
          <FlatList
            data={mappings}
            renderItem={renderSpeakerItem}
            keyExtractor={(item) => `speaker-${item.speakerNumber}`}
            scrollEnabled={false}
          />
        </View>

        {selectedSpeaker !== null ? (
          <View style={styles.assignSection}>
            <ThemedText type="h4" style={{ marginBottom: Spacing.md }}>
              Assign Speaker {selectedSpeaker + 1} to:
            </ThemedText>

            {isLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : profiles.length > 0 ? (
              <FlatList
                data={profiles}
                renderItem={renderProfileItem}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 200 }}
              />
            ) : null}

            <View style={styles.newProfileSection}>
              <ThemedText style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                Or create new profile:
              </ThemedText>
              <View style={styles.newProfileRow}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                    },
                  ]}
                  value={newSpeakerName}
                  onChangeText={setNewSpeakerName}
                  placeholder="Enter name..."
                  placeholderTextColor={theme.textSecondary}
                />
                <Pressable
                  onPress={handleCreateAndAssign}
                  disabled={createProfileMutation.isPending}
                  style={[styles.addButton, { backgroundColor: theme.primary }]}
                >
                  {createProfileMutation.isPending ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Feather name="plus" size={20} color="white" />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={handleSkip}
            style={[
              styles.outlineButton,
              { borderColor: theme.textSecondary, flex: 1, marginRight: Spacing.md },
            ]}
          >
            <ThemedText style={{ color: theme.textSecondary }}>Skip for Now</ThemedText>
          </Pressable>
          <Pressable
            onPress={handleComplete}
            style={[styles.primaryButton, { backgroundColor: theme.primary, flex: 1 }]}
          >
            <ThemedText style={{ color: "white" }}>Done</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xl,
  },
  speakersSection: {
    marginBottom: Spacing.xl,
  },
  speakerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  assignSection: {
    flex: 1,
  },
  profileItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  newProfileSection: {
    marginTop: Spacing.lg,
  },
  newProfileRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    fontSize: 16,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    flexDirection: "row",
    marginTop: Spacing.xl,
  },
  outlineButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
