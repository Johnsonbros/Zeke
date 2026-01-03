import {
  ApiError as GeneratedApiError,
  DefaultService,
  OpenAPI,
} from "../generated/zeke-backend";
import { ApiError } from "./api-client";
import { getAuthHeaders, getLocalApiUrl } from "./query-client";

function configureClient(): void {
  OpenAPI.BASE = getLocalApiUrl();
  OpenAPI.HEADERS = async () => getAuthHeaders();
}

function mapAndThrow(
  error: unknown,
  method: string,
  path: string,
): never {
  if (error instanceof GeneratedApiError) {
    throw new ApiError(error.message, {
      status: error.status,
      url: error.url || `${OpenAPI.BASE}${path}`,
      method,
      bodyText: typeof error.body === "string" ? error.body : JSON.stringify(error.body),
      details: error.body,
    });
  }
  throw error;
}

export async function verifyDeviceTokenWithGenerated(
  token: string,
): Promise<{ deviceId?: string; valid: boolean }> {
  configureClient();
  try {
    return await DefaultService.verifyDeviceToken(token);
  } catch (error) {
    mapAndThrow(error, "GET", "/api/zeke/auth/verify");
  }
}

export async function pairDeviceWithGenerated(
  secret: string,
  deviceName: string,
): Promise<{ deviceToken?: string; deviceId?: string; message?: string; error?: string }> {
  configureClient();
  try {
    return await DefaultService.pairDevice({ secret, deviceName });
  } catch (error) {
    mapAndThrow(error, "POST", "/api/zeke/auth/pair");
  }
}

export async function getPairingStatusWithGenerated(): Promise<{
  configured: boolean;
  pendingCodes: number;
}> {
  configureClient();
  try {
    return await DefaultService.getPairingStatus();
  } catch (error) {
    mapAndThrow(error, "GET", "/api/zeke/auth/pairing-status");
  }
}

export async function getDashboardSummaryWithGenerated(): Promise<{
  eventsCount: number;
  pendingTasksCount: number;
  groceryItemsCount: number;
  memoriesCount: number;
  userName?: string;
}> {
  configureClient();
  try {
    return await DefaultService.getDashboardSummary();
  } catch (error) {
    mapAndThrow(error, "GET", "/api/zeke/dashboard");
  }
}
