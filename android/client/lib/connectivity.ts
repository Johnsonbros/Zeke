import NetInfo, {
  NetInfoState,
  NetInfoStateType,
} from "@react-native-community/netinfo";

type ConnectivityCallback = (isOnline: boolean) => void;

interface ConnectivityListenerOptions {
  debounceMs?: number;
  onOnline?: () => void;
  onOffline?: () => void;
}

export const ConnectivityService = {
  _unsubscribe: null as (() => void) | null,
  _isOnline: false,
  _debounceTimer: null as NodeJS.Timeout | null,
  _callbacks: [] as ConnectivityCallback[],
  _onOnlineCallback: null as (() => void) | null,
  _onOfflineCallback: null as (() => void) | null,
  _debounceMs: 500,
  _lastOnlineTime: 0,

  /**
   * Initialize connectivity listener
   */
  initialize(options: ConnectivityListenerOptions = {}): void {
    this._debounceMs = options.debounceMs || 500;
    this._onOnlineCallback = options.onOnline || null;
    this._onOfflineCallback = options.onOffline || null;

    // Get initial state
    NetInfo.fetch().then((state) => {
      this._isOnline = this._isStateOnline(state);
      console.log(
        `[Connectivity] Initial state: ${this._isOnline ? "online" : "offline"}`,
      );
    });

    // Subscribe to changes
    this._unsubscribe = NetInfo.addEventListener((state) => {
      this._handleStateChange(state);
    });

    console.log("[Connectivity] Listener initialized");
  },

  /**
   * Cleanup listener
   */
  cleanup(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    console.log("[Connectivity] Listener cleaned up");
  },

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this._isOnline;
  },

  /**
   * Register callback for connectivity changes
   */
  onChange(callback: ConnectivityCallback): () => void {
    this._callbacks.push(callback);
    // Return unsubscribe function
    return () => {
      this._callbacks = this._callbacks.filter((cb) => cb !== callback);
    };
  },

  /**
   * Check if state is online
   */
  _isStateOnline(state: NetInfoState): boolean {
    return (
      state.isConnected === true &&
      (state.type === NetInfoStateType.wifi ||
        state.type === NetInfoStateType.cellular ||
        state.type === NetInfoStateType.ethernet ||
        state.type === NetInfoStateType.other)
    );
  },

  /**
   * Handle state change with debounce
   */
  _handleStateChange(state: NetInfoState): void {
    const wasOnline = this._isOnline;
    const isNowOnline = this._isStateOnline(state);

    // Only process if state actually changed
    if (wasOnline === isNowOnline) {
      return;
    }

    console.log(
      `[Connectivity] State changed: ${wasOnline ? "online" : "offline"} → ${isNowOnline ? "online" : "offline"}`,
    );

    // Debounce rapid reconnections
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    this._debounceTimer = setTimeout(() => {
      this._isOnline = isNowOnline;
      this._debounceTimer = null;

      // Notify all callbacks
      this._callbacks.forEach((cb) => cb(isNowOnline));

      // Call specific callbacks
      if (isNowOnline && this._onOnlineCallback) {
        console.log("[Connectivity] Device came online - triggering sync");
        this._lastOnlineTime = Date.now();
        this._onOnlineCallback();
      } else if (!isNowOnline && this._onOfflineCallback) {
        console.log("[Connectivity] Device went offline");
        this._onOfflineCallback();
      }
    }, this._debounceMs);
  },

  /**
   * Get time since last online
   */
  getTimeSinceOnline(): number {
    if (!this._isOnline) {
      return -1;
    }
    return Date.now() - this._lastOnlineTime;
  },

  /**
   * Get current network type
   */
  async getNetworkType(): Promise<NetInfoStateType | null> {
    try {
      const state = await NetInfo.fetch();
      return state.type;
    } catch (error) {
      console.error("[Connectivity] Failed to get network type:", error);
      return null;
    }
  },
};

/**
 * Hook for using connectivity in components
 */
export function useConnectivityListener(
  onOnline?: () => void,
  onOffline?: () => void,
): {
  isOnline: boolean;
} {
  // This would be used in a useEffect in the root component
  // For now, we export the service to be initialized at app startup
  return {
    isOnline: ConnectivityService.isOnline(),
  };
}
