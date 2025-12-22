/**
 * ============================================================================
 * CRITICAL FILE - AUTHENTICATION CONTEXT
 * ============================================================================
 * 
 * This file manages device authentication and SMS pairing for ZEKE AI.
 * 
 * DO NOT MODIFY without explicit approval from the project owner.
 * 
 * Critical functions:
 * - requestSmsCode() - Initiates SMS pairing flow
 * - verifySmsCode() - Verifies 4-digit SMS code
 * - pairDevice() - Legacy pairing with secret
 * - unpairDevice() - Clears device credentials
 * 
 * Changes to this file can break:
 * - Device authentication
 * - Token storage and retrieval
 * - Offline authentication
 * - SMS verification flow
 * 
 * Related critical files:
 * - client/screens/PairingScreen.tsx
 * - server/routes.ts (SMS pairing endpoints)
 * - server/device-auth.ts
 * ============================================================================
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setDeviceToken } from "@/lib/query-client";
import { apiClient, ApiError } from "@/lib/api-client";

const DEVICE_TOKEN_KEY = "zeke_device_token";
const DEVICE_ID_KEY = "zeke_device_id";
const LAST_VERIFIED_KEY = "zeke_last_verified";

// Trust cached auth for 7 days before requiring re-verification
const OFFLINE_AUTH_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

// Load device token synchronously on web (for initialization before queries start)
export function loadTokenSync(): void {
  if (Platform.OS === "web") {
    const token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (token) {
      setDeviceToken(token);
    }
  }
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceId: string | null;
  error: string | null;
  isOfflineMode: boolean;
}

interface SmsCodeResult {
  success: boolean;
  sessionId?: string;
  expiresIn?: number;
  error?: string;
}

interface VerifyCodeResult {
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
}

interface SmsPairingState {
  sessionId: string | null;
  expiresIn: number | null;
  attemptsRemaining: number | null;
}

interface SmsPairingStatus {
  configured: boolean;
  pendingCodes: number;
}

interface AuthContextType extends AuthState {
  pairDevice: (secret: string, deviceName: string) => Promise<boolean>;
  requestSmsCode: (deviceName: string) => Promise<SmsCodeResult>;
  verifySmsCode: (sessionId: string, code: string) => Promise<VerifyCodeResult>;
  checkSmsPairingStatus: () => Promise<SmsPairingStatus | null>;
  smsPairingState: SmsPairingState;
  unpairDevice: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteStoredValue(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    deviceId: null,
    error: null,
    isOfflineMode: false,
  });

  const [smsPairingState, setSmsPairingState] = useState<SmsPairingState>({
    sessionId: null,
    expiresIn: null,
    attemptsRemaining: null,
  });

  // Check if cached auth is still valid for offline use
  const isCachedAuthValid = useCallback(async (): Promise<boolean> => {
    const lastVerified = await getStoredValue(LAST_VERIFIED_KEY);
    if (!lastVerified) return false;
    
    const lastVerifiedTime = parseInt(lastVerified, 10);
    const now = Date.now();
    return now - lastVerifiedTime < OFFLINE_AUTH_VALIDITY_MS;
  }, []);

  // Update last verified timestamp
  const updateLastVerified = useCallback(async (): Promise<void> => {
    await setStoredValue(LAST_VERIFIED_KEY, Date.now().toString());
  }, []);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getStoredValue(DEVICE_TOKEN_KEY);
      const storedDeviceId = await getStoredValue(DEVICE_ID_KEY);

      console.log("[Auth] checkAuth starting, token exists:", !!token, "deviceId:", storedDeviceId);

      if (!token) {
        console.log("[Auth] No stored token found, requiring pairing");
        setState({
          isAuthenticated: false,
          isLoading: false,
          deviceId: null,
          error: null,
          isOfflineMode: false,
        });
        return false;
      }

      // Always set the token for API requests
      setDeviceToken(token);

      // Check if we have valid cached auth (for offline scenarios)
      const cachedAuthValid = await isCachedAuthValid();
      console.log("[Auth] Cached auth valid:", cachedAuthValid);

      // First, try to verify with LOCAL server (for SMS-paired tokens)
      // This is the primary verification - tokens from SMS pairing are stored locally
      let localFailed401 = false;
      
      try {
        console.log("[Auth] Verifying with local server...");
        const localData = await apiClient.authGet<{ deviceId?: string; deviceName?: string; valid?: boolean }>(
          "/api/auth/verify-device",
          { headers: { "X-ZEKE-Device-Token": token } },
        );

        if (localData.valid) {
          console.log("[Auth] Local verification successful:", localData.deviceId);
          await updateLastVerified();
          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: localData.deviceId || storedDeviceId,
            error: null,
            isOfflineMode: false,
          });
          return true;
        }
      } catch (localErr) {
        console.log("[Auth] Local verification failed:", localErr instanceof ApiError ? `${localErr.status}` : String(localErr));
        
        if (localErr instanceof ApiError && localErr.status === 401) {
          localFailed401 = true;
          // Token not found locally, try ZEKE backend next
        }
        // For other errors (network issues), continue to try ZEKE backend or cached auth
      }

      // If local verification returned 401, try ZEKE backend (for legacy tokens paired via ZEKE)
      if (localFailed401) {
        console.log("[Auth] Local token not found, trying ZEKE backend verification...");
        try {
          const zekeData = await apiClient.authGet<{ deviceId?: string; valid?: boolean }>(
            "/api/zeke/auth/verify",
            { headers: { "X-ZEKE-Device-Token": token } },
          );

          console.log("[Auth] ZEKE verify response:", JSON.stringify(zekeData));
          await updateLastVerified();
          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: zekeData.deviceId || storedDeviceId,
            error: null,
            isOfflineMode: false,
          });
          return true;
        } catch (zekeErr) {
          console.log("[Auth] ZEKE verification also failed:", zekeErr instanceof ApiError ? `${zekeErr.status}` : String(zekeErr));
          
          // Both local and ZEKE verification failed with 401 - token is truly invalid
          if (zekeErr instanceof ApiError && zekeErr.status === 401) {
            console.log("[Auth] Token invalid on both local and ZEKE, clearing credentials");
            await deleteStoredValue(DEVICE_TOKEN_KEY);
            await deleteStoredValue(DEVICE_ID_KEY);
            await deleteStoredValue(LAST_VERIFIED_KEY);
            setDeviceToken(null);
            setState({
              isAuthenticated: false,
              isLoading: false,
              deviceId: null,
              error: "Session expired. Please pair again.",
              isOfflineMode: false,
            });
            return false;
          }
          // Network error on ZEKE backend - continue to cached auth check
        }
      }

      // If verification failed due to network, check cached auth
      if (cachedAuthValid) {
        console.log("[Auth] Network unavailable but cached auth valid, using offline mode");
        setState({
          isAuthenticated: true,
          isLoading: false,
          deviceId: storedDeviceId,
          error: null,
          isOfflineMode: true,
        });
        return true;
      }

      // Network errors without cached auth - keep credentials for retry
      console.log("[Auth] Network errors, no valid cache, but keeping credentials for retry");
      setState({
        isAuthenticated: false,
        isLoading: false,
        deviceId: storedDeviceId,
        error: "Unable to verify. Please check your connection and try again.",
        isOfflineMode: false,
      });
      return false;
    } catch (error) {
      console.error("[Auth] Unexpected checkAuth error:", error);
      
      // On unexpected errors, try to preserve credentials if possible
      const token = await getStoredValue(DEVICE_TOKEN_KEY);
      const storedDeviceId = await getStoredValue(DEVICE_ID_KEY);
      const cachedAuthValid = await isCachedAuthValid();

      if (token && cachedAuthValid) {
        console.log("[Auth] Unexpected error but cached auth valid, using offline mode");
        setDeviceToken(token);
        setState({
          isAuthenticated: true,
          isLoading: false,
          deviceId: storedDeviceId,
          error: null,
          isOfflineMode: true,
        });
        return true;
      }

      // Keep credentials for retry even on errors
      if (token) {
        console.log("[Auth] Unexpected error, keeping credentials for retry");
        setDeviceToken(token);
        setState({
          isAuthenticated: false,
          isLoading: false,
          deviceId: storedDeviceId,
          error: "Connection error. Please try again.",
          isOfflineMode: false,
        });
        return false;
      }

      setState({
        isAuthenticated: false,
        isLoading: false,
        deviceId: null,
        error: "Connection error. Please try again.",
        isOfflineMode: false,
      });
      return false;
    }
  }, [isCachedAuthValid, updateLastVerified]);

  const pairDevice = useCallback(
    async (secret: string, deviceName: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      console.log("[Auth] Starting device pairing...");
      console.log("[Auth] Device name:", deviceName);
      console.log("[Auth] Platform:", Platform.OS);

      try {
        // Use authPost with longer timeout (25s) for pairing
        // Route through local proxy to ZEKE backend: /api/zeke/auth/pair
        console.log("[Auth] Sending pair request to /api/zeke/auth/pair");
        const data = await apiClient.authPost<{
          deviceToken?: string;
          deviceId?: string;
          message?: string;
          error?: string;
        }>("/api/zeke/auth/pair", { secret, deviceName });
        console.log("[Auth] Pair response received:", JSON.stringify(data));

        if (data.deviceToken) {
          await setStoredValue(DEVICE_TOKEN_KEY, data.deviceToken);
          await setStoredValue(DEVICE_ID_KEY, data.deviceId || "");
          await setStoredValue(LAST_VERIFIED_KEY, Date.now().toString());
          setDeviceToken(data.deviceToken);

          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: data.deviceId || null,
            error: null,
            isOfflineMode: false,
          });
          return true;
        } else {
          const errorMsg = data.error || data.message || "Pairing failed - no device token received";
          console.log("[Auth] Pair failed:", errorMsg);
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: errorMsg,
          }));
          return false;
        }
      } catch (error) {
        console.error("[Auth] Pair error:", error);
        let errorMessage: string;
        if (error instanceof ApiError) {
          errorMessage = error.message;
          console.log("[Auth] ApiError details:", {
            status: error.status,
            url: error.url,
            bodyText: error.bodyText
          });
        } else {
          errorMessage = "Connection error. Check your network.";
        }
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        return false;
      }
    },
    [],
  );

  const requestSmsCode = useCallback(
    async (deviceName: string): Promise<SmsCodeResult> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      console.log("[Auth] Requesting SMS code for device:", deviceName);

      try {
        const data = await apiClient.post<{
          success: boolean;
          sessionId?: string;
          expiresIn?: number;
          error?: string;
          message?: string;
        }>("/api/auth/request-sms-code", { deviceName });

        if (data.success && data.sessionId) {
          console.log("[Auth] SMS code request successful");
          setSmsPairingState({
            sessionId: data.sessionId,
            expiresIn: data.expiresIn || 300,
            attemptsRemaining: null,
          });
          setState((prev) => ({ ...prev, isLoading: false, error: null }));
          return {
            success: true,
            sessionId: data.sessionId,
            expiresIn: data.expiresIn,
          };
        } else {
          const errorMsg = data.error || "Failed to send code";
          console.log("[Auth] SMS code request failed:", errorMsg);
          setState((prev) => ({ ...prev, isLoading: false, error: errorMsg }));
          return { success: false, error: errorMsg };
        }
      } catch (error) {
        console.error("[Auth] SMS code request error:", error);
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : "Connection error. Please try again.";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  const verifySmsCode = useCallback(
    async (sessionId: string, code: string): Promise<VerifyCodeResult> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      console.log("[Auth] Verifying SMS code...");

      try {
        const data = await apiClient.post<{
          success: boolean;
          deviceToken?: string;
          deviceId?: string;
          error?: string;
          attemptsRemaining?: number;
        }>("/api/auth/verify-sms-code", { sessionId, code });

        if (data.success && data.deviceToken) {
          console.log("[Auth] SMS verification successful");
          await setStoredValue(DEVICE_TOKEN_KEY, data.deviceToken);
          await setStoredValue(DEVICE_ID_KEY, data.deviceId || "");
          await setStoredValue(LAST_VERIFIED_KEY, Date.now().toString());
          setDeviceToken(data.deviceToken);

          setSmsPairingState({
            sessionId: null,
            expiresIn: null,
            attemptsRemaining: null,
          });

          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: data.deviceId || null,
            error: null,
            isOfflineMode: false,
          });
          return { success: true };
        } else {
          const errorMsg = data.error || "Invalid code";
          const remaining = data.attemptsRemaining ?? null;
          console.log("[Auth] SMS verification failed:", errorMsg, "Attempts remaining:", remaining);
          setSmsPairingState((prev) => ({
            ...prev,
            attemptsRemaining: remaining,
          }));
          setState((prev) => ({ ...prev, isLoading: false, error: errorMsg }));
          return { success: false, error: errorMsg, attemptsRemaining: remaining ?? undefined };
        }
      } catch (error) {
        console.error("[Auth] SMS verification error:", error);
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : "Connection error. Please try again.";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  const checkSmsPairingStatus = useCallback(async (): Promise<SmsPairingStatus | null> => {
    try {
      console.log("[Auth] Checking SMS pairing status...");
      const data = await apiClient.get<{
        configured: boolean;
        pendingCodes: number;
      }>("/api/zeke/auth/pairing-status");
      
      console.log("[Auth] SMS pairing status:", data);
      return {
        configured: data.configured,
        pendingCodes: data.pendingCodes,
      };
    } catch (error) {
      console.error("[Auth] Failed to check SMS pairing status:", error);
      return null;
    }
  }, []);

  const unpairDevice = useCallback(async (): Promise<void> => {
    await deleteStoredValue(DEVICE_TOKEN_KEY);
    await deleteStoredValue(DEVICE_ID_KEY);
    await deleteStoredValue(LAST_VERIFIED_KEY);
    setDeviceToken(null);
    setSmsPairingState({
      sessionId: null,
      expiresIn: null,
      attemptsRemaining: null,
    });
    setState({
      isAuthenticated: false,
      isLoading: false,
      deviceId: null,
      error: null,
      isOfflineMode: false,
    });
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider
      value={{ 
        ...state, 
        pairDevice, 
        requestSmsCode, 
        verifySmsCode, 
        checkSmsPairingStatus,
        smsPairingState,
        unpairDevice, 
        checkAuth 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
