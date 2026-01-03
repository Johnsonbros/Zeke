/**
 * Foreground Service Watchdog
 *
 * Inspired by Omi's battery optimization approach, this service:
 * - Monitors UI connection health
 * - Automatically stops recording if UI disconnects
 * - Prevents zombie background processes
 * - Optimizes battery usage
 *
 * Watchdog mechanism:
 * - UI must send heartbeat every N seconds
 * - If no heartbeat received, assume UI disconnected
 * - Automatically stop resource-intensive operations
 */

export interface WatchdogConfig {
  heartbeatInterval: number; // ms - how often UI should send heartbeat
  timeout: number; // ms - max time without heartbeat before triggering
  enableAutoStop: boolean; // Automatically stop operations on timeout
  operations: ('recording' | 'streaming' | 'location' | 'sync')[];
}

export interface WatchdogStatus {
  active: boolean;
  lastHeartbeat: Date | null;
  timeSinceLastHeartbeat: number | null; // ms
  healthy: boolean;
  operationsStopped: string[];
}

const DEFAULT_CONFIG: WatchdogConfig = {
  heartbeatInterval: 5000, // UI sends heartbeat every 5 seconds
  timeout: 15000, // 15 seconds without heartbeat = disconnected
  enableAutoStop: true,
  operations: ['recording', 'streaming', 'location'],
};

type DisconnectCallback = (operationsStopped: string[]) => void;

class ForegroundWatchdog {
  private config: WatchdogConfig;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: Date | null = null;
  private isActive = false;
  private disconnectCallbacks: DisconnectCallback[] = [];

  // Track which operations have been stopped
  private stoppedOperations: Set<string> = new Set();

  // Metrics
  private metrics = {
    totalHeartbeats: 0,
    disconnections: 0,
    operationsStoppedCount: 0,
    lastDisconnectionTime: null as Date | null,
  };

  constructor(config: Partial<WatchdogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[Foreground Watchdog] Initialized with config:', this.config);
  }

  /**
   * Start watchdog monitoring
   */
  public start(): void {
    if (this.isActive) {
      console.warn('[Foreground Watchdog] Already active');
      return;
    }

    this.isActive = true;
    this.lastHeartbeat = new Date();
    this.stoppedOperations.clear();

    this.startWatchdogTimer();
    console.log('[Foreground Watchdog] ✓ Started - monitoring UI connection');
  }

  /**
   * Stop watchdog monitoring
   */
  public stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    console.log('[Foreground Watchdog] Stopped');
  }

  /**
   * Receive heartbeat from UI
   */
  public heartbeat(): void {
    if (!this.isActive) {
      console.warn('[Foreground Watchdog] Received heartbeat but watchdog not active');
      return;
    }

    this.lastHeartbeat = new Date();
    this.metrics.totalHeartbeats++;

    // If operations were stopped, log that UI reconnected
    if (this.stoppedOperations.size > 0) {
      console.log('[Foreground Watchdog] ↻ UI reconnected, operations can be restarted');
      this.stoppedOperations.clear();
    }
  }

  /**
   * Start watchdog timer that checks for timeouts
   */
  private startWatchdogTimer(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
    }

    // Check every 1/3 of timeout period
    const checkInterval = Math.floor(this.config.timeout / 3);

    this.watchdogTimer = setInterval(() => {
      this.checkHeartbeat();
    }, checkInterval);
  }

  /**
   * Check heartbeat and trigger disconnect if timeout exceeded
   */
  private checkHeartbeat(): void {
    if (!this.isActive || !this.lastHeartbeat) {
      return;
    }

    const timeSinceHeartbeat = Date.now() - this.lastHeartbeat.getTime();

    if (timeSinceHeartbeat > this.config.timeout) {
      console.warn(`[Foreground Watchdog] ⚠ UI disconnected (${timeSinceHeartbeat}ms since last heartbeat)`);

      this.handleDisconnect();
    }
  }

  /**
   * Handle UI disconnection
   */
  private handleDisconnect(): void {
    this.metrics.disconnections++;
    this.metrics.lastDisconnectionTime = new Date();

    const operations = this.config.operations;
    const stopped: string[] = [];

    if (this.config.enableAutoStop) {
      // Stop configured operations
      for (const operation of operations) {
        if (!this.stoppedOperations.has(operation)) {
          this.stopOperation(operation);
          this.stoppedOperations.add(operation);
          stopped.push(operation);
        }
      }

      this.metrics.operationsStoppedCount += stopped.length;

      console.log(`[Foreground Watchdog] ✗ Stopped ${stopped.length} operations:`, stopped.join(', '));
    }

    // Notify callbacks
    this.notifyDisconnect(stopped);
  }

  /**
   * Stop a specific operation
   */
  private stopOperation(operation: string): void {
    switch (operation) {
      case 'recording':
        this.stopRecording();
        break;

      case 'streaming':
        this.stopStreaming();
        break;

      case 'location':
        this.stopLocationTracking();
        break;

      case 'sync':
        this.stopSync();
        break;

      default:
        console.warn(`[Foreground Watchdog] Unknown operation: ${operation}`);
    }
  }

  /**
   * Stop audio recording
   */
  private stopRecording(): void {
    try {
      // Import dynamically to avoid circular dependency
      const serviceManager = require('./service-manager').default;
      const manager = serviceManager.instance();

      if (manager.audio && manager.audio.isRecording()) {
        manager.audio.stopRecording();
        console.log('[Foreground Watchdog] ⏹ Stopped audio recording');
      }
    } catch (error) {
      console.error('[Foreground Watchdog] Error stopping recording:', error);
    }
  }

  /**
   * Stop BLE audio streaming
   */
  private stopStreaming(): void {
    try {
      const serviceManager = require('./service-manager').default;
      const manager = serviceManager.instance();

      if (manager.bluetooth) {
        manager.bluetooth.stopAudioStream();
        console.log('[Foreground Watchdog] ⏹ Stopped BLE streaming');
      }
    } catch (error) {
      console.error('[Foreground Watchdog] Error stopping streaming:', error);
    }
  }

  /**
   * Stop location tracking
   */
  private stopLocationTracking(): void {
    try {
      const serviceManager = require('./service-manager').default;
      const manager = serviceManager.instance();

      if (manager.location && manager.location.isTracking()) {
        manager.location.stopTracking();
        console.log('[Foreground Watchdog] ⏹ Stopped location tracking');
      }
    } catch (error) {
      console.error('[Foreground Watchdog] Error stopping location:', error);
    }
  }

  /**
   * Stop sync operations
   */
  private stopSync(): void {
    console.log('[Foreground Watchdog] ⏹ Paused sync operations');
    // Sync is typically passive, just log
  }

  /**
   * Register disconnect callback
   */
  public onDisconnect(callback: DisconnectCallback): () => void {
    this.disconnectCallbacks.push(callback);
    return () => {
      this.disconnectCallbacks = this.disconnectCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify disconnect callbacks
   */
  private notifyDisconnect(operationsStopped: string[]): void {
    this.disconnectCallbacks.forEach(callback => {
      try {
        callback(operationsStopped);
      } catch (error) {
        console.error('[Foreground Watchdog] Disconnect callback error:', error);
      }
    });
  }

  /**
   * Get current watchdog status
   */
  public getStatus(): WatchdogStatus {
    const now = Date.now();
    const timeSinceLastHeartbeat = this.lastHeartbeat
      ? now - this.lastHeartbeat.getTime()
      : null;

    const healthy = timeSinceLastHeartbeat !== null && timeSinceLastHeartbeat < this.config.timeout;

    return {
      active: this.isActive,
      lastHeartbeat: this.lastHeartbeat,
      timeSinceLastHeartbeat,
      healthy,
      operationsStopped: Array.from(this.stoppedOperations),
    };
  }

  /**
   * Get metrics
   */
  public getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<WatchdogConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart timer with new config if active
    if (this.isActive) {
      this.startWatchdogTimer();
    }

    console.log('[Foreground Watchdog] Config updated:', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalHeartbeats: 0,
      disconnections: 0,
      operationsStoppedCount: 0,
      lastDisconnectionTime: null,
    };
    console.log('[Foreground Watchdog] Metrics reset');
  }
}

// Singleton instance
export const foregroundWatchdog = new ForegroundWatchdog();

// Export for testing
export { ForegroundWatchdog };
