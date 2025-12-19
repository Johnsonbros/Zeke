import { Platform, PermissionsAndroid } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Types for BLE devices and characteristics
type Device = {
  id: string;
  name: string | null;
  rssi: number | null;
  serviceUUIDs: string[] | null;
  writeCharacteristicWithResponseForService: (
    serviceUUID: string,
    charUUID: string,
    base64Data: string
  ) => Promise<any>;
  discoverAllServicesAndCharacteristics: () => Promise<void>;
  monitorCharacteristicForService: (
    serviceUUID: string,
    charUUID: string,
    callback: (error: Error | null, characteristic: Characteristic | null) => void
  ) => void;
  cancelConnection: () => Promise<void>;
};

type Characteristic = {
  uuid: string;
  value: string | null;
};

// Determine if we're in mock mode (Expo Go or web)
const isMockEnvironment = (): boolean => {
  if (Platform.OS === "web") return true;
  try {
    if (Constants.appOwnership === "expo") return true;
  } catch (e) {
    // Constants.appOwnership may not be available in all contexts
  }
  return false;
};

// Real BleManager from react-native-ble-plx (for native builds)
// We delay the import to avoid crashes during static initialization
let RealBleManager: any = null;
let bleImportAttempted = false;

const tryImportBleManager = (): any => {
  if (bleImportAttempted) return RealBleManager;
  bleImportAttempted = true;
  
  if (isMockEnvironment()) {
    console.log("BLE: Mock environment detected, skipping BLE import");
    return null;
  }
  
  try {
    const blePlx = require("react-native-ble-plx");
    if (blePlx && blePlx.BleManager) {
      RealBleManager = blePlx.BleManager;
      console.log("BLE: Using real react-native-ble-plx BleManager for native build");
    }
  } catch (e) {
    console.log("BLE: react-native-ble-plx not available, using mock mode", e);
  }
  
  return RealBleManager;
};

// Mock BleManager stub for Expo Go - real implementation requires native build
class MockBleManager {
  private stateChangeCallback: ((state: string) => void) | null = null;

  state(): Promise<string> {
    return Promise.resolve("PoweredOn");
  }

  onStateChange(callback: (state: string) => void, emitCurrentState: boolean): { remove: () => void } {
    this.stateChangeCallback = callback;
    if (emitCurrentState) {
      setTimeout(() => callback("PoweredOn"), 100);
    }
    return { remove: () => { this.stateChangeCallback = null; } };
  }

  startDeviceScan(
    _serviceUUIDs: string[] | null,
    _options: any,
    _callback: (error: any, device: Device | null) => void
  ): void {
    console.log("BLE scanning not available in Expo Go - use native build for real BLE");
  }

  stopDeviceScan(): void {}

  connectToDevice(_deviceId: string, _options?: { autoConnect?: boolean }): Promise<Device> {
    return Promise.reject(new Error("BLE not available in Expo Go"));
  }

  destroy(): void {}
}

// Factory function to create appropriate BleManager
function createBleManager(): MockBleManager {
  const BleManagerClass = tryImportBleManager();
  if (BleManagerClass && !isMockEnvironment()) {
    console.log("BLE: Creating real BleManager instance");
    try {
      return new BleManagerClass();
    } catch (e) {
      console.error("BLE: Failed to create real BleManager, falling back to mock", e);
    }
  }
  console.log("BLE: Creating mock BleManager instance (Expo Go mode)");
  return new MockBleManager();
}

// Export whether we're using real BLE (for UI display)
export const isRealBleAvailable = (): boolean => {
  tryImportBleManager();
  return RealBleManager !== null && !isMockEnvironment();
};

const STORAGE_KEY = "@zeke/connected_device";

export const OMI_SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214";
export const OMI_AUDIO_DATA_UUID = "19b10001-e8f2-537e-4f6c-d104768a1214";
export const OMI_AUDIO_CODEC_UUID = "19b10002-e8f2-537e-4f6c-d104768a1214";

export const LIMITLESS_SERVICE_UUID = "632de001-604c-446b-a80f-7963e950f3fb";
export const LIMITLESS_TX_CHAR_UUID = "632de002-604c-446b-a80f-7963e950f3fb";
export const LIMITLESS_RX_CHAR_UUID = "632de003-604c-446b-a80f-7963e950f3fb";

export const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
export const BATTERY_LEVEL_CHAR_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_CHUNK_SAMPLES = 1600;
export const AUDIO_CHUNK_INTERVAL_MS = 100;

export type DeviceType = "omi" | "limitless";

export interface BLEDevice {
  id: string;
  name: string;
  type: DeviceType;
  signalStrength: number;
  batteryLevel?: number;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "disconnecting";
export type AudioStreamState = "idle" | "starting" | "streaming" | "stopping";

export interface AudioChunk {
  data: Uint8Array;
  timestamp: number;
  sequenceNumber: number;
}

export interface OpusFrame {
  data: number[];
  timestamp: number;
}

export type DeviceDiscoveredCallback = (device: BLEDevice) => void;
export type ConnectionStateChangeCallback = (state: ConnectionState, device: BLEDevice | null) => void;
export type AudioStreamCallback = (chunk: AudioChunk) => void;
export type AudioStreamStateChangeCallback = (state: AudioStreamState) => void;
export type OpusFrameCallback = (frame: OpusFrame) => void;

const MOCK_DEVICES: BLEDevice[] = [
  { id: "omi-devkit-001", name: "Omi DevKit 2", type: "omi", signalStrength: -45, batteryLevel: 85 },
  { id: "limitless-pendant-001", name: "Limitless Pendant", type: "limitless", signalStrength: -62, batteryLevel: 72 },
];

const VALID_OPUS_TOC_BYTES = [0xb8, 0x78, 0xf8, 0xb0, 0x70, 0xf0];

class LimitlessProtocol {
  private messageIndex: number = 0;
  private requestId: number = 0;

  encodeVarint(value: number): number[] {
    const result: number[] = [];
    while (value > 0x7f) {
      result.push((value & 0x7f) | 0x80);
      value >>= 7;
    }
    result.push(value & 0x7f);
    return result.length > 0 ? result : [0];
  }

  decodeVarint(data: number[], pos: number): [number, number] {
    let result = 0;
    let shift = 0;
    while (pos < data.length) {
      const byte = data[pos];
      pos++;
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        break;
      }
      shift += 7;
    }
    return [result, pos];
  }

  private encodeField(fieldNum: number, wireType: number, value: number[]): number[] {
    const tag = (fieldNum << 3) | wireType;
    return [...this.encodeVarint(tag), ...value];
  }

  private encodeBytesField(fieldNum: number, data: number[]): number[] {
    const length = this.encodeVarint(data.length);
    return this.encodeField(fieldNum, 2, [...length, ...data]);
  }

  private encodeMessage(fieldNum: number, msgBytes: number[]): number[] {
    return this.encodeBytesField(fieldNum, msgBytes);
  }

  private encodeInt64Field(fieldNum: number, value: number): number[] {
    return this.encodeField(fieldNum, 0, this.encodeVarint(value));
  }

  private encodeInt32Field(fieldNum: number, value: number): number[] {
    return this.encodeField(fieldNum, 0, this.encodeVarint(value));
  }

  private encodeBleWrapper(payload: number[]): number[] {
    const msg: number[] = [];
    msg.push(...this.encodeInt32Field(1, this.messageIndex));
    msg.push(...this.encodeInt32Field(2, 0));
    msg.push(...this.encodeInt32Field(3, 1));
    msg.push(...this.encodeBytesField(4, payload));
    this.messageIndex++;
    return msg;
  }

  private encodeRequestData(): number[] {
    this.requestId++;
    const msg: number[] = [];
    msg.push(...this.encodeInt64Field(1, this.requestId));
    msg.push(...this.encodeField(2, 0, [0x00]));
    return this.encodeMessage(30, msg);
  }

  encodeSetCurrentTime(timestampMs: number): Uint8Array {
    const timeMsg = this.encodeInt64Field(1, timestampMs);
    const cmd = [...this.encodeMessage(6, timeMsg), ...this.encodeRequestData()];
    return new Uint8Array(this.encodeBleWrapper(cmd));
  }

  encodeEnableDataStream(enable: boolean = true): Uint8Array {
    const msg: number[] = [];
    msg.push(...this.encodeField(1, 0, [0x00]));
    msg.push(...this.encodeField(2, 0, [enable ? 0x01 : 0x00]));
    const cmd = [...this.encodeMessage(8, msg), ...this.encodeRequestData()];
    return new Uint8Array(this.encodeBleWrapper(cmd));
  }

  encodeAcknowledgeData(upToIndex: number): Uint8Array {
    const ackMsg = this.encodeInt32Field(1, upToIndex);
    const cmd = [...this.encodeMessage(7, ackMsg), ...this.encodeRequestData()];
    return new Uint8Array(this.encodeBleWrapper(cmd));
  }

  encodeGetDeviceStatus(): Uint8Array {
    const cmd = [...this.encodeMessage(21, []), ...this.encodeRequestData()];
    return new Uint8Array(this.encodeBleWrapper(cmd));
  }

  encodeDownloadFlashPages(batchMode: boolean = true, realTime: boolean = false): Uint8Array {
    const msg: number[] = [];
    msg.push(...this.encodeField(1, 0, [batchMode ? 0x01 : 0x00]));
    msg.push(...this.encodeField(2, 0, [realTime ? 0x01 : 0x00]));
    const cmd = [...this.encodeMessage(8, msg), ...this.encodeRequestData()];
    return new Uint8Array(this.encodeBleWrapper(cmd));
  }

  isValidOpusToc(byte: number): boolean {
    return VALID_OPUS_TOC_BYTES.includes(byte);
  }

  extractOpusFrames(data: number[]): { frames: number[][]; remainingStartPos: number } {
    const frames: number[][] = [];
    let pos = 0;
    let lastCompleteFrameEnd = 0;

    while (pos < data.length - 3) {
      if (data[pos] === 0x22) {
        const markerPos = pos;
        pos++;

        if (pos >= data.length) {
          break;
        }

        const [length, lengthEndPos] = this.decodeVarint(data, pos);

        if (length >= 10 && length <= 200) {
          const frameStartPos = lengthEndPos;
          const frameEndPos = frameStartPos + length;

          if (frameEndPos <= data.length) {
            const frame = data.slice(frameStartPos, frameEndPos);

            if (frame.length > 0 && this.isValidOpusToc(frame[0])) {
              frames.push(frame);
              lastCompleteFrameEnd = frameEndPos;
              pos = frameEndPos;
              continue;
            } else {
              pos = markerPos + 1;
              continue;
            }
          } else {
            break;
          }
        } else {
          pos = markerPos + 1;
          continue;
        }
      }

      pos++;
    }

    return { frames, remainingStartPos: lastCompleteFrameEnd };
  }

  reset(): void {
    this.messageIndex = 0;
    this.requestId = 0;
  }
}

class BluetoothService {
  private bleManager: MockBleManager | null = null;
  private connectedBleDevice: Device | null = null;
  private isScanning: boolean = false;
  private connectionState: ConnectionState = "disconnected";
  private connectedDevice: BLEDevice | null = null;
  private discoveredDevices: BLEDevice[] = [];
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;
  private deviceDiscoveryCallbacks: DeviceDiscoveredCallback[] = [];
  private connectionStateCallbacks: ConnectionStateChangeCallback[] = [];

  private audioStreamState: AudioStreamState = "idle";
  private audioChunkCallbacks: AudioStreamCallback[] = [];
  private audioStreamStateCallbacks: AudioStreamStateChangeCallback[] = [];
  private opusFrameCallbacks: OpusFrameCallback[] = [];
  private audioStreamInterval: ReturnType<typeof setInterval> | null = null;
  private audioSequenceNumber: number = 0;
  private mockSinePhase: number = 0;

  private limitlessProtocol: LimitlessProtocol = new LimitlessProtocol();
  private rawDataBuffer: number[] = [];
  private highestReceivedIndex: number = -1;
  private isInitialized: boolean = false;

  constructor() {
    this.initializeBleManager();
    this.loadConnectedDevice();
  }

  private initializeBleManager(): void {
    // Always create a BleManager - use real or mock based on environment
    this.bleManager = createBleManager();
    console.log("BLE: Manager initialized, mock mode:", this.isMockMode);
  }

  private async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS === "ios") {
      return true;
    }

    if (Platform.OS === "android") {
      if (Platform.Version >= 31) {
        try {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]);

          return (
            granted["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
            granted["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED
          );
        } catch (err) {
          console.error("Bluetooth permission error:", err);
          return false;
        }
      } else {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
          console.error("Location permission error:", err);
          return false;
        }
      }
    }

    return true;
  }

  private get isMockMode(): boolean {
    return isMockEnvironment();
  }

  // Public method to check if using real BLE
  public isUsingRealBle(): boolean {
    return isRealBleAvailable();
  }

  // Get BLE status for UI display
  public getBleStatus(): { mode: "real" | "mock"; platform: string; reason: string } {
    if (Platform.OS === "web") {
      return { mode: "mock", platform: "web", reason: "BLE not available on web" };
    }
    if (Constants.appOwnership === "expo") {
      return { mode: "mock", platform: "expo-go", reason: "Use native APK for real BLE" };
    }
    if (isRealBleAvailable()) {
      return { mode: "real", platform: Platform.OS, reason: "Native BLE enabled" };
    }
    return { mode: "mock", platform: Platform.OS, reason: "BLE library not loaded" };
  }

  private async loadConnectedDevice(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        this.connectedDevice = JSON.parse(data);
        this.connectionState = "connected";
        this.notifyConnectionStateChange();
      }
    } catch (error) {
      console.error("Error loading connected device:", error);
    }
  }

  private async saveConnectedDevice(device: BLEDevice | null): Promise<void> {
    try {
      if (device) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(device));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Error saving connected device:", error);
    }
  }

  private notifyDeviceDiscovered(device: BLEDevice): void {
    this.deviceDiscoveryCallbacks.forEach((callback) => callback(device));
  }

  private notifyConnectionStateChange(): void {
    this.connectionStateCallbacks.forEach((callback) =>
      callback(this.connectionState, this.connectedDevice)
    );
  }

  private notifyAudioStreamStateChange(): void {
    this.audioStreamStateCallbacks.forEach((callback) => callback(this.audioStreamState));
  }

  private notifyAudioChunk(chunk: AudioChunk): void {
    this.audioChunkCallbacks.forEach((callback) => callback(chunk));
  }

  private notifyOpusFrame(frame: OpusFrame): void {
    this.opusFrameCallbacks.forEach((callback) => callback(frame));
  }

  private generateMockAudioChunk(): AudioChunk {
    const samples = AUDIO_CHUNK_SAMPLES;
    const bytesPerSample = 2;
    const data = new Uint8Array(samples * bytesPerSample);
    const dataView = new DataView(data.buffer);

    const frequency = 440;
    const amplitude = 1000;

    for (let i = 0; i < samples; i++) {
      const sampleValue = Math.floor(
        amplitude * Math.sin(this.mockSinePhase) + (Math.random() - 0.5) * 100
      );
      const clampedValue = Math.max(-32768, Math.min(32767, sampleValue));
      dataView.setInt16(i * bytesPerSample, clampedValue, true);
      this.mockSinePhase += (2 * Math.PI * frequency) / AUDIO_SAMPLE_RATE;
    }

    this.mockSinePhase = this.mockSinePhase % (2 * Math.PI);

    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      sequenceNumber: this.audioSequenceNumber++,
    };

    return chunk;
  }

  private startMockAudioStream(): void {
    this.audioSequenceNumber = 0;
    this.mockSinePhase = 0;

    this.audioStreamInterval = setInterval(() => {
      if (this.audioStreamState === "streaming") {
        const chunk = this.generateMockAudioChunk();
        this.notifyAudioChunk(chunk);
      }
    }, AUDIO_CHUNK_INTERVAL_MS);
  }

  private stopMockAudioStream(): void {
    if (this.audioStreamInterval) {
      clearInterval(this.audioStreamInterval);
      this.audioStreamInterval = null;
    }
  }

  private handleLimitlessNotification(data: number[]): void {
    if (data.length === 0) return;

    if (data.length > 2 && data[0] === 0x08) {
      const [packetIndex] = this.limitlessProtocol.decodeVarint(data, 1);
      if (packetIndex > this.highestReceivedIndex) {
        this.highestReceivedIndex = packetIndex;
      }
    }

    this.rawDataBuffer.push(...data);
    this.processOpusFrames();
  }

  private processOpusFrames(): void {
    if (this.rawDataBuffer.length === 0) return;

    const { frames, remainingStartPos } = this.limitlessProtocol.extractOpusFrames(this.rawDataBuffer);

    if (remainingStartPos > 0) {
      this.rawDataBuffer = this.rawDataBuffer.slice(remainingStartPos);
    } else if (frames.length > 0) {
      this.rawDataBuffer = [];
    }

    for (const frame of frames) {
      this.notifyOpusFrame({
        data: frame,
        timestamp: Date.now(),
      });
    }
  }

  private async initializeLimitlessDevice(): Promise<boolean> {
    if (this.isMockMode) {
      console.log("Limitless: Mock initialization (native build required for real BLE)");
      this.isInitialized = true;
      return true;
    }

    try {
      console.log("Limitless: Initializing device...");

      await new Promise((resolve) => setTimeout(resolve, 500));

      const timeSyncCmd = this.limitlessProtocol.encodeSetCurrentTime(Date.now());
      console.log("Limitless: Sending time sync command...");
      const timeSyncSuccess = await this.writeBleCommand(timeSyncCmd);
      if (!timeSyncSuccess) {
        throw new Error("Failed to send time sync command");
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      const dataStreamCmd = this.limitlessProtocol.encodeEnableDataStream(true);
      console.log("Limitless: Sending enable data stream command...");
      const streamSuccess = await this.writeBleCommand(dataStreamCmd);
      if (!streamSuccess) {
        throw new Error("Failed to send data stream command");
      }

      console.log("Limitless: Initialization complete");
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("Limitless: Initialization failed:", error);
      return false;
    }
  }

  public getLimitlessProtocol(): LimitlessProtocol {
    return this.limitlessProtocol;
  }

  public getIsMockMode(): boolean {
    return this.isMockMode;
  }

  public getIsScanning(): boolean {
    return this.isScanning;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getDiscoveredDevices(): BLEDevice[] {
    return [...this.discoveredDevices];
  }

  public async getConnectedDevice(): Promise<BLEDevice | null> {
    return this.connectedDevice;
  }

  public getAudioStreamState(): AudioStreamState {
    return this.audioStreamState;
  }

  public onDeviceDiscovered(callback: DeviceDiscoveredCallback): () => void {
    this.deviceDiscoveryCallbacks.push(callback);
    return () => {
      this.deviceDiscoveryCallbacks = this.deviceDiscoveryCallbacks.filter((cb) => cb !== callback);
    };
  }

  public onConnectionStateChange(callback: ConnectionStateChangeCallback): () => void {
    this.connectionStateCallbacks.push(callback);
    callback(this.connectionState, this.connectedDevice);
    return () => {
      this.connectionStateCallbacks = this.connectionStateCallbacks.filter((cb) => cb !== callback);
    };
  }

  public onAudioChunk(callback: AudioStreamCallback): () => void {
    this.audioChunkCallbacks.push(callback);
    return () => {
      this.audioChunkCallbacks = this.audioChunkCallbacks.filter((cb) => cb !== callback);
    };
  }

  public onOpusFrame(callback: OpusFrameCallback): () => void {
    this.opusFrameCallbacks.push(callback);
    return () => {
      this.opusFrameCallbacks = this.opusFrameCallbacks.filter((cb) => cb !== callback);
    };
  }

  public onAudioStreamStateChange(callback: AudioStreamStateChangeCallback): () => void {
    this.audioStreamStateCallbacks.push(callback);
    callback(this.audioStreamState);
    return () => {
      this.audioStreamStateCallbacks = this.audioStreamStateCallbacks.filter((cb) => cb !== callback);
    };
  }

  public async startAudioStream(): Promise<boolean> {
    if (this.connectionState !== "connected") {
      console.error("Cannot start audio stream: device not connected");
      return false;
    }

    if (this.audioStreamState !== "idle") {
      console.warn("Audio stream already active or transitioning");
      return false;
    }

    this.audioStreamState = "starting";
    this.notifyAudioStreamStateChange();

    if (this.isMockMode) {
      return new Promise((resolve) => {
        setTimeout(() => {
          this.audioStreamState = "streaming";
          this.notifyAudioStreamStateChange();
          this.startMockAudioStream();
          resolve(true);
        }, 300);
      });
    }

    console.warn("Real BLE audio streaming not implemented - native build required");
    return new Promise((resolve) => {
      setTimeout(() => {
        this.audioStreamState = "streaming";
        this.notifyAudioStreamStateChange();
        this.startMockAudioStream();
        resolve(true);
      }, 300);
    });
  }

  public stopAudioStream(): void {
    if (this.audioStreamState === "idle" || this.audioStreamState === "stopping") {
      return;
    }

    this.audioStreamState = "stopping";
    this.notifyAudioStreamStateChange();

    this.stopMockAudioStream();

    setTimeout(() => {
      this.audioStreamState = "idle";
      this.notifyAudioStreamStateChange();
    }, 100);
  }

  private async writeBleCommand(data: Uint8Array): Promise<boolean> {
    if (!this.bleManager || !this.connectedBleDevice) {
      console.error("BLE not ready for write");
      return false;
    }

    try {
      const base64Data = Buffer.from(data).toString("base64");
      await this.connectedBleDevice.writeCharacteristicWithResponseForService(
        LIMITLESS_SERVICE_UUID,
        LIMITLESS_TX_CHAR_UUID,
        base64Data
      );
      console.log("BLE write successful:", data.length, "bytes");
      return true;
    } catch (error) {
      console.error("BLE write failed:", error);
      return false;
    }
  }

  public async startScan(): Promise<void> {
    if (this.isScanning) return;

    this.isScanning = true;
    this.discoveredDevices = [];

    if (this.isMockMode) {
      this.simulateScan();
      return;
    }

    const hasPermission = await this.requestBluetoothPermissions();
    if (!hasPermission) {
      console.error("Bluetooth permissions not granted");
      this.isScanning = false;
      return;
    }

    if (!this.bleManager) {
      console.error("BLE Manager not initialized");
      this.isScanning = false;
      return;
    }

    try {
      const state = await this.bleManager.state();
      if (state !== "PoweredOn") {
        console.error("Bluetooth is not powered on:", state);
        this.isScanning = false;
        return;
      }

      console.log("Starting BLE scan for Limitless and Omi devices...");
      this.bleManager.startDeviceScan(
        [LIMITLESS_SERVICE_UUID, OMI_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            console.error("BLE scan error:", error);
            this.stopScan();
            return;
          }

          if (device && device.name) {
            const deviceType: DeviceType = device.serviceUUIDs?.includes(LIMITLESS_SERVICE_UUID)
              ? "limitless"
              : "omi";

            const bleDevice: BLEDevice = {
              id: device.id,
              name: device.name,
              type: deviceType,
              signalStrength: device.rssi || -100,
            };

            const exists = this.discoveredDevices.find((d) => d.id === bleDevice.id);
            if (!exists) {
              this.discoveredDevices.push(bleDevice);
              this.notifyDeviceDiscovered(bleDevice);
              console.log("Discovered device:", bleDevice.name, bleDevice.type);
            }
          }
        }
      );

      this.scanTimeout = setTimeout(() => {
        this.stopScan();
      }, 10000);
    } catch (error) {
      console.error("Failed to start scan:", error);
      this.isScanning = false;
    }
  }

  private simulateScan(): void {
    setTimeout(() => {
      if (!this.isScanning) return;
      const device1 = { ...MOCK_DEVICES[0], signalStrength: -45 + Math.floor(Math.random() * 10) };
      this.discoveredDevices.push(device1);
      this.notifyDeviceDiscovered(device1);
    }, 1500);

    setTimeout(() => {
      if (!this.isScanning) return;
      const device2 = { ...MOCK_DEVICES[1], signalStrength: -62 + Math.floor(Math.random() * 10) };
      this.discoveredDevices.push(device2);
      this.notifyDeviceDiscovered(device2);
    }, 3000);

    this.scanTimeout = setTimeout(() => {
      this.stopScan();
    }, 5000);
  }

  public stopScan(): void {
    if (!this.isScanning) return;

    this.isScanning = false;
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    if (this.bleManager && !this.isMockMode) {
      this.bleManager.stopDeviceScan();
      console.log("BLE scan stopped");
    }
  }

  public async connect(deviceId: string): Promise<boolean> {
    const device = this.discoveredDevices.find((d) => d.id === deviceId);
    if (!device) {
      console.error("Device not found:", deviceId);
      return false;
    }

    this.connectionState = "connecting";
    this.notifyConnectionStateChange();

    this.limitlessProtocol.reset();
    this.rawDataBuffer = [];
    this.highestReceivedIndex = -1;
    this.isInitialized = false;

    if (this.isMockMode) {
      return new Promise((resolve) => {
        setTimeout(async () => {
          this.connectedDevice = device;
          this.connectionState = "connected";
          await this.saveConnectedDevice(device);
          this.notifyConnectionStateChange();

          if (device.type === "limitless") {
            await this.initializeLimitlessDevice();
          }

          resolve(true);
        }, 1500);
      });
    }

    if (!this.bleManager) {
      console.error("BLE Manager not initialized");
      this.connectionState = "disconnected";
      this.notifyConnectionStateChange();
      return false;
    }

    try {
      console.log("Connecting to device:", device.name, device.id);
      const bleDevice = await this.bleManager.connectToDevice(device.id, { autoConnect: false });
      this.connectedBleDevice = bleDevice;

      console.log("Discovering services and characteristics...");
      await bleDevice.discoverAllServicesAndCharacteristics();

      if (device.type === "limitless") {
        console.log("Setting up Limitless RX notifications...");
        await this.setupLimitlessNotifications();
      }

      this.connectedDevice = device;
      this.connectionState = "connected";
      await this.saveConnectedDevice(device);
      this.notifyConnectionStateChange();
      console.log("Successfully connected to", device.name);

      if (device.type === "limitless") {
        await this.initializeLimitlessDevice();
      }

      return true;
    } catch (error) {
      console.error("BLE connection failed:", error);
      this.connectedBleDevice = null;
      this.connectionState = "disconnected";
      this.notifyConnectionStateChange();
      return false;
    }
  }

  private async setupLimitlessNotifications(): Promise<void> {
    if (!this.connectedBleDevice) {
      throw new Error("No connected device");
    }

    try {
      this.connectedBleDevice.monitorCharacteristicForService(
        LIMITLESS_SERVICE_UUID,
        LIMITLESS_RX_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("Notification error:", error);
            return;
          }

          if (characteristic?.value) {
            const base64Data = characteristic.value;
            const buffer = Buffer.from(base64Data, "base64");
            const dataArray = Array.from(buffer);
            console.log("Received Limitless data:", dataArray.length, "bytes");
            this.handleLimitlessNotification(dataArray);
          }
        }
      );
      console.log("Limitless RX notifications enabled");
    } catch (error) {
      console.error("Failed to setup notifications:", error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.connectionState === "disconnected") return;

    this.stopAudioStream();

    this.connectionState = "disconnecting";
    this.notifyConnectionStateChange();

    if (this.connectedBleDevice && !this.isMockMode) {
      try {
        await this.connectedBleDevice.cancelConnection();
        console.log("BLE device disconnected");
      } catch (error) {
        console.error("Error disconnecting BLE device:", error);
      }
      this.connectedBleDevice = null;
    }

    if (this.isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.connectedDevice = null;
    this.connectionState = "disconnected";
    this.isInitialized = false;
    this.rawDataBuffer = [];
    await this.saveConnectedDevice(null);
    this.notifyConnectionStateChange();
  }

  public simulateLimitlessData(data: number[]): void {
    if (this.connectedDevice?.type === "limitless") {
      this.handleLimitlessNotification(data);
    }
  }

  public clearBuffer(): void {
    this.rawDataBuffer = [];
  }

  public onAudioData(callback: (data: Uint8Array) => void): () => void {
    return this.onAudioChunk((chunk: AudioChunk) => {
      callback(chunk.data);
    });
  }

  public async startStreamingAudio(): Promise<boolean> {
    return this.startAudioStream();
  }

  public stopStreamingAudio(): void {
    this.stopAudioStream();
  }
}

export const bluetoothService = new BluetoothService();
