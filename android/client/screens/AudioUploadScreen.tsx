import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import { queryClient, getApiUrl, apiRequest } from "@/lib/query-client";

interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

interface ApiDevice {
  id: string;
  name: string;
  type: string;
}

const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];

export default function AudioUploadScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation();

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: devicesData } = useQuery<ApiDevice[]>({
    queryKey: ['/api/devices'],
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePickFile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset) {
        return;
      }

      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        size: asset.size || 0,
        mimeType: asset.mimeType || "audio/mpeg",
      });
    } catch (error) {
      console.error("Error picking file:", error);
      Alert.alert("Error", "Failed to select file. Please try again.");
    }
  };

  const handleClearFile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFile(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert("No File Selected", "Please select an audio file first.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      let deviceId: string;
      
      if (devicesData && devicesData.length > 0) {
        deviceId = devicesData[0].id;
      } else {
        setUploadProgress(10);
        const createRes = await apiRequest('POST', '/api/devices', {
          name: 'Manual Upload',
          type: 'omi',
          isConnected: false,
        });
        const newDevice = await createRes.json();
        deviceId = newDevice.id;
      }

      setUploadProgress(20);

      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        const response = await fetch(selectedFile.uri);
        const blob = await response.blob();
        formData.append('audio', blob, selectedFile.name);
      } else {
        // React Native FormData expects { uri, name, type } object for file uploads
        formData.append('audio', {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.mimeType,
        } as any);
      }
      
      formData.append('deviceId', deviceId);

      setUploadProgress(40);

      const baseUrl = getApiUrl();
      const url = new URL('/api/transcribe-and-create-memory', baseUrl);

      const response = await fetch(url.toString(), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setUploadProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const memory = await response.json();

      setUploadProgress(100);

      await queryClient.invalidateQueries({ queryKey: ['/api/memories'], exact: false });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "Memory Created",
        `Your audio has been transcribed and saved as "${memory.title}"`,
        [
          {
            text: "View Memories",
            onPress: () => {
              setSelectedFile(null);
              navigation.goBack();
            },
          },
          {
            text: "Upload Another",
            onPress: () => setSelectedFile(null),
          },
        ]
      );
    } catch (error) {
      console.error("Upload error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Upload Failed",
        error instanceof Error ? error.message : "Failed to upload and transcribe audio. Please try again."
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

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
    >
      <View style={styles.iconSection}>
        <LinearGradient
          colors={Gradients.accent}
          style={styles.iconContainer}
        >
          <Feather name="upload-cloud" size={48} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText type="h2" style={styles.title}>
          Upload Audio
        </ThemedText>
        <ThemedText type="body" secondary style={styles.subtitle}>
          Select an audio file to transcribe and save as a memory
        </ThemedText>
      </View>

      <View style={styles.supportedFormats}>
        <ThemedText type="caption" secondary>
          Supported formats: MP3, M4A, WAV, OGG, WebM
        </ThemedText>
      </View>

      {selectedFile ? (
        <Card elevation={1} style={styles.fileCard}>
          <View style={styles.fileRow}>
            <View style={[styles.fileIcon, { backgroundColor: Colors.dark.primary }]}>
              <Feather name="music" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.fileInfo}>
              <ThemedText type="body" numberOfLines={1} style={{ fontWeight: "600" }}>
                {selectedFile.name}
              </ThemedText>
              <ThemedText type="caption" secondary>
                {formatFileSize(selectedFile.size)}
              </ThemedText>
            </View>
            <Pressable
              onPress={handleClearFile}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Feather name="x-circle" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={handlePickFile}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <View style={[styles.dropzone, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}>
            <Feather name="file-plus" size={40} color={Colors.dark.primary} />
            <ThemedText type="body" style={{ marginTop: Spacing.md, fontWeight: "600" }}>
              Tap to Select Audio File
            </ThemedText>
            <ThemedText type="small" secondary style={{ marginTop: Spacing.xs }}>
              Choose from your device
            </ThemedText>
          </View>
        </Pressable>
      )}

      {isUploading ? (
        <View style={styles.uploadingSection}>
          <View style={[styles.progressContainer, { backgroundColor: theme.backgroundDefault }]}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${uploadProgress}%`,
                  backgroundColor: Colors.dark.primary,
                },
              ]}
            />
          </View>
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={Colors.dark.primary} size="small" />
            <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
              {uploadProgress < 40
                ? "Uploading audio..."
                : uploadProgress < 80
                ? "Transcribing with Whisper..."
                : "Creating memory..."}
            </ThemedText>
          </View>
        </View>
      ) : (
        <View style={styles.buttonSection}>
          {selectedFile ? (
            <Button onPress={handleUpload}>
              Upload & Transcribe
            </Button>
          ) : null}
          
          {selectedFile ? (
            <Pressable
              onPress={handlePickFile}
              style={({ pressed }) => [
                styles.secondaryButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="refresh-cw" size={18} color={Colors.dark.primary} />
              <ThemedText type="body" style={{ color: Colors.dark.primary, marginLeft: Spacing.sm }}>
                Choose Different File
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      )}

      <View style={styles.tipsSection}>
        <ThemedText type="h4" style={styles.tipsTitle}>
          Tips for Best Results
        </ThemedText>
        <View style={styles.tipItem}>
          <Feather name="check-circle" size={16} color={Colors.dark.success} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Use clear audio with minimal background noise
          </ThemedText>
        </View>
        <View style={styles.tipItem}>
          <Feather name="check-circle" size={16} color={Colors.dark.success} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Files up to 25 MB are supported
          </ThemedText>
        </View>
        <View style={styles.tipItem}>
          <Feather name="check-circle" size={16} color={Colors.dark.success} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Longer recordings may take more time to process
          </ThemedText>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  iconSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  supportedFormats: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  fileCard: {
    marginBottom: Spacing.lg,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  dropzone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  buttonSection: {
    marginBottom: Spacing.xl,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  uploadingSection: {
    marginBottom: Spacing.xl,
  },
  progressContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  tipsSection: {
    padding: Spacing.lg,
  },
  tipsTitle: {
    marginBottom: Spacing.md,
  },
  tipItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  tipText: {
    flex: 1,
  },
});
