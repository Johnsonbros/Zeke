import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQueryClient } from "@tanstack/react-query";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { importContacts, ImportContactData } from "@/lib/zeke-api-adapter";

interface DeviceContact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  selected: boolean;
}

export default function ImportContactsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  const [permission, setPermission] =
    useState<Contacts.PermissionStatus | null>(null);
  const [contacts, setContacts] = useState<DeviceContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [, setImportResult] = useState<{
    imported: number;
    failed: number;
    duplicates: number;
  } | null>(null);

  const isWeb = Platform.OS === "web";
  const selectedCount = contacts.filter((c) => c.selected).length;

  const loadContacts = useCallback(async () => {
    if (isWeb) {
      setLoading(false);
      return;
    }

    try {
      const { status } = await Contacts.getPermissionsAsync();
      setPermission(status);

      if (status === Contacts.PermissionStatus.GRANTED) {
        const { data } = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
            Contacts.Fields.Company,
            Contacts.Fields.JobTitle,
          ],
        });

        const mappedContacts: DeviceContact[] = data
          .filter((c) => c.firstName || c.lastName || c.name)
          .map((c) => ({
            id: c.id,
            name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
            firstName: c.firstName,
            lastName: c.lastName,
            phoneNumber: c.phoneNumbers?.[0]?.number,
            email: c.emails?.[0]?.email,
            company: c.company,
            jobTitle: c.jobTitle,
            selected: false,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setContacts(mappedContacts);
      }
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setLoading(false);
    }
  }, [isWeb]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const requestPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await Contacts.requestPermissionsAsync();
    setPermission(status);

    if (status === Contacts.PermissionStatus.GRANTED) {
      setLoading(true);
      await loadContacts();
    } else {
      Alert.alert(
        "Permission Denied",
        "Contacts permission is required to import contacts.",
        Platform.OS !== "web"
          ? [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: async () => {
                  try {
                    await Linking.openSettings();
                  } catch {
                    console.log("Could not open settings");
                  }
                },
              },
            ]
          : [{ text: "OK" }],
      );
    }
  };

  const toggleContact = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    );
  };

  const toggleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    setContacts((prev) => prev.map((c) => ({ ...c, selected: newSelectAll })));
  };

  const handleImport = async () => {
    if (selectedCount === 0) {
      Alert.alert(
        "No Contacts Selected",
        "Please select at least one contact to import.",
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setImporting(true);

    try {
      const contactsToImport: ImportContactData[] = contacts
        .filter((c) => c.selected)
        .map((c) => ({
          firstName: c.firstName,
          lastName: c.lastName,
          phoneNumber: c.phoneNumber,
          email: c.email,
          organization: c.company,
          occupation: c.jobTitle,
        }));

      const result = await importContacts(contactsToImport);
      setImportResult(result);

      await queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });

      Alert.alert(
        "Import Complete",
        `Imported: ${result.imported}\nDuplicates skipped: ${result.duplicates}\nFailed: ${result.failed}`,
        [
          {
            text: "Done",
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      console.error("Import error:", error);
      Alert.alert(
        "Import Failed",
        "An error occurred while importing contacts.",
      );
    } finally {
      setImporting(false);
    }
  };

  const renderContact = ({ item }: { item: DeviceContact }) => (
    <Pressable
      onPress={() => toggleContact(item.id)}
      style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
        {item.selected ? (
          <Feather name="check" size={14} color="#FFFFFF" />
        ) : null}
      </View>
      <View style={styles.contactInfo}>
        <ThemedText style={styles.contactName}>{item.name}</ThemedText>
        {item.phoneNumber ? (
          <ThemedText style={styles.contactDetail}>
            {item.phoneNumber}
          </ThemedText>
        ) : null}
        {item.email ? (
          <ThemedText style={styles.contactDetail}>{item.email}</ThemedText>
        ) : null}
      </View>
    </Pressable>
  );

  if (isWeb) {
    return (
      <ThemedView
        style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}
      >
        <View style={styles.emptyState}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: Colors.dark.backgroundSecondary },
            ]}
          >
            <Feather
              name="smartphone"
              size={48}
              color={Colors.dark.textSecondary}
            />
          </View>
          <ThemedText style={styles.emptyTitle}>Device Contacts</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Run in Expo Go on your phone to import contacts from your device
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView
        style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>
            Loading contacts...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (permission !== Contacts.PermissionStatus.GRANTED) {
    return (
      <ThemedView
        style={[styles.container, { paddingTop: headerHeight + Spacing.xl }]}
      >
        <View style={styles.emptyState}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: Colors.dark.backgroundSecondary },
            ]}
          >
            <Feather name="users" size={48} color={Colors.dark.textSecondary} />
          </View>
          <ThemedText style={styles.emptyTitle}>
            Access Your Contacts
          </ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Allow access to your device contacts to import them into ZEKE
          </ThemedText>
          <Pressable onPress={requestPermission}>
            <LinearGradient
              colors={[Colors.dark.accent, Colors.dark.secondary]}
              style={styles.permissionButton}
            >
              <Feather name="unlock" size={20} color="#FFFFFF" />
              <Text style={styles.permissionButtonText}>
                Enable Contacts Access
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: headerHeight + Spacing.md }]}>
        <Card style={styles.selectionCard}>
          <View style={styles.selectionRow}>
            <Pressable onPress={toggleSelectAll} style={styles.selectAllButton}>
              <View
                style={[styles.checkbox, selectAll && styles.checkboxSelected]}
              >
                {selectAll ? (
                  <Feather name="check" size={14} color="#FFFFFF" />
                ) : null}
              </View>
              <ThemedText style={styles.selectAllText}>
                {selectAll ? "Deselect All" : "Select All"}
              </ThemedText>
            </Pressable>
            <ThemedText style={styles.selectedCount}>
              {selectedCount} of {contacts.length} selected
            </ThemedText>
          </View>
        </Card>
      </View>

      <FlatList
        data={contacts}
        renderItem={renderContact}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <ThemedText style={styles.emptyListText}>
              No contacts found on device
            </ThemedText>
          </View>
        }
      />

      {contacts.length > 0 ? (
        <View
          style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}
        >
          <Pressable
            onPress={handleImport}
            disabled={importing || selectedCount === 0}
          >
            <LinearGradient
              colors={
                selectedCount === 0
                  ? [
                      Colors.dark.backgroundSecondary,
                      Colors.dark.backgroundDefault,
                    ]
                  : [Colors.dark.accent, Colors.dark.secondary]
              }
              style={styles.importButton}
            >
              {importing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="download" size={20} color="#FFFFFF" />
                  <Text style={styles.importButtonText}>
                    Import {selectedCount} Contact
                    {selectedCount !== 1 ? "s" : ""} to ZEKE
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  selectionCard: {
    padding: Spacing.md,
  },
  selectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  selectAllText: {
    fontSize: 15,
    fontWeight: "500",
  },
  selectedCount: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.textSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  contactInfo: {
    flex: 1,
    gap: 2,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "600",
  },
  contactDetail: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
  emptyList: {
    paddingVertical: Spacing.xl * 2,
    alignItems: "center",
  },
  emptyListText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
});
