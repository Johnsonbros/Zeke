import { apiClient } from "@/lib/api-client";

export type ToolJsonSchemaType = "string" | "number" | "integer" | "boolean";

export interface ToolParameterSchema {
  type?: ToolJsonSchemaType;
  title?: string;
  description?: string;
  enum?: (string | number)[];
  format?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

export interface ToolParametersObjectSchema {
  type: "object";
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface ToolPermission {
  id: string;
  label?: string;
  description?: string;
  granted?: boolean;
}

export interface ToolDefinition {
  name: string;
  title?: string;
  description?: string;
  category?: string;
  parameters?: ToolParametersObjectSchema;
  permissions?: ToolPermission[];
  ctaLabel?: string;
}

export interface ToolRegistryResponse {
  tools: ToolDefinition[];
  grantedPermissions?: string[];
  lastSyncedAt?: string;
}

export interface ExecuteToolRequest {
  toolName: string;
  params: Record<string, unknown>;
}

export interface ExecuteToolResponse {
  success: boolean;
  result?: unknown;
  message?: string;
}

export const TOOL_REGISTRY_QUERY_KEY = ["tool-registry"] as const;

export async function fetchToolRegistry(): Promise<ToolRegistryResponse> {
  return apiClient.get<ToolRegistryResponse>("/api/zeke/tools/registry");
}

export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<ExecuteToolResponse> {
  return apiClient.post<ExecuteToolResponse>("/api/zeke/tools/execute", {
    tool: toolName,
    params,
  });
}
