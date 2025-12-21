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

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceId: string | null;
  error: string | null;
}

interface SmsPairingState {
  sessionId: string | null;
  expiresIn: number | null;
  attemptsRemaining: number;
}

interface AuthContextType extends AuthState {
  pairDevice: (secret: string, deviceName: string) => Promise<boolean>;
  requestSmsCode: (deviceName: string) => Promise<{ success: boolean; sessionId?: string; expiresIn?: number; error?: string }>;
  verifySmsCode: (sessionId: string, code: string) => Promise<boolean>;
  smsPairingState: SmsPairingState;
  unpairDevice: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  checkSmsPairingStatus: () => Promise<{ configured: boolean; pendingCodes: number }>;
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
  });
  
  const [smsPairingState, setSmsPairingState] = useState<SmsPairingState>({
    sessionId: null,
    expiresIn: null,
    attemptsRemaining: 3,
  });

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getStoredValue(DEVICE_TOKEN_KEY);
      const storedDeviceId = await getStoredValue(DEVICE_ID_KEY);

      if (!token) {
        setState((prev) => ({
          ...prev,
          isAuthenticated: false,
          isLoading: false,
        }));
        return false;
      }

      setDeviceToken(token);

      // Use authGet with longer timeout for auth verification
      // Includes automatic retry with exponential backoff
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          // Route through local proxy to ZEKE backend: /api/zeke/auth/verify
          const data = await apiClient.authGet<{ deviceId?: string }>(
            "/api/zeke/auth/verify",
            { headers: { "X-ZEKE-Device-Token": token } },
          );

          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: data.deviceId || storedDeviceId,
            error: null,
          });
          return true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // Don't retry on 401 - session is definitely expired
          if (err instanceof ApiError && err.status === 401) {
            throw err;
          }

          // Wait before retrying (1s, 2s, 4s)
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

      // All retries failed
      throw lastError;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Session expired - clear stored credentials
        await deleteStoredValue(DEVICE_TOKEN_KEY);
        await deleteStoredValue(DEVICE_ID_KEY);
        setDeviceToken(null);
        setState({
          isAuthenticated: false,
          isLoading: false,
          deviceId: null,
          error: "Session expired. Please pair again.",
        });
        return false;
      }

      console.error("[Auth] Check auth error:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof ApiError ? error.message : "Connection error",
      }));
      return false;
    }
  }, []);

  const pairDevice = useCallback(
    async (secret: string, deviceName: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      console.log("[Auth] Starting device pairing...");
      console.log("[Auth] Device name:", deviceName);

      try {
        // Use authPost with longer timeout (25s) for pairing
        // Route through local proxy to ZEKE backend: /api/zeke/auth/pair
        console.log("[Auth] Sending pair request to /api/zeke/auth/pair");
        const data = await apiClient.authPost<{
          deviceToken?: string;
          deviceId?: string;
          message?: string;
        }>("/api/zeke/auth/pair", { secret, deviceName });
        console.log("[Auth] Pair response received:", data ? "success" : "no data");

        if (data.deviceToken) {
          await setStoredValue(DEVICE_TOKEN_KEY, data.deviceToken);
          await setStoredValue(DEVICE_ID_KEY, data.deviceId || "");
          setDeviceToken(data.deviceToken);

          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: data.deviceId || null,
            error: null,
          });
          return true;
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: data.message || "Pairing failed",
          }));
          return false;
        }
      } catch (error) {
        console.error("[Auth] Pair error:", error);
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : "Connection error. Check your network.";
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

  const unpairDevice = useCallback(async (): Promise<void> => {
    await deleteStoredValue(DEVICE_TOKEN_KEY);
    await deleteStoredValue(DEVICE_ID_KEY);
    setDeviceToken(null);
    setState({
      isAuthenticated: false,
      isLoading: false,
      deviceId: null,
      error: null,
    });
    setSmsPairingState({
      sessionId: null,
      expiresIn: null,
      attemptsRemaining: 3,
    });
  }, []);

  const checkSmsPairingStatus = useCallback(async (): Promise<{ configured: boolean; pendingCodes: number }> => {
    try {
      const data = await apiClient.get<{ configured: boolean; pendingCodes: number }>(
        "/api/zeke/auth/pairing-status"
      );
      return data;
    } catch (error) {
      console.error("[Auth] Pairing status check error:", error);
      return { configured: false, pendingCodes: 0 };
    }
  }, []);

  const requestSmsCode = useCallback(
    async (deviceName: string): Promise<{ success: boolean; sessionId?: string; expiresIn?: number; error?: string }> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      try {
        const data = await apiClient.authPost<{
          success: boolean;
          sessionId?: string;
          expiresIn?: number;
          message?: string;
          error?: string;
        }>("/api/zeke/auth/request-sms-code", { deviceName });

        if (data.success && data.sessionId) {
          setSmsPairingState({
            sessionId: data.sessionId,
            expiresIn: data.expiresIn || 300,
            attemptsRemaining: 3,
          });
          setState((prev) => ({ ...prev, isLoading: false }));
          return { success: true, sessionId: data.sessionId, expiresIn: data.expiresIn };
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: data.error || "Failed to request code",
          }));
          return { success: false, error: data.error || "Failed to request code" };
        }
      } catch (error) {
        console.error("[Auth] Request SMS code error:", error);
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : "Connection error. Check your network.";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        return { success: false, error: errorMessage };
      }
    },
    [],
  );

  const verifySmsCode = useCallback(
    async (sessionId: string, code: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      
      try {
        const data = await apiClient.authPost<{
          success: boolean;
          deviceToken?: string;
          deviceId?: string;
          message?: string;
          error?: string;
          attemptsRemaining?: number;
        }>("/api/zeke/auth/verify-sms-code", { sessionId, code });

        if (data.success && data.deviceToken) {
          await setStoredValue(DEVICE_TOKEN_KEY, data.deviceToken);
          await setStoredValue(DEVICE_ID_KEY, data.deviceId || "");
          setDeviceToken(data.deviceToken);

          setState({
            isAuthenticated: true,
            isLoading: false,
            deviceId: data.deviceId || null,
            error: null,
          });
          setSmsPairingState({
            sessionId: null,
            expiresIn: null,
            attemptsRemaining: 3,
          });
          return true;
        } else {
          setSmsPairingState((prev) => ({
            ...prev,
            attemptsRemaining: data.attemptsRemaining ?? prev.attemptsRemaining - 1,
          }));
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: data.error || "Invalid code",
          }));
          return false;
        }
      } catch (error) {
        console.error("[Auth] Verify SMS code error:", error);
        const errorMessage =
          error instanceof ApiError
            ? error.message
            : "Connection error. Check your network.";
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
        smsPairingState, 
        unpairDevice, 
        checkAuth, 
        checkSmsPairingStatus 
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
