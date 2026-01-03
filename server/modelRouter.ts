import fs from "fs";
import path from "path";
import type { ClientOptions } from "openai";

export type ModelRoute = "primary" | "light" | "title" | "memory";

interface ModelRouteConfig {
  model: string;
  providerId?: string;
  params?: Record<string, unknown>;
}

interface ProviderConfig {
  id: string;
  apiKeyEnv?: string;
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
}

interface ModelRouterFileConfig {
  routes?: Partial<Record<ModelRoute, ModelRouteConfig>>;
  providers?: ProviderConfig[];
  allowedExternalModels?: string[];
}

interface ResolvedModelConfig {
  model: string;
  baseModel: string;
  providerId: string;
  clientOptions: ClientOptions;
  params?: Record<string, unknown>;
}

const MODEL_ROUTER_CONFIG_PATH = path.join(process.cwd(), "server", "config", "model-router.json");

const DEFAULT_PROVIDER: ProviderConfig = {
  id: "openai",
  apiKeyEnv: "OPENAI_API_KEY",
};

const DEFAULT_ROUTES: Record<ModelRoute, ModelRouteConfig> = {
  primary: { model: process.env.OPENAI_MODEL || "gpt-4o" },
  light: { model: process.env.OPENAI_MINI_MODEL || "gpt-4o-mini" },
  title: { model: process.env.OPENAI_MINI_MODEL || "gpt-4o-mini" },
  memory: { model: process.env.OPENAI_MINI_MODEL || "gpt-4o-mini" },
};

let cachedConfig: ModelRouterFileConfig | null = null;

function loadModelRouterConfig(): ModelRouterFileConfig {
  if (cachedConfig) return cachedConfig;

  if (!fs.existsSync(MODEL_ROUTER_CONFIG_PATH)) {
    cachedConfig = {};
    return cachedConfig;
  }

  try {
    const raw = fs.readFileSync(MODEL_ROUTER_CONFIG_PATH, "utf-8");
    cachedConfig = JSON.parse(raw) as ModelRouterFileConfig;
  } catch (error) {
    console.warn("Failed to load model router config, falling back to defaults", error);
    cachedConfig = {};
  }

  return cachedConfig;
}

function parseProviderFromModel(model: string, explicitProvider?: string): { providerId: string; modelId: string; baseModel: string } {
  if (explicitProvider) {
    return {
      providerId: explicitProvider,
      modelId: explicitProvider === "openai" ? model : `${explicitProvider}:${model}`,
      baseModel: model,
    };
  }

  if (model.includes(":")) {
    const [providerId, baseModel] = model.split(":", 2);
    return { providerId, modelId: model, baseModel };
  }

  if (model.includes("/")) {
    const [providerId, baseModel] = model.split("/", 2);
    return { providerId, modelId: `${providerId}:${baseModel}`, baseModel };
  }

  return { providerId: "openai", modelId: model, baseModel: model };
}

function parseAllowedExternalModels(config: ModelRouterFileConfig): string[] {
  const fromEnv = process.env.ALLOWED_EXTERNAL_MODELS;
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv);
    } catch {
      return fromEnv.split(",").map(m => m.trim()).filter(Boolean);
    }
  }
  return config.allowedExternalModels || [];
}

function resolveProviderConfig(providerId: string, config: ModelRouterFileConfig): ProviderConfig {
  if (providerId === "openai") return DEFAULT_PROVIDER;
  return config.providers?.find(p => p.id === providerId) || DEFAULT_PROVIDER;
}

function sanitizeClientOptions(options: ClientOptions): ClientOptions {
  const cleanedEntries = Object.entries(options).filter(([, value]) => value !== undefined);
  return Object.fromEntries(cleanedEntries) as ClientOptions;
}

function assertExternalModelAllowed(resolved: ResolvedModelConfig, allowedExternalModels: string[]): void {
  if (resolved.providerId === "openai") return;

  const normalizedAllowed = new Set(allowedExternalModels);
  if (!normalizedAllowed.has(resolved.model)) {
    throw new Error(`Model ${resolved.model} is not permitted for external providers.`);
  }
}

export function resolveModelRoute(route: ModelRoute, overrideModel?: string): ResolvedModelConfig {
  const config = loadModelRouterConfig();
  const routeConfig = config.routes?.[route] || DEFAULT_ROUTES[route];

  const targetModel = overrideModel || routeConfig.model;
  const { providerId, modelId, baseModel } = parseProviderFromModel(targetModel, routeConfig.providerId);

  const providerConfig = resolveProviderConfig(providerId, config);
  const apiKeyEnv = providerConfig.apiKeyEnv || DEFAULT_PROVIDER.apiKeyEnv!;
  const apiKey = process.env[apiKeyEnv];

  if (!apiKey) {
    throw new Error(`Missing API key for provider ${providerId}. Set ${apiKeyEnv} in your environment.`);
  }

  const clientOptions = sanitizeClientOptions({
    apiKey,
    baseURL: providerConfig.baseURL,
    defaultHeaders: providerConfig.defaultHeaders,
  });

  const resolved: ResolvedModelConfig = {
    model: modelId,
    baseModel,
    providerId,
    params: routeConfig.params,
    clientOptions,
  };

  const allowedExternalModels = parseAllowedExternalModels(config);
  assertExternalModelAllowed(resolved, allowedExternalModels);

  return resolved;
}

export function getAllowedModelsSummary(): { routes: Record<ModelRoute, string>; external: string[] } {
  const config = loadModelRouterConfig();
  const allowedExternalModels = parseAllowedExternalModels(config);
  const routes: Record<ModelRoute, string> = {
    primary: (config.routes?.primary || DEFAULT_ROUTES.primary).model,
    light: (config.routes?.light || DEFAULT_ROUTES.light).model,
    title: (config.routes?.title || DEFAULT_ROUTES.title).model,
    memory: (config.routes?.memory || DEFAULT_ROUTES.memory).model,
  };

  return { routes, external: allowedExternalModels };
}
