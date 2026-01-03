/**
 * Frame-Based BLE Audio Transmission
 *
 * Inspired by Omi's robust BLE audio streaming, this module implements:
 * - Frame-based transmission with packet indexing
 * - Automatic packet loss detection and recovery
 * - Multi-packet frame assembly
 * - Buffering for reliable audio streaming over BLE
 *
 * BLE packets have size limits (typically 20-512 bytes), so audio frames
 * are split into indexed packets and reassembled on the client side.
 *
 * Packet structure:
 * [packet_index: 2 bytes][frame_id: 1 byte][audio_data: N bytes]
 */

export interface AudioFrame {
  frameId: number;
  packets: Map<number, Buffer>;
  expectedPackets: number;
  timestamp: number;
  isComplete: boolean;
}

export interface BLEPacket {
  packetIndex: number;
  frameId: number;
  audioData: Buffer;
}

export interface FrameAssemblerConfig {
  maxPacketsPerFrame: number;
  packetSize: number; // Maximum BLE packet size (e.g., 320 bytes)
  frameTimeout: number; // Timeout for incomplete frames (ms)
  enableLossDetection: boolean;
}

export interface FrameAssemblerMetrics {
  totalFramesReceived: number;
  completeFrames: number;
  incompleteFrames: number;
  packetsLost: number;
  packetsRecovered: number;
  averagePacketsPerFrame: number;
}

const DEFAULT_CONFIG: FrameAssemblerConfig = {
  maxPacketsPerFrame: 20,
  packetSize: 320,
  frameTimeout: 100, // 100ms timeout for frame completion
  enableLossDetection: true,
};

type FrameCompleteCallback = (frameData: Buffer, frameId: number) => void;
type PacketLossCallback = (frameId: number, lostPackets: number[]) => void;

class FrameBasedBLEStreamer {
  private config: FrameAssemblerConfig;
  private activeFrames = new Map<number, AudioFrame>();
  private frameCompleteCallbacks: FrameCompleteCallback[] = [];
  private packetLossCallbacks: PacketLossCallback[] = [];
  private metrics: FrameAssemblerMetrics = {
    totalFramesReceived: 0,
    completeFrames: 0,
    incompleteFrames: 0,
    packetsLost: 0,
    packetsRecovered: 0,
    averagePacketsPerFrame: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<FrameAssemblerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
    console.log('[Frame-Based BLE] Initialized with config:', this.config);
  }

  /**
   * Receive and process a BLE packet
   */
  public receivePacket(data: Buffer): void {
    if (data.length < 3) {
      console.error('[Frame-Based BLE] Invalid packet size:', data.length);
      return;
    }

    // Parse packet structure
    const packetIndex = data.readUInt16LE(0);
    const frameId = data.readUInt8(2);
    const audioData = data.subarray(3);

    console.log(`[Frame-Based BLE] Received packet: frame=${frameId}, index=${packetIndex}, size=${audioData.length}`);

    // Get or create frame
    let frame = this.activeFrames.get(frameId);
    if (!frame) {
      frame = {
        frameId,
        packets: new Map(),
        expectedPackets: this.config.maxPacketsPerFrame,
        timestamp: Date.now(),
        isComplete: false,
      };
      this.activeFrames.set(frameId, frame);
      this.metrics.totalFramesReceived++;
    }

    // Store packet
    frame.packets.set(packetIndex, Buffer.from(audioData));

    // Check if frame is complete
    if (this.isFrameComplete(frame)) {
      this.assembleAndProcess(frame);
      this.activeFrames.delete(frameId);
    }
  }

  /**
   * Check if all packets for a frame have been received
   */
  private isFrameComplete(frame: AudioFrame): boolean {
    // Frame is complete when we have consecutive packets from 0 to N
    const sortedIndices = Array.from(frame.packets.keys()).sort((a, b) => a - b);

    // Check for consecutive sequence starting from 0
    if (sortedIndices.length === 0 || sortedIndices[0] !== 0) {
      return false;
    }

    for (let i = 0; i < sortedIndices.length - 1; i++) {
      if (sortedIndices[i + 1] !== sortedIndices[i] + 1) {
        return false;
      }
    }

    // Consider frame complete if we have a reasonable number of packets
    // Actual frame size may be less than maxPacketsPerFrame
    return true;
  }

  /**
   * Assemble packets into complete frame and trigger callback
   */
  private assembleAndProcess(frame: AudioFrame): void {
    const sortedPackets = Array.from(frame.packets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, data]) => data);

    const completeAudio = Buffer.concat(sortedPackets);

    console.log(`[Frame-Based BLE] ✓ Frame ${frame.frameId} complete: ${frame.packets.size} packets, ${completeAudio.length} bytes`);

    this.metrics.completeFrames++;
    this.updateAveragePacketsPerFrame(frame.packets.size);

    // Notify callbacks
    this.frameCompleteCallbacks.forEach(callback => {
      try {
        callback(completeAudio, frame.frameId);
      } catch (error) {
        console.error('[Frame-Based BLE] Callback error:', error);
      }
    });

    frame.isComplete = true;
  }

  /**
   * Detect packet loss for a frame
   */
  private detectPacketLoss(frame: AudioFrame): number[] {
    const receivedIndices = new Set(frame.packets.keys());
    const lostPackets: number[] = [];

    // Check for missing packets in expected range
    const maxIndex = Math.max(...Array.from(receivedIndices));

    for (let i = 0; i <= maxIndex; i++) {
      if (!receivedIndices.has(i)) {
        lostPackets.push(i);
      }
    }

    return lostPackets;
  }

  /**
   * Clean up stale incomplete frames (timeout mechanism)
   */
  private cleanupStaleFrames(): void {
    const now = Date.now();
    const timeout = this.config.frameTimeout;

    for (const [frameId, frame] of this.activeFrames.entries()) {
      const age = now - frame.timestamp;

      if (age > timeout) {
        const lostPackets = this.detectPacketLoss(frame);

        if (lostPackets.length > 0) {
          console.warn(`[Frame-Based BLE] ✗ Frame ${frameId} timeout after ${age}ms, lost ${lostPackets.length} packets:`, lostPackets);

          this.metrics.incompleteFrames++;
          this.metrics.packetsLost += lostPackets.length;

          // Notify packet loss callbacks
          this.packetLossCallbacks.forEach(callback => {
            try {
              callback(frameId, lostPackets);
            } catch (error) {
              console.error('[Frame-Based BLE] Loss callback error:', error);
            }
          });
        } else if (frame.packets.size > 0) {
          // Frame has some packets but isn't "complete" by strict criteria
          // Assemble what we have (recovery mode)
          console.warn(`[Frame-Based BLE] ~ Frame ${frameId} incomplete but assembling ${frame.packets.size} packets (recovery mode)`);
          this.assembleAndProcess(frame);
          this.metrics.packetsRecovered += frame.packets.size;
        }

        this.activeFrames.delete(frameId);
      }
    }
  }

  /**
   * Start cleanup timer for stale frames
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Check for stale frames every 50ms
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleFrames();
    }, 50);
  }

  /**
   * Update average packets per frame metric
   */
  private updateAveragePacketsPerFrame(packetCount: number): void {
    const totalFrames = this.metrics.completeFrames + this.metrics.incompleteFrames;
    const currentTotal = this.metrics.averagePacketsPerFrame * (totalFrames - 1);
    this.metrics.averagePacketsPerFrame = (currentTotal + packetCount) / totalFrames;
  }

  /**
   * Register callback for complete frames
   */
  public onFrameComplete(callback: FrameCompleteCallback): () => void {
    this.frameCompleteCallbacks.push(callback);
    return () => {
      this.frameCompleteCallbacks = this.frameCompleteCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Register callback for packet loss events
   */
  public onPacketLoss(callback: PacketLossCallback): () => void {
    this.packetLossCallbacks.push(callback);
    return () => {
      this.packetLossCallbacks = this.packetLossCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Split audio data into frames and packets for transmission
   */
  public splitIntoPackets(audioData: Buffer, frameId: number): BLEPacket[] {
    const packets: BLEPacket[] = [];
    const dataPerPacket = this.config.packetSize - 3; // 3 bytes for header
    const totalPackets = Math.ceil(audioData.length / dataPerPacket);

    for (let i = 0; i < totalPackets; i++) {
      const start = i * dataPerPacket;
      const end = Math.min(start + dataPerPacket, audioData.length);
      const chunk = audioData.subarray(start, end);

      // Create packet with header
      const packet = Buffer.alloc(chunk.length + 3);
      packet.writeUInt16LE(i, 0); // Packet index
      packet.writeUInt8(frameId, 2); // Frame ID
      chunk.copy(packet, 3); // Audio data

      packets.push({
        packetIndex: i,
        frameId,
        audioData: packet,
      });
    }

    console.log(`[Frame-Based BLE] Split ${audioData.length} bytes into ${totalPackets} packets for frame ${frameId}`);
    return packets;
  }

  /**
   * Get current metrics
   */
  public getMetrics(): FrameAssemblerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get health status
   */
  public getHealth(): {
    healthy: boolean;
    completionRate: number;
    lossRate: number;
    averagePacketsPerFrame: number;
  } {
    const totalFrames = this.metrics.completeFrames + this.metrics.incompleteFrames;
    const completionRate = totalFrames > 0 ? this.metrics.completeFrames / totalFrames : 1;
    const totalPackets = totalFrames * this.metrics.averagePacketsPerFrame;
    const lossRate = totalPackets > 0 ? this.metrics.packetsLost / totalPackets : 0;

    return {
      healthy: completionRate > 0.95 && lossRate < 0.05,
      completionRate,
      lossRate,
      averagePacketsPerFrame: this.metrics.averagePacketsPerFrame,
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalFramesReceived: 0,
      completeFrames: 0,
      incompleteFrames: 0,
      packetsLost: 0,
      packetsRecovered: 0,
      averagePacketsPerFrame: 0,
    };
    console.log('[Frame-Based BLE] Metrics reset');
  }

  /**
   * Clear all active frames (use when disconnecting)
   */
  public reset(): void {
    this.activeFrames.clear();
    console.log('[Frame-Based BLE] Reset - cleared all active frames');
  }

  /**
   * Cleanup and dispose
   */
  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.activeFrames.clear();
    this.frameCompleteCallbacks = [];
    this.packetLossCallbacks = [];
    console.log('[Frame-Based BLE] Disposed');
  }
}

// Export singleton instance
export const frameBasedBLEStreamer = new FrameBasedBLEStreamer();

// Export class for custom instances
export { FrameBasedBLEStreamer };
