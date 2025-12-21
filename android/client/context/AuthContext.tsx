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

      if (!token) {
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

      // Try to verify with backend
      const maxRetries = 2;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Route through local proxy to ZEKE backend: /api/zeke/auth/verify
          const data = await apiClient.authGet<{ deviceId?: string }>(
            "/api/zeke/auth/verify",
            { headers: { "X-ZEKE-Device-Token": token } },
          );

          // Update last verified timestamp on successful verification
          await updateLastVerified();

          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: data.deviceId || storedDeviceId,
            error: null,
            isOfflineMode: false,
          });
          console.log("[Auth] Token verified successfully");
          return true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Don't retry on 401 - session is definitely expired
          if (err instanceof ApiError && err.status === 401) {
            throw err;
          }

          // Wait before retrying (1s, 2s)
          if (attempt < maxRetries - 1) {
            console.log(
              `[Auth] Verify attempt ${attempt + 1} failed, retrying...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * Math.pow(2, attempt)),
            );
          }
        }
      }

      // All retries failed - check if we can use cached auth
      if (cachedAuthValid) {
        console.log("[Auth] Network unavailable, using cached authentication");
        setState({
          isAuthenticated: true,
          isLoading: false,
          deviceId: storedDeviceId,
          error: null,
          isOfflineMode: true,
        });
        return true;
      }

      // No cached auth available
      throw lastError;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Session expired by backend - clear stored credentials
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

      // Check one more time for cached auth on other errors
      const token = await getStoredValue(DEVICE_TOKEN_KEY);
      const storedDeviceId = await getStoredValue(DEVICE_ID_KEY);
      const cachedAuthValid = await isCachedAuthValid();

      if (token && cachedAuthValid) {
        console.log("[Auth] Connection error, using cached authentication");
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

      console.error("[Auth] Check auth error:", error);
      setState({
        isAuthenticated: false,
        isLoading: false,
        deviceId: null,
        error: error instanceof ApiError ? error.message : "Connection error. Please try again.",
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
        }>("/api/zeke/auth/request-sms-code", { deviceName });

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
        }>("/api/zeke/auth/verify-sms-code", { sessionId, code });

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
