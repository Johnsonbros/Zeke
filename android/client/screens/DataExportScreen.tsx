import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

import { ThemedText } from "@/components/ThemedText";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { Memory } from "@/lib/storage";
import { Message } from "@/components/ChatBubble";
import { getRecentMemories, getConversations, getConversationMessages, ZekeMemory, ZekeMessage } from "@/lib/zeke-api-adapter";

type ExportType = "memories" | "conversations" | "all";
type ExportFormat = "pdf" | "markdown";

interface RadioOptionProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

function RadioOption({ icon, label, description, selected, onSelect }: RadioOptionProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect();
      }}
      style={[
        styles.radioOption,
        { backgroundColor: theme.backgroundDefault },
        selected && { borderColor: Colors.dark.primary, borderWidth: 2 },
      ]}
    >
      <View style={[styles.radioIconContainer, { backgroundColor: selected ? Colors.dark.primary : theme.backgroundSecondary }]}>
        <Feather name={icon} size={20} color={selected ? "#FFFFFF" : theme.textSecondary} />
      </View>
      <View style={styles.radioTextContainer}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>{label}</ThemedText>
        <ThemedText type="caption" secondary>{description}</ThemedText>
      </View>
      <View style={[styles.radioCircle, { borderColor: selected ? Colors.dark.primary : theme.border }]}>
        {selected ? <View style={[styles.radioCircleFilled, { backgroundColor: Colors.dark.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

function convertZekeMemoryToMemory(zekeMemory: ZekeMemory): Memory {
  const date = new Date(zekeMemory.createdAt);
  const formattedDate = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  
  return {
    id: zekeMemory.id,
    title: zekeMemory.title,
    transcript: zekeMemory.transcript,
    timestamp: formattedDate,
    deviceType: 'omi',
    speakers: Array.isArray(zekeMemory.speakers) ? zekeMemory.speakers : [],
    isStarred: zekeMemory.isStarred,
    duration: zekeMemory.duration ? `${Math.round(zekeMemory.duration / 60)} min` : undefined,
  };
}

function convertZekeMessageToMessage(zekeMessage: ZekeMessage): Message {
  const date = new Date(zekeMessage.createdAt);
  const formattedTime = date.toLocaleTimeString('en-US', { 
    hour: 'numeric',
    minute: '2-digit'
  });
  
  return {
    id: zekeMessage.id,
    content: zekeMessage.content,
    role: zekeMessage.role,
    timestamp: formattedTime,
  };
}

export default function DataExportScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [memoriesCount, setMemoriesCount] = useState(0);
  const [messagesCount, setMessagesCount] = useState(0);
  const [exportType, setExportType] = useState<ExportType>("all");

  useEffect(() => {
    async function checkDataAvailability() {
      setIsLoading(true);
      try {
        const [memories, conversations] = await Promise.all([
          getRecentMemories(100),
          getConversations()
        ]);
        
        setMemoriesCount(memories.length);
        
        let totalMessages = 0;
        for (const conv of conversations.slice(0, 5)) {
          const messages = await getConversationMessages(conv.id);
          totalMessages += messages.length;
        }
        setMessagesCount(totalMessages);
      } catch (error) {
        console.error('Error checking data availability:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    checkDataAvailability();
  }, []);

  const generateMemoriesMarkdown = (memories: Memory[]): string => {
    let markdown = "# ZEKE AI - Memories Export\n\n";
    markdown += `**Exported on:** ${new Date().toLocaleDateString()}\n\n`;
    markdown += `**Total memories:** ${memories.length}\n\n`;
    markdown += "---\n\n";

    memories.forEach((memory, index) => {
      markdown += `## ${index + 1}. ${memory.title}\n\n`;
      markdown += `**Date:** ${memory.timestamp}\n`;
      markdown += `**Duration:** ${memory.duration || "N/A"}\n`;
      markdown += `**Device:** ${memory.deviceType === "omi" ? "Omi" : "Limitless"}\n`;
      if (memory.speakers && memory.speakers.length > 0) {
        markdown += `**Speakers:** ${memory.speakers.join(", ")}\n`;
      }
      markdown += memory.isStarred ? `**Starred:** Yes\n` : "";
      markdown += `\n### Transcript\n\n${memory.transcript}\n\n`;
      markdown += "---\n\n";
    });

    return markdown;
  };

  const generateConversationsMarkdown = (messages: Message[]): string => {
    let markdown = "# ZEKE AI - Conversations Export\n\n";
    markdown += `**Exported on:** ${new Date().toLocaleDateString()}\n\n`;
    markdown += `**Total messages:** ${messages.length}\n\n`;
    markdown += "---\n\n";

    messages.forEach((message) => {
      const role = message.role === "user" ? "You" : "ZEKE AI";
      markdown += `### ${role} (${message.timestamp})\n\n`;
      markdown += `${message.content}\n\n`;
    });

    return markdown;
  };

  const generateMemoriesHTML = (memories: Memory[]): string => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>ZEKE AI - Memories Export</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; }
            h1 { color: #6366F1; border-bottom: 2px solid #6366F1; padding-bottom: 10px; }
            h2 { color: #4F46E5; margin-top: 30px; }
            .meta { color: #666; font-size: 14px; margin-bottom: 10px; }
            .badge { display: inline-block; background: #E0E7FF; color: #4338CA; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px; }
            .starred { color: #F59E0B; }
            .transcript { background: #F9FAFB; padding: 15px; border-radius: 8px; margin-top: 10px; line-height: 1.6; }
            .divider { border-top: 1px solid #E5E7EB; margin: 30px 0; }
            .summary { background: #EEF2FF; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <h1>ZEKE AI - Memories Export</h1>
          <div class="summary">
            <strong>Exported on:</strong> ${new Date().toLocaleDateString()}<br>
            <strong>Total memories:</strong> ${memories.length}
          </div>
          ${memories.map((memory, index) => `
            <div class="memory">
              <h2>${index + 1}. ${memory.title}</h2>
              <div class="meta">
                <span class="badge">${memory.deviceType === "omi" ? "Omi" : "Limitless"}</span>
                ${memory.isStarred ? '<span class="starred">&#9733; Starred</span>' : ""}
                <br><br>
                <strong>Date:</strong> ${memory.timestamp}<br>
                <strong>Duration:</strong> ${memory.duration || "N/A"}<br>
                ${memory.speakers && memory.speakers.length > 0 ? `<strong>Speakers:</strong> ${memory.speakers.join(", ")}` : ""}
              </div>
              <div class="transcript">
                ${memory.transcript}
              </div>
            </div>
            <div class="divider"></div>
          `).join("")}
        </body>
      </html>
    `;
  };

  const generateConversationsHTML = (messages: Message[]): string => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>ZEKE AI - Conversations Export</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; }
            h1 { color: #6366F1; border-bottom: 2px solid #6366F1; padding-bottom: 10px; }
            .summary { background: #EEF2FF; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
            .message { margin-bottom: 20px; padding: 15px; border-radius: 12px; }
            .user { background: #6366F1; color: white; margin-left: 40px; }
            .assistant { background: #F3F4F6; margin-right: 40px; }
            .sender { font-weight: bold; margin-bottom: 5px; }
            .time { font-size: 12px; opacity: 0.7; }
            .content { line-height: 1.6; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>ZEKE AI - Conversations Export</h1>
          <div class="summary">
            <strong>Exported on:</strong> ${new Date().toLocaleDateString()}<br>
            <strong>Total messages:</strong> ${messages.length}
          </div>
          ${messages.map((message) => `
            <div class="message ${message.role}">
              <div class="sender">
                ${message.role === "user" ? "You" : "ZEKE AI"} 
                <span class="time">${message.timestamp}</span>
              </div>
              <div class="content">${message.content}</div>
            </div>
          `).join("")}
        </body>
      </html>
    `;
  };

  const checkSharingAvailability = async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Export Not Available",
        "File export is not available on web. Please use the ZEKE app on your mobile device to export data."
      );
      return false;
    }
    
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert(
        "Sharing Not Available",
        "File sharing is not available on this device. Please try on a different device."
      );
      return false;
    }
    return true;
  };

  const exportData = async (format: ExportFormat) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const canShare = await checkSharingAvailability();
    if (!canShare) return;
    
    setIsExporting(true);

    try {
      let memories: Memory[] = [];
      let messages: Message[] = [];

      if (exportType !== "conversations") {
        const zekeMemories = await getRecentMemories(100);
        memories = zekeMemories.map(convertZekeMemoryToMemory);
      }

      if (exportType !== "memories") {
        const conversations = await getConversations();
        const allMessages: Message[] = [];
        
        for (const conv of conversations) {
          const convMessages = await getConversationMessages(conv.id);
          allMessages.push(...convMessages.map(convertZekeMessageToMessage));
        }
        messages = allMessages;
      }

      if (memories.length === 0 && messages.length === 0) {
        Alert.alert(
          "No Data Available",
          "There is no data available to export. Start recording memories or chatting with ZEKE to create exportable data."
        );
        return;
      }

      if (format === "markdown") {
        await exportMarkdown(memories, messages);
      } else {
        await exportPDF(memories, messages);
      }
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert("Export Failed", "There was an error exporting your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportMarkdown = async (memories: Memory[], messages: Message[]) => {
    let content = "";
    let filename = "zeke-export";

    if (memories.length > 0) {
      content += generateMemoriesMarkdown(memories);
      filename = "zeke-memories";
    }
    if (messages.length > 0) {
      if (content) content += "\n\n";
      content += generateConversationsMarkdown(messages);
      filename = memories.length > 0 ? "zeke-export" : "zeke-conversations";
    }

    const fileUri = `${FileSystem.documentDirectory}${filename}.md`;
    await FileSystem.writeAsStringAsync(fileUri, content);

    await Sharing.shareAsync(fileUri, {
      mimeType: "text/markdown",
      dialogTitle: "Export ZEKE Data",
      UTI: "net.daringfireball.markdown",
    });
  };

  const exportPDF = async (memories: Memory[], messages: Message[]) => {
    let html = "";
    let filename = "zeke-export";

    if (memories.length > 0 && messages.length > 0) {
      const memoriesHTML = generateMemoriesHTML(memories);
      const conversationsHTML = generateConversationsHTML(messages);
      html = memoriesHTML.replace("</body></html>", "") + 
        '<div style="page-break-before: always;"></div>' + 
        conversationsHTML.replace(/<!DOCTYPE html>[\s\S]*?<body>/, "");
      filename = "zeke-export";
    } else if (memories.length > 0) {
      html = generateMemoriesHTML(memories);
      filename = "zeke-memories";
    } else if (messages.length > 0) {
      html = generateConversationsHTML(messages);
      filename = "zeke-conversations";
    }

    const { uri } = await Print.printToFileAsync({ html });

    const pdfUri = `${FileSystem.documentDirectory}${filename}.pdf`;
    await FileSystem.moveAsync({
      from: uri,
      to: pdfUri,
    });

    await Sharing.shareAsync(pdfUri, {
      mimeType: "application/pdf",
      dialogTitle: "Export ZEKE Data",
      UTI: "com.adobe.pdf",
    });
  };

  const hasNoData = memoriesCount === 0 && messagesCount === 0;
  const canExportSelection = 
    (exportType === "all" && (memoriesCount > 0 || messagesCount > 0)) ||
    (exportType === "memories" && memoriesCount > 0) ||
    (exportType === "conversations" && messagesCount > 0);

  if (isLoading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.backgroundRoot, paddingTop: headerHeight + Spacing.xl }]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
        <ThemedText type="body" secondary style={{ marginTop: Spacing.lg }}>
          Checking available data...
        </ThemedText>
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
      <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }]}>
        <ThemedText type="body">
          Export your memories and conversations to share or backup your data. Choose what to include and your preferred format.
        </ThemedText>
      </View>

      <View style={[styles.dataStatusCard, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.dataStatusRow}>
          <Feather name="file-text" size={18} color={memoriesCount > 0 ? Colors.dark.success : theme.textSecondary} />
          <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
            {memoriesCount} {memoriesCount === 1 ? 'memory' : 'memories'} available
          </ThemedText>
        </View>
        <View style={styles.dataStatusRow}>
          <Feather name="message-circle" size={18} color={messagesCount > 0 ? Colors.dark.success : theme.textSecondary} />
          <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
            {messagesCount} {messagesCount === 1 ? 'message' : 'messages'} available
          </ThemedText>
        </View>
      </View>

      {hasNoData ? (
        <View style={[styles.emptyState, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="inbox" size={48} color={theme.textSecondary} />
          <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: 'center' }}>
            No Data to Export
          </ThemedText>
          <ThemedText type="body" secondary style={{ marginTop: Spacing.sm, textAlign: 'center' }}>
            Start recording memories or chatting with ZEKE to create exportable data.
          </ThemedText>
        </View>
      ) : (
        <>
          <SettingsSection title="WHAT TO EXPORT">
            <View style={styles.radioGroup}>
              <RadioOption
                icon="layers"
                label="All Data"
                description={`${memoriesCount} memories, ${messagesCount} messages`}
                selected={exportType === "all"}
                onSelect={() => setExportType("all")}
              />
              <RadioOption
                icon="file-text"
                label="Memories Only"
                description={`${memoriesCount} recorded memories`}
                selected={exportType === "memories"}
                onSelect={() => setExportType("memories")}
              />
              <RadioOption
                icon="message-circle"
                label="Conversations Only"
                description={`${messagesCount} chat messages`}
                selected={exportType === "conversations"}
                onSelect={() => setExportType("conversations")}
              />
            </View>
          </SettingsSection>

          <SettingsSection title="EXPORT FORMAT">
            <View style={{ borderRadius: BorderRadius.md, overflow: "hidden" }}>
              <SettingsRow
                icon="file"
                label="Export as PDF"
                value="Formatted document"
                onPress={() => exportData("pdf")}
                disabled={isExporting || !canExportSelection}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingsRow
                icon="hash"
                label="Export as Markdown"
                value="Plain text format"
                onPress={() => exportData("markdown")}
                disabled={isExporting || !canExportSelection}
              />
            </View>
            {isExporting ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.dark.primary} />
                <ThemedText type="caption" secondary style={styles.loadingText}>
                  Preparing export...
                </ThemedText>
              </View>
            ) : null}
            {!canExportSelection && !isExporting ? (
              <ThemedText type="caption" secondary style={{ marginTop: Spacing.sm, marginLeft: Spacing.lg }}>
                No data available for selected export type.
              </ThemedText>
            ) : null}
          </SettingsSection>
        </>
      )}

      {Platform.OS === "web" ? (
        <View style={[styles.webWarning, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="info" size={16} color={Colors.dark.warning} />
          <ThemedText type="caption" style={styles.webWarningText}>
            Export is only available in the mobile app. Use Expo Go to access this feature.
          </ThemedText>
        </View>
      ) : null}

      {!hasNoData ? (
        <ThemedText type="caption" secondary style={styles.footerNote}>
          Exported files can be shared via email, saved to your files, or sent to other apps on your device.
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  dataStatusCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  dataStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyState: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  radioGroup: {
    gap: Spacing.sm,
  },
  radioOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  radioIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  radioTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleFilled: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  divider: {
    height: 1,
    marginLeft: Spacing.lg + 32 + Spacing.md,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    marginLeft: Spacing.lg,
  },
  loadingText: {
    marginLeft: Spacing.sm,
  },
  webWarning: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  webWarningText: {
    flex: 1,
    color: Colors.dark.warning,
  },
  footerNote: {
    textAlign: "center",
    marginTop: Spacing.lg,
  },
});
