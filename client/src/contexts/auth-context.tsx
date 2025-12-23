import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AuthState {
  authenticated: boolean;
  isAdmin: boolean;
  phoneNumber: string | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  requestCode: (phoneNumber: string) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  verifyCode: (sessionId: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ["/api/web-auth/session"],
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
  });

  const requestCode = async (phoneNumber: string): Promise<{ success: boolean; sessionId?: string; error?: string }> => {
    try {
      const response = await apiRequest("POST", "/api/web-auth/request-code", { phoneNumber });
      const data = await response.json();
      if (data.success) {
        return { success: true, sessionId: data.sessionId };
      }
      return { success: false, error: data.error };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to send code" };
    }
  };

  const verifyCode = async (sessionId: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiRequest("POST", "/api/web-auth/verify-code", { sessionId, code });
      const data = await response.json();
      if (data.success) {
        await refetch();
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to verify code" };
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/web-auth/logout", {});
    } catch (error) {
      console.error("Logout error:", error);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/web-auth/session"] });
  };

  const value: AuthContextType = {
    authenticated: session?.authenticated ?? false,
    isAdmin: session?.isAdmin ?? false,
    phoneNumber: session?.phoneNumber ?? null,
    isLoading,
    requestCode,
    verifyCode,
    logout,
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
