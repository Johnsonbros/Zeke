/**
 * Service Manager Singleton Pattern
 *
 * Inspired by Omi's ServiceManager pattern, this provides:
 * - Centralized lifecycle management for all client services
 * - Prevention of double initialization
 * - Easy testing with mock services
 * - Clean dependency injection
 *
 * Usage:
 * ServiceManager.instance().bluetooth.connect(deviceId);
 * ServiceManager.instance().audio.startRecording();
 */

import { bluetoothService } from './bluetooth';
import type { ConnectionState, AudioStreamState, BLEDevice } from './bluetooth';

// Service interfaces for type safety
export interface BluetoothService {
  startScan(): Promise<void>;
  stopScan(): void;
  connect(deviceId: string): Promise<boolean>;
  disconnect(): Promise<void>;
  getConnectionState(): ConnectionState;
  getAudioStreamState(): AudioStreamState;
  startAudioStream(): Promise<boolean>;
  stopAudioStream(): void;
  getConnectedDevice(): Promise<BLEDevice | null>;
  isUsingRealBle(): boolean;
}

export interface AudioService {
  startRecording(): Promise<boolean>;
  stopRecording(): void;
  isRecording(): boolean;
  getAudioLevel(): number;
}

export interface LocationService {
  startTracking(): Promise<boolean>;
  stopTracking(): void;
  getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null>;
  isTracking(): boolean;
}

export interface SyncService {
  sync(): Promise<void>;
  getLastSyncTime(): Date | null;
  isSyncing(): boolean;
}

export interface ServiceManagerConfig {
  enableLogging: boolean;
  autoInitialize: boolean;
}

const DEFAULT_CONFIG: ServiceManagerConfig = {
  enableLogging: true,
  autoInitialize: true,
};

class ServiceManager {
  private static _instance: ServiceManager;
  private initialized = false;
  private initializing = false;
  private config: ServiceManagerConfig;

  // Service instances
  private _bluetooth: BluetoothService;
  private _audio: AudioService | null = null;
  private _location: LocationService | null = null;
  private _sync: SyncService | null = null;

  private constructor(config: Partial<ServiceManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize services
    this._bluetooth = bluetoothService as unknown as BluetoothService;

    if (this.config.enableLogging) {
      console.log('[Service Manager] Created with config:', this.config);
    }
  }

  /**
   * Get singleton instance
   */
  public static instance(): ServiceManager {
    if (!ServiceManager._instance) {
      ServiceManager._instance = new ServiceManager();
    }
    return ServiceManager._instance;
  }

  /**
   * Get Bluetooth service
   */
  public get bluetooth(): BluetoothService {
    return this._bluetooth;
  }

  /**
   * Get Audio service (lazy initialization)
   */
  public get audio(): AudioService {
    if (!this._audio) {
      this._audio = this.createAudioService();
    }
    return this._audio;
  }

  /**
   * Get Location service (lazy initialization)
   */
  public get location(): LocationService {
    if (!this._location) {
      this._location = this.createLocationService();
    }
    return this._location;
  }

  /**
   * Get Sync service (lazy initialization)
   */
  public get sync(): SyncService {
    if (!this._sync) {
      this._sync = this.createSyncService();
    }
    return this._sync;
  }

  /**
   * Initialize all services
   */
  public async initializeAll(): Promise<void> {
    if (this.initialized) {
      if (this.config.enableLogging) {
        console.warn('[Service Manager] Already initialized');
      }
      return;
    }

    if (this.initializing) {
      if (this.config.enableLogging) {
        console.warn('[Service Manager] Initialization already in progress');
      }
      return;
    }

    this.initializing = true;

    try {
      if (this.config.enableLogging) {
        console.log('[Service Manager] Initializing all services...');
      }

      // Initialize services in parallel
      await Promise.all([
        this.initializeAudio(),
        this.initializeLocation(),
        this.initializeSync(),
      ]);

      this.initialized = true;

      if (this.config.enableLogging) {
        console.log('[Service Manager] ✓ All services initialized');
      }
    } catch (error) {
      console.error('[Service Manager] Initialization failed:', error);
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Initialize Audio service
   */
  private async initializeAudio(): Promise<void> {
    if (this._audio) return;
    this._audio = this.createAudioService();
    if (this.config.enableLogging) {
      console.log('[Service Manager] Audio service initialized');
    }
  }

  /**
   * Initialize Location service
   */
  private async initializeLocation(): Promise<void> {
    if (this._location) return;
    this._location = this.createLocationService();
    if (this.config.enableLogging) {
      console.log('[Service Manager] Location service initialized');
    }
  }

  /**
   * Initialize Sync service
   */
  private async initializeSync(): Promise<void> {
    if (this._sync) return;
    this._sync = this.createSyncService();
    if (this.config.enableLogging) {
      console.log('[Service Manager] Sync service initialized');
    }
  }

  /**
   * Create Audio service instance
   */
  private createAudioService(): AudioService {
    return {
      startRecording: async () => {
        console.log('[Audio Service] Start recording');
        return true;
      },
      stopRecording: () => {
        console.log('[Audio Service] Stop recording');
      },
      isRecording: () => false,
      getAudioLevel: () => 0,
    };
  }

  /**
   * Create Location service instance
   */
  private createLocationService(): LocationService {
    return {
      startTracking: async () => {
        console.log('[Location Service] Start tracking');
        return true;
      },
      stopTracking: () => {
        console.log('[Location Service] Stop tracking');
      },
      getCurrentLocation: async () => null,
      isTracking: () => false,
    };
  }

  /**
   * Create Sync service instance
   */
  private createSyncService(): SyncService {
    return {
      sync: async () => {
        console.log('[Sync Service] Syncing...');
      },
      getLastSyncTime: () => null,
      isSyncing: () => false,
    };
  }

  /**
   * Cleanup and dispose all services
   */
  public async cleanup(): Promise<void> {
    if (this.config.enableLogging) {
      console.log('[Service Manager] Cleaning up all services...');
    }

    const cleanupTasks: Promise<void>[] = [];

    // Cleanup Bluetooth
    if (this._bluetooth) {
      cleanupTasks.push(this._bluetooth.disconnect());
    }

    // Cleanup Audio
    if (this._audio && this._audio.isRecording()) {
      this._audio.stopRecording();
    }

    // Cleanup Location
    if (this._location && this._location.isTracking()) {
      this._location.stopTracking();
    }

    await Promise.all(cleanupTasks);

    this.initialized = false;

    if (this.config.enableLogging) {
      console.log('[Service Manager] ✓ Cleanup complete');
    }
  }

  /**
   * Check if all services are initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service health status
   */
  public getHealth(): {
    initialized: boolean;
    services: {
      bluetooth: { available: boolean; connected: boolean };
      audio: { available: boolean; recording: boolean };
      location: { available: boolean; tracking: boolean };
      sync: { available: boolean; syncing: boolean };
    };
  } {
    return {
      initialized: this.initialized,
      services: {
        bluetooth: {
          available: this._bluetooth !== null,
          connected: this._bluetooth ? this._bluetooth.getConnectionState() === 'connected' : false,
        },
        audio: {
          available: this._audio !== null,
          recording: this._audio ? this._audio.isRecording() : false,
        },
        location: {
          available: this._location !== null,
          tracking: this._location ? this._location.isTracking() : false,
        },
        sync: {
          available: this._sync !== null,
          syncing: this._sync ? this._sync.isSyncing() : false,
        },
      },
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ServiceManagerConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.enableLogging) {
      console.log('[Service Manager] Config updated:', this.config);
    }
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    if (ServiceManager._instance) {
      ServiceManager._instance.cleanup().catch(console.error);
    }
    // @ts-expect-error - Intentionally delete for testing
    ServiceManager._instance = undefined;
  }
}

// Export singleton instance getter
export default ServiceManager;

// Export for direct usage
export const serviceManager = ServiceManager.instance();
