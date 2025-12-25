import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useMutation } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors, Gradients } from "@/constants/theme";
import { queryClient, getApiUrl, apiRequest, getAuthHeaders } from "@/lib/query-client";

interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  fileType: "audio" | "image" | "document" | "video" | "other";
}

interface Upload {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileType: string;
  fileSize: number;
  tags: string[];
  status: string;
  processingResult?: any;
  memoryId?: string;
  sentToZekeAt?: string;
  createdAt: string;
}

const FILE_TYPE_CONFIG = {
  audio: {
    icon: "music" as const,
    color: Colors.dark.primary,
    label: "Audio",
    description: "Will be transcribed using AI",
  },
  image: {
    icon: "image" as const,
    color: Colors.dark.accent,
    label: "Image",
    description: "Will be analyzed using AI vision",
  },
  document: {
    icon: "file-text" as const,
    color: Colors.dark.success,
    label: "Document",
    description: "Text will be extracted",
  },
  video: {
    icon: "video" as const,
    color: Colors.dark.warning,
    label: "Video",
    description: "Will be stored for reference",
  },
  other: {
    icon: "file" as const,
    color: Colors.dark.secondary,
    label: "File",
    description: "Will be stored for reference",
  },
};

function getFileType(mimeType: string): SelectedFile["fileType"] {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text/")) return "document";
  return "other";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploadScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation();

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showLibrary, setShowLibrary] = useState(false);

  const { data: uploads = [], refetch: refetchUploads } = useQuery<Upload[]>({
    queryKey: ["/api/uploads"],
  });

  const sendToZekeMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/uploads/${uploadId}/send-to-zeke`, baseUrl);
      const res = await fetch(url.toString(), { 
        method: "POST", 
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Send failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
    },
  });

  const deleteUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/uploads/${uploadId}`, baseUrl);
      const res = await fetch(url.toString(), { 
        method: "DELETE", 
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
    },
  });

  const handlePickDocument = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      const fileType = getFileType(asset.mimeType || "application/octet-stream");
      setSelectedFile({
        uri: asset.uri,
        name: asset.name,
        size: asset.size || 0,
        mimeType: asset.mimeType || "application/octet-stream",
        fileType,
      });
    } catch (error) {
      console.error("Error picking document:", error);
      Alert.alert("Error", "Failed to select file. Please try again.");
    }
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) return;

      const mimeType = asset.type === "video" ? "video/mp4" : "image/jpeg";
      const fileType = asset.type === "video" ? "video" : "image";
      const fileName = asset.fileName || `${fileType}_${Date.now()}.${fileType === "video" ? "mp4" : "jpg"}`;

      setSelectedFile({
        uri: asset.uri,
        name: fileName,
        size: asset.fileSize || 0,
        mimeType,
        fileType,
      });
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to select image. Please try again.");
    }
  };

  const handleClearFile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFile(null);
    setTags([]);
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Alert.alert("No File Selected", "Please select a file first.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(20);

      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(selectedFile.uri);
        const blob = await response.blob();
        formData.append("file", blob, selectedFile.name);
      } else {
        formData.append("file", {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.mimeType,
        } as any);
      }

      formData.append("tags", JSON.stringify(tags));

      setUploadProgress(40);

      const baseUrl = getApiUrl();
      const uploadUrl = new URL("/api/uploads", baseUrl);

      const response = await fetch(uploadUrl.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: getAuthHeaders(),
      });

      setUploadProgress(60);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const uploadResult = await response.json();
      setUploadProgress(70);

      // Send directly to ZEKE backend for processing
      try {
        await sendToZekeMutation.mutateAsync(uploadResult.id);
        setUploadProgress(100);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        Alert.alert(
          "Success",
          `Your ${selectedFile.fileType} has been sent to ZEKE for processing!`,
          [
            {
              text: "OK",
              onPress: () => {
                setSelectedFile(null);
                setTags([]);
                refetchUploads();
              },
            },
          ]
        );
      } catch (zekerror) {
        // File uploaded but ZEKE forward failed - user can retry from library
        console.error("ZEKE forward error:", zekerror);
        setUploadProgress(100);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "File Saved",
          "Your file was saved but couldn't be sent to ZEKE right now. You can retry from your file library.",
          [
            {
              text: "OK",
              onPress: () => {
                setSelectedFile(null);
                setTags([]);
                setShowLibrary(true);
                refetchUploads();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error("Upload error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Upload Failed",
        error instanceof Error ? error.message : "Failed to upload file. Please try again."
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteUpload = (upload: Upload) => {
    Alert.alert(
      "Delete Upload",
      `Are you sure you want to delete "${upload.originalName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUploadMutation.mutateAsync(upload.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert("Error", "Failed to delete upload");
            }
          },
        },
      ]
    );
  };

  const handleSendToZeke = async (upload: Upload) => {
    try {
      await sendToZekeMutation.mutateAsync(upload.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Content sent to ZEKE for processing!");
    } catch {
      Alert.alert("Error", "Failed to send to ZEKE");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return Colors.dark.warning;
      case "processing": return Colors.dark.primary;
      case "processed": return Colors.dark.success;
      case "sent": return Colors.dark.accent;
      case "error": return Colors.dark.error;
      default: return theme.textSecondary;
    }
  };

  const renderUploadItem = useCallback(({ item }: { item: Upload }) => {
    const config = FILE_TYPE_CONFIG[item.fileType as keyof typeof FILE_TYPE_CONFIG] || FILE_TYPE_CONFIG.other;
    const isSent = item.status === "sent";

    return (
      <Card elevation={1} style={styles.uploadItem}>
        <View style={styles.uploadItemRow}>
          <View style={[styles.fileTypeIcon, { backgroundColor: config.color }]}>
            <Feather name={config.icon} size={20} color="#FFFFFF" />
          </View>
          <View style={styles.uploadItemInfo}>
            <ThemedText type="body" numberOfLines={1} style={{ fontWeight: "600" }}>
              {item.originalName}
            </ThemedText>
            <View style={styles.uploadItemMeta}>
              <ThemedText type="caption" secondary>
                {formatFileSize(item.fileSize)}
              </ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                <ThemedText type="caption" style={{ color: getStatusColor(item.status) }}>
                  {item.status}
                </ThemedText>
              </View>
            </View>
            {item.tags && item.tags.length > 0 ? (
              <View style={styles.tagRow}>
                {item.tags.slice(0, 3).map((tag, i) => (
                  <View key={i} style={[styles.tagBadge, { backgroundColor: theme.backgroundSecondary }]}>
                    <ThemedText type="caption" secondary>#{tag}</ThemedText>
                  </View>
                ))}
                {item.tags.length > 3 ? (
                  <ThemedText type="caption" secondary>+{item.tags.length - 3}</ThemedText>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.uploadItemActions}>
            {!isSent ? (
              <Pressable
                onPress={() => handleSendToZeke(item)}
                style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.7 : 1, backgroundColor: Colors.dark.primary + "20" }]}
              >
                <Feather name="send" size={18} color={Colors.dark.primary} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => handleDeleteUpload(item)}
              style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.7 : 1, backgroundColor: Colors.dark.error + "20" }]}
            >
              <Feather name="trash-2" size={18} color={Colors.dark.error} />
            </Pressable>
          </View>
        </View>
      </Card>
    );
  }, [theme, sendToZekeMutation.isPending, deleteUploadMutation.isPending]);

  if (showLibrary) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
        <View style={[styles.libraryHeader, { paddingTop: headerHeight + Spacing.md }]}>
          <Pressable onPress={() => setShowLibrary(false)} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h3">Your Uploads</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <FlatList
          data={uploads}
          keyExtractor={(item) => item.id}
          renderItem={renderUploadItem}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={48} color={theme.textSecondary} />
              <ThemedText type="body" secondary style={{ marginTop: Spacing.md }}>
                No uploads yet
              </ThemedText>
            </View>
          }
        />
      </View>
    );
  }

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
        <LinearGradient colors={Gradients.accent} style={styles.iconContainer}>
          <Feather name="upload-cloud" size={48} color="#FFFFFF" />
        </LinearGradient>
        <ThemedText type="h2" style={styles.title}>
          Upload to ZEKE
        </ThemedText>
        <ThemedText type="body" secondary style={styles.subtitle}>
          Upload any file to process, tag, and send to ZEKE
        </ThemedText>
      </View>

      <View style={styles.supportedFormats}>
        <ThemedText type="caption" secondary>
          Audio, Images, Documents, PDFs, and more
        </ThemedText>
      </View>

      {selectedFile ? (
        <Card elevation={1} style={styles.fileCard}>
          <View style={styles.fileRow}>
            <View
              style={[
                styles.fileIcon,
                { backgroundColor: FILE_TYPE_CONFIG[selectedFile.fileType].color },
              ]}
            >
              <Feather name={FILE_TYPE_CONFIG[selectedFile.fileType].icon} size={24} color="#FFFFFF" />
            </View>
            <View style={styles.fileInfo}>
              <ThemedText type="body" numberOfLines={1} style={{ fontWeight: "600" }}>
                {selectedFile.name}
              </ThemedText>
              <ThemedText type="caption" secondary>
                {formatFileSize(selectedFile.size)} - {FILE_TYPE_CONFIG[selectedFile.fileType].label}
              </ThemedText>
              <ThemedText type="small" secondary style={{ marginTop: Spacing.xs }}>
                {FILE_TYPE_CONFIG[selectedFile.fileType].description}
              </ThemedText>
            </View>
            <Pressable onPress={handleClearFile} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Feather name="x-circle" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.tagsSection}>
            <ThemedText type="small" style={{ fontWeight: "600", marginBottom: Spacing.sm }}>
              Tags (optional)
            </ThemedText>
            <View style={styles.tagInputRow}>
              <TextInput
                value={newTag}
                onChangeText={setNewTag}
                placeholder="Add a tag..."
                placeholderTextColor={theme.textSecondary}
                style={[styles.tagInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
                onSubmitEditing={handleAddTag}
                returnKeyType="done"
              />
              <Pressable onPress={handleAddTag} style={[styles.addTagButton, { backgroundColor: Colors.dark.primary }]}>
                <Feather name="plus" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            {tags.length > 0 ? (
              <View style={styles.tagsRow}>
                {tags.map((tag, index) => (
                  <Pressable
                    key={index}
                    onPress={() => handleRemoveTag(tag)}
                    style={[styles.tag, { backgroundColor: Colors.dark.primary, borderWidth: 1, borderColor: Colors.dark.primary }]}
                  >
                    <ThemedText type="caption" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                      #{tag}
                    </ThemedText>
                    <Feather name="x" size={12} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Card>
      ) : (
        <View style={styles.pickersContainer}>
          <Pressable onPress={handlePickDocument} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, flex: 1 })}>
            <View style={[styles.pickerCard, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}>
              <Feather name="file-plus" size={32} color={Colors.dark.primary} />
              <ThemedText type="body" style={{ marginTop: Spacing.sm, fontWeight: "600" }}>
                Any File
              </ThemedText>
              <ThemedText type="small" secondary style={{ marginTop: Spacing.xs, textAlign: "center" }}>
                Documents, audio, PDFs
              </ThemedText>
            </View>
          </Pressable>

          <Pressable onPress={handlePickImage} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, flex: 1 })}>
            <View style={[styles.pickerCard, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}>
              <Feather name="image" size={32} color={Colors.dark.accent} />
              <ThemedText type="body" style={{ marginTop: Spacing.sm, fontWeight: "600" }}>
                Photo/Video
              </ThemedText>
              <ThemedText type="small" secondary style={{ marginTop: Spacing.xs, textAlign: "center" }}>
                From camera roll
              </ThemedText>
            </View>
          </Pressable>
        </View>
      )}

      {isUploading ? (
        <View style={styles.uploadingSection}>
          <View style={[styles.progressContainer, { backgroundColor: theme.backgroundDefault }]}>
            <View
              style={[styles.progressBar, { width: `${uploadProgress}%`, backgroundColor: Colors.dark.primary }]}
            />
          </View>
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={Colors.dark.primary} size="small" />
            <ThemedText type="body" style={{ marginLeft: Spacing.sm, flex: 1 }}>
              {uploadProgress < 40
                ? "Uploading..."
                : uploadProgress < 80
                  ? "Processing with AI..."
                  : "Almost done..."}
            </ThemedText>
            <Pressable
              onPress={() => {
                setIsUploading(false);
                setUploadProgress(0);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={({ pressed }) => [
                styles.cancelButton,
                { backgroundColor: Colors.dark.error, opacity: pressed ? 0.8 : 1 }
              ]}
            >
              <ThemedText type="caption" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.buttonSection}>
          {selectedFile ? (
            <Button onPress={handleUpload}>Upload & Process</Button>
          ) : null}
        </View>
      )}

      {uploads.length > 0 ? (
        <Pressable
          onPress={() => setShowLibrary(true)}
          style={({ pressed }) => [styles.libraryButton, { opacity: pressed ? 0.7 : 1, borderColor: theme.border }]}
        >
          <Feather name="folder" size={20} color={Colors.dark.primary} />
          <ThemedText type="body" style={{ color: Colors.dark.primary, marginLeft: Spacing.sm }}>
            View Your Uploads ({uploads.length})
          </ThemedText>
          <Feather name="chevron-right" size={20} color={Colors.dark.primary} style={{ marginLeft: "auto" }} />
        </Pressable>
      ) : null}

      <View style={styles.tipsSection}>
        <ThemedText type="h4" style={styles.tipsTitle}>
          What ZEKE Can Process
        </ThemedText>
        <View style={styles.tipItem}>
          <Feather name="music" size={16} color={Colors.dark.primary} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Audio: Transcribed to text with Whisper AI
          </ThemedText>
        </View>
        <View style={styles.tipItem}>
          <Feather name="image" size={16} color={Colors.dark.accent} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Images: Analyzed and described with GPT-4 Vision
          </ThemedText>
        </View>
        <View style={styles.tipItem}>
          <Feather name="file-text" size={16} color={Colors.dark.success} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Documents: Text extracted and summarized
          </ThemedText>
        </View>
        <View style={styles.tipItem}>
          <Feather name="tag" size={16} color={Colors.dark.secondary} />
          <ThemedText type="small" secondary style={styles.tipText}>
            Add tags to organize and find uploads easily
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
  pickersContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pickerCard: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
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
  tagsSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  tagInputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  tagInput: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
  },
  addTagButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  buttonSection: {
    marginBottom: Spacing.xl,
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
  cancelButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginLeft: Spacing.sm,
  },
  libraryButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.xl,
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
  libraryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadItem: {
    marginBottom: Spacing.md,
  },
  uploadItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  fileTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  uploadItemInfo: {
    flex: 1,
  },
  uploadItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  tagBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  uploadItemActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["3xl"],
  },
});
