import React, { useState, useEffect } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ThemedText } from "./ThemedText";
import { Input } from "./Input";
import { useToast } from "./Toast";
import { KeyboardAwareScrollViewCompat } from "./KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { ZekeContact, createContact, updateContact } from "@/lib/zeke-api-adapter";
import { AccessLevel } from "@/lib/zeke-types";

const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "inner_circle", label: "Inner Circle" },
  { value: "friend", label: "Friend" },
  { value: "acquaintance", label: "Acquaintance" },
  { value: "work", label: "Work" },
];

interface ContactFormModalProps {
  visible: boolean;
  onClose: () => void;
  contact?: ZekeContact | null;
}

export function ContactFormModal({
  visible,
  onClose,
  contact,
}: ContactFormModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isEditing = !!contact;

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [occupation, setOccupation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [notes, setNotes] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("friend");
  const [canAccessCalendar, setCanAccessCalendar] = useState(false);
  const [canAccessTasks, setCanAccessTasks] = useState(false);
  const [canAccessGrocery, setCanAccessGrocery] = useState(false);
  const [canSetReminders, setCanSetReminders] = useState(false);

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!visible) {
      setInitialized(false);
      return;
    }

    if (initialized) return;

    if (contact?.id) {
      setFirstName(contact.firstName || "");
      setMiddleName(contact.middleName || "");
      setLastName(contact.lastName || "");
      setPhoneNumber(contact.phoneNumber || "");
      setEmail(contact.email || "");
      setOrganization(contact.organization || "");
      setOccupation(contact.occupation || "");
      setBirthday(contact.birthday || "");
      setNotes(contact.notes || "");
      setAccessLevel(contact.accessLevel || "friend");
      setCanAccessCalendar(contact.canAccessCalendar ?? false);
      setCanAccessTasks(contact.canAccessTasks ?? false);
      setCanAccessGrocery(contact.canAccessGrocery ?? false);
      setCanSetReminders(contact.canSetReminders ?? false);
      setInitialized(true);
    } else if (!contact) {
      setFirstName("");
      setMiddleName("");
      setLastName("");
      setPhoneNumber("");
      setEmail("");
      setOrganization("");
      setOccupation("");
      setBirthday("");
      setNotes("");
      setAccessLevel("friend");
      setCanAccessCalendar(false);
      setCanAccessTasks(false);
      setCanAccessGrocery(false);
      setCanSetReminders(false);
      setInitialized(true);
    }
  }, [visible, contact, initialized]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<ZekeContact>) => createContact(data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast.success("Contact created successfully");
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create contact. Please try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ZekeContact> }) =>
      updateContact(id, data),
    onSuccess: (_, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/contacts", variables.id],
      });
      toast.success("Contact updated successfully");
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update contact. Please try again.");
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!firstName.trim() && !lastName.trim()) {
      toast.error("Please enter at least a first or last name.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const data: Partial<ZekeContact> = {
      firstName: firstName.trim() || undefined,
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      phoneNumber: phoneNumber.trim() || undefined,
      email: email.trim() || undefined,
      organization: organization.trim() || undefined,
      occupation: occupation.trim() || undefined,
      birthday: birthday.trim() || undefined,
      notes: notes.trim() || undefined,
      accessLevel,
      canAccessCalendar,
      canAccessTasks,
      canAccessGrocery,
      canSetReminders,
    };

    if (isEditing && contact) {
      updateMutation.mutate({ id: contact.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleClose = () => {
    if (!isPending) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
    }
  };

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    options?: {
      keyboardType?: "default" | "email-address" | "phone-pad";
      placeholder?: string;
      multiline?: boolean;
    }
  ) => (
    <Input
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={options?.placeholder}
      keyboardType={options?.keyboardType || "default"}
      multiline={options?.multiline}
      numberOfLines={options?.multiline ? 3 : 1}
      editable={!isPending}
      containerStyle={{ marginBottom: Spacing.md }}
    />
  );

  const renderSwitch = (
    label: string,
    value: boolean,
    onValueChange: (val: boolean) => void
  ) => (
    <View style={styles.switchRow}>
      <ThemedText type="body">{label}</ThemedText>
      <Switch
        value={value}
        onValueChange={(val) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onValueChange(val);
        }}
        disabled={isPending}
        trackColor={{ false: theme.backgroundSecondary, true: Colors.dark.primary }}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + Spacing.md,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Pressable
            onPress={handleClose}
            disabled={isPending}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <ThemedText type="body" style={{ color: Colors.dark.primary }}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText type="h3">
            {isEditing ? "Edit Contact" : "New Contact"}
          </ThemedText>
          <Pressable
            onPress={handleSave}
            disabled={isPending}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <ThemedText
                type="body"
                style={{ color: Colors.dark.primary, fontWeight: "600" }}
              >
                Save
              </ThemedText>
            )}
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Basic Info
            </ThemedText>
            {renderInput("First Name", firstName, setFirstName)}
            {renderInput("Middle Name", middleName, setMiddleName)}
            {renderInput("Last Name", lastName, setLastName)}
            {renderInput("Phone Number", phoneNumber, setPhoneNumber, {
              keyboardType: "phone-pad",
              placeholder: "+1 (555) 123-4567",
            })}
            {renderInput("Email", email, setEmail, {
              keyboardType: "email-address",
              placeholder: "email@example.com",
            })}
          </View>

          <View style={styles.section}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Work
            </ThemedText>
            {renderInput("Organization", organization, setOrganization)}
            {renderInput("Occupation", occupation, setOccupation)}
          </View>

          <View style={styles.section}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Personal
            </ThemedText>
            {renderInput("Birthday", birthday, setBirthday, {
              placeholder: "YYYY-MM-DD",
            })}
            {renderInput("Notes", notes, setNotes, {
              multiline: true,
              placeholder: "Additional notes about this contact...",
            })}
          </View>

          <View style={styles.section}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Access Level
            </ThemedText>
            <View style={styles.accessLevelContainer}>
              {ACCESS_LEVELS.map((level) => (
                <Pressable
                  key={level.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setAccessLevel(level.value);
                  }}
                  disabled={isPending}
                  style={[
                    styles.accessLevelOption,
                    {
                      backgroundColor:
                        accessLevel === level.value
                          ? Colors.dark.primary
                          : theme.backgroundSecondary,
                      borderColor:
                        accessLevel === level.value
                          ? Colors.dark.primary
                          : theme.border,
                    },
                  ]}
                >
                  <ThemedText
                    type="small"
                    style={{
                      color:
                        accessLevel === level.value
                          ? "#FFFFFF"
                          : theme.textSecondary,
                      fontWeight: accessLevel === level.value ? "600" : "400",
                    }}
                  >
                    {level.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Permissions
            </ThemedText>
            <View
              style={[
                styles.permissionsCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              {renderSwitch(
                "Access Calendar",
                canAccessCalendar,
                setCanAccessCalendar
              )}
              {renderSwitch("Access Tasks", canAccessTasks, setCanAccessTasks)}
              {renderSwitch(
                "Access Grocery List",
                canAccessGrocery,
                setCanAccessGrocery
              )}
              {renderSwitch(
                "Set Reminders",
                canSetReminders,
                setCanSetReminders
              )}
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.sm,
  },
  accessLevelContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  accessLevelOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  permissionsCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
});
