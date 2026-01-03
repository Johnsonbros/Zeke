import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ThemedText } from "@/components/ThemedText";
import { Input } from "@/components/Input";
import { Checkbox } from "@/components/Checkbox";
import { RadioGroup } from "@/components/RadioButton";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/components/Toast";
import {
  TOOL_REGISTRY_QUERY_KEY,
  executeTool,
  fetchToolRegistry,
  type ToolDefinition,
  type ToolParameterSchema,
} from "@/lib/tool-registry";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

interface FieldErrorState {
  [toolName: string]: Record<string, string>;
}

interface FormState {
  [toolName: string]: Record<string, unknown>;
}

function getDefaultValue(schema: ToolParameterSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "boolean") return false;
  return "";
}

function normalizeParamValue(
  value: unknown,
  schema: ToolParameterSchema,
): unknown {
  if (schema.type === "number" || schema.type === "integer") {
    if (value === "" || value === undefined || value === null) return undefined;
    const numericValue = typeof value === "string" ? Number(value) : value;
    if (Number.isNaN(numericValue)) return undefined;
    return numericValue;
  }

  if (schema.type === "boolean") {
    return Boolean(value);
  }

  return value;
}

export function ToolRegistry() {
  const { theme } = useTheme();
  const toast = useToast();
  const [formState, setFormState] = useState<FormState>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>({});
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const {
    data: registry,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: TOOL_REGISTRY_QUERY_KEY,
    queryFn: fetchToolRegistry,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ toolName, params }: { toolName: string; params: Record<string, unknown> }) =>
      executeTool(toolName, params),
    onSuccess: (response, { toolName }) => {
      setActiveTool(null);
      toast.success(response.message || `${toolName} executed successfully.`);
    },
    onError: (error: unknown) => {
      setActiveTool(null);
      const message = error instanceof Error ? error.message : "Unable to run tool.";
      toast.error(message);
    },
  });

  useEffect(() => {
    if (!registry?.tools) return;

    setFormState((prev) => {
      const nextState: FormState = { ...prev };

      registry.tools.forEach((tool) => {
        const properties = tool.parameters?.properties ?? {};
        const existing = prev[tool.name] ?? {};

        nextState[tool.name] = Object.entries(properties).reduce(
          (acc, [paramName, schema]) => {
            const currentValue = existing[paramName];
            acc[paramName] = currentValue ?? getDefaultValue(schema);
            return acc;
          },
          {} as Record<string, unknown>,
        );
      });

      return nextState;
    });
  }, [registry]);

  const permissionSummary = useMemo(() => {
    if (!registry?.grantedPermissions) return null;
    return `${registry.grantedPermissions.length} permissions active`;
  }, [registry?.grantedPermissions]);

  const handleFieldChange = (
    toolName: string,
    field: string,
    value: unknown,
  ) => {
    setFormState((prev) => ({
      ...prev,
      [toolName]: {
        ...(prev[toolName] ?? {}),
        [field]: value,
      },
    }));

    setFieldErrors((prev) => {
      const currentToolErrors = prev[toolName];
      if (!currentToolErrors?.[field]) return prev;

      const { [field]: _removed, ...rest } = currentToolErrors;
      return { ...prev, [toolName]: rest };
    });
  };

  const validateFields = (
    tool: ToolDefinition,
    values: Record<string, unknown>,
  ): Record<string, string> => {
    const requiredFields = new Set(tool.parameters?.required ?? []);
    const properties = tool.parameters?.properties ?? {};
    const errors: Record<string, string> = {};

    Object.entries(properties).forEach(([paramName, schema]) => {
      const value = values[paramName];

      if (requiredFields.has(paramName) && (value === undefined || value === "")) {
        errors[paramName] = "Required";
        return;
      }

      if ((schema.type === "number" || schema.type === "integer") && value !== "") {
        const numeric = Number(value);
        if (Number.isNaN(numeric)) {
          errors[paramName] = "Enter a number";
        }
      }
    });

    return errors;
  };

  const submitTool = async (tool: ToolDefinition) => {
    const values = formState[tool.name] ?? {};
    const errors = validateFields(tool, values);

    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, [tool.name]: errors }));
      return;
    }

    const normalizedParams: Record<string, unknown> = {};
    Object.entries(tool.parameters?.properties ?? {}).forEach(([paramName, schema]) => {
      const normalized = normalizeParamValue(values[paramName], schema);
      if (normalized !== undefined) {
        normalizedParams[paramName] = normalized;
      }
    });

    setActiveTool(tool.name);
    await mutation.mutateAsync({ toolName: tool.name, params: normalizedParams });
  };

  const renderParameterField = (
    toolName: string,
    paramName: string,
    schema: ToolParameterSchema,
  ) => {
    const currentValue = formState[toolName]?.[paramName];
    const error = fieldErrors[toolName]?.[paramName];

    if (schema.enum && schema.enum.length > 0) {
      const options = schema.enum.map((option) => ({
        label: String(option),
        value: String(option),
      }));

      return (
        <View key={paramName} style={styles.fieldContainer}>
          <ThemedText type="body" style={{ color: theme.text }}>
            {schema.title || paramName}
          </ThemedText>
          {schema.description ? (
            <ThemedText type="small" secondary style={styles.helperText}>
              {schema.description}
            </ThemedText>
          ) : null}
          <RadioGroup
            value={String(currentValue ?? "")}
            onChange={(value) => handleFieldChange(toolName, paramName, value)}
            options={options}
          />
          {error ? (
            <ThemedText type="small" style={[styles.errorText, { color: theme.error }]}>
              {error}
            </ThemedText>
          ) : null}
        </View>
      );
    }

    if (schema.type === "boolean") {
      return (
        <View key={paramName} style={styles.checkboxContainer}>
          <Checkbox
            checked={Boolean(currentValue)}
            onChange={(value) => handleFieldChange(toolName, paramName, value)}
            label={schema.title || paramName}
          />
          {schema.description ? (
            <ThemedText type="small" secondary style={styles.helperText}>
              {schema.description}
            </ThemedText>
          ) : null}
        </View>
      );
    }

    const keyboardType = schema.type === "number" || schema.type === "integer" ? "decimal-pad" : "default";

    return (
      <Input
        key={paramName}
        label={schema.title || paramName}
        placeholder={schema.description}
        value={currentValue as string}
        onChangeText={(text) => handleFieldChange(toolName, paramName, text)}
        keyboardType={keyboardType}
        error={error}
        required={tool.parameters?.required?.includes(paramName)}
        containerStyle={{ marginTop: Spacing.md }}
      />
    );
  };

  const renderToolCard = (tool: ToolDefinition) => {
    const parameters = tool.parameters?.properties ?? {};
    const missingPermissions = (tool.permissions ?? []).filter((permission) => permission.granted === false);
    const isRunning = activeTool === tool.name && mutation.isPending;

    return (
      <View key={tool.name} style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Feather name="tool" size={18} color={theme.textSecondary} />
            <ThemedText type="h3" style={[styles.cardTitle, { color: theme.text }]}>
              {tool.title || tool.name}
            </ThemedText>
          </View>
          {tool.category ? (
            <View style={[styles.categoryBadge, { backgroundColor: `${Colors.dark.primary}20` }]}>
              <ThemedText type="caption" style={{ color: Colors.dark.primary }}>
                {tool.category}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {tool.description ? (
          <ThemedText type="body" secondary style={{ marginBottom: Spacing.sm }}>
            {tool.description}
          </ThemedText>
        ) : null}

        {Object.keys(parameters).length === 0 ? (
          <ThemedText type="small" secondary>
            No parameters required for this tool.
          </ThemedText>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {Object.entries(parameters).map(([paramName, schema]) =>
              renderParameterField(tool.name, paramName, schema),
            )}
          </View>
        )}

        {tool.permissions && tool.permissions.length > 0 ? (
          <View style={[styles.permissionContainer, { backgroundColor: `${theme.border}33` }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Permissions
            </ThemedText>
            {tool.permissions.map((permission) => (
              <View key={permission.id} style={styles.permissionRow}>
                <Feather
                  name={permission.granted ? "check-circle" : "alert-triangle"}
                  size={14}
                  color={permission.granted ? Colors.dark.success : Colors.dark.warning}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ color: theme.text }}>
                    {permission.label || permission.id}
                  </ThemedText>
                  {permission.description ? (
                    <ThemedText type="small" secondary>
                      {permission.description}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.runButton,
            {
              backgroundColor: missingPermissions.length > 0 ? theme.border : theme.link,
              opacity: pressed || isRunning ? 0.85 : 1,
            },
          ]}
          disabled={missingPermissions.length > 0 || isRunning}
          onPress={() => submitTool(tool)}
          accessibilityRole="button"
          accessibilityLabel={`Run ${tool.title || tool.name}`}
          accessibilityState={{ disabled: missingPermissions.length > 0 || isRunning }}
        >
          {isRunning ? (
            <ActivityIndicator color={theme.buttonText} />
          ) : (
            <ThemedText
              type="body"
              style={{ color: theme.buttonText, fontWeight: "600" }}
            >
              {missingPermissions.length > 0
                ? "Requires permission"
                : tool.ctaLabel || "Run tool"}
            </ThemedText>
          )}
        </Pressable>

        {missingPermissions.length > 0 ? (
          <ThemedText type="small" style={[styles.permissionWarning, { color: theme.error }]}>
            Access blocked: {missingPermissions.map((p) => p.label || p.id).join(", ")}
          </ThemedText>
        ) : null}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.dark.primary} />
        <ThemedText type="small" secondary style={{ marginTop: Spacing.sm }}>
          Loading tools...
        </ThemedText>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedText type="body" style={{ color: theme.error, textAlign: "center" }}>
          We couldn't load the latest tools. Pull to retry.
        </ThemedText>
        <Button style={{ marginTop: Spacing.md }} onPress={() => refetch()}>
          Retry
        </Button>
      </View>
    );
  }

  if (!registry || registry.tools.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Feather name="inbox" size={28} color={theme.textSecondary} />
        <ThemedText type="body" secondary style={{ marginTop: Spacing.sm }}>
          No tools are available yet. They'll appear here automatically.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.registryMeta}>
        <View style={styles.metaIcon}>
          <Feather name="database" size={16} color={Colors.dark.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="small" style={{ color: theme.text }}>
            Live tool registry
          </ThemedText>
          <ThemedText type="caption" secondary>
            {permissionSummary || "Permissions synced from backend"}
          </ThemedText>
        </View>
        <Pressable onPress={() => refetch()} hitSlop={8}>
          {isFetching ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Feather name="refresh-ccw" size={16} color={theme.textSecondary} />
          )}
        </Pressable>
      </View>

      {registry.tools.map((tool) => renderToolCard(tool))}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  registryMeta: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "#0B122433",
    gap: Spacing.md,
  },
  metaIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${Colors.dark.primary}20`,
  },
  card: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#1F2937",
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  cardTitle: {
    flexShrink: 1,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  fieldContainer: {
    paddingVertical: Spacing.xs,
  },
  helperText: {
    marginTop: Spacing.xs,
  },
  checkboxContainer: {
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  permissionContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  permissionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  permissionWarning: {
    marginTop: Spacing.xs,
  },
  runButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.full,
    height: Spacing.buttonHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: Spacing.xs,
  },
});
