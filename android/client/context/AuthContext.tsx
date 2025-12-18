import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { setDeviceToken, getLocalApiUrl } from '@/lib/query-client';

const DEVICE_TOKEN_KEY = 'zeke_device_token';
const DEVICE_ID_KEY = 'zeke_device_id';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  deviceId: string | null;
  error: string | null;
}

interface AuthContextType extends AuthState {
  pairDevice: (secret: string, deviceName: string) => Promise<boolean>;
  unpairDevice: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteStoredValue(key: string): Promise<void> {
  if (Platform.OS === 'web') {
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

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getStoredValue(DEVICE_TOKEN_KEY);
      const storedDeviceId = await getStoredValue(DEVICE_ID_KEY);
      
      if (!token) {
        setState(prev => ({ ...prev, isAuthenticated: false, isLoading: false }));
        return false;
      }

      setDeviceToken(token);

      const baseUrl = getLocalApiUrl();
      const response = await fetch(new URL('/api/auth/verify', baseUrl).toString(), {
        method: 'POST',
        headers: { 'X-ZEKE-Device-Token': token }
      });

      if (response.ok) {
        const data = await response.json();
        setState({
          isAuthenticated: true,
          isLoading: false,
          deviceId: data.deviceId || storedDeviceId,
          error: null,
        });
        return true;
      } else if (response.status === 401) {
        await deleteStoredValue(DEVICE_TOKEN_KEY);
        await deleteStoredValue(DEVICE_ID_KEY);
        setDeviceToken(null);
        setState({
          isAuthenticated: false,
          isLoading: false,
          deviceId: null,
          error: 'Session expired. Please pair again.',
        });
        return false;
      }
      
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    } catch (error) {
      console.error('[Auth] Check auth error:', error);
      setState(prev => ({ ...prev, isLoading: false, error: 'Connection error' }));
      return false;
    }
  }, []);

  const pairDevice = useCallback(async (secret: string, deviceName: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const baseUrl = getLocalApiUrl();
      const response = await fetch(new URL('/api/auth/pair', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, deviceName }),
      });

      const data = await response.json();

      if (response.ok && data.deviceToken) {
        await setStoredValue(DEVICE_TOKEN_KEY, data.deviceToken);
        await setStoredValue(DEVICE_ID_KEY, data.deviceId);
        setDeviceToken(data.deviceToken);
        
        setState({
          isAuthenticated: true,
          isLoading: false,
          deviceId: data.deviceId,
          error: null,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: data.message || 'Pairing failed',
        }));
        return false;
      }
    } catch (error) {
      console.error('[Auth] Pair error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Connection error. Check your network.',
      }));
      return false;
    }
  }, []);

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
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ ...state, pairDevice, unpairDevice, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
