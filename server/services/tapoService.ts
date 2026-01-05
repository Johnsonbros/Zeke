import { cloudLogin } from "tp-link-tapo-connect";

const TAPO_EMAIL = process.env.TAPO_EMAIL;
const TAPO_PASSWORD = process.env.TAPO_PASSWORD;

export interface TapoDevice {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  deviceModel: string;
  deviceMac: string;
  deviceHwVer: string;
  fwVer: string;
  appServerUrl: string;
  deviceRegion: string;
  alias: string;
  status: number;
}

export interface TapoDeviceInfo {
  device_id: string;
  device_on: boolean;
  nickname: string;
  model: string;
  mac: string;
  fw_ver: string;
  ip?: string;
  on_time?: number;
  overheat_status?: string;
}

export interface TapoEnergyUsage {
  today_runtime: number;
  month_runtime: number;
  today_energy: number;
  month_energy: number;
  current_power: number;
  local_time?: string;
}

class TapoService {
  private cloudApi: any = null;

  private async ensureCloudLogin(): Promise<any> {
    if (!TAPO_EMAIL || !TAPO_PASSWORD) {
      throw new Error("TAPO_EMAIL and TAPO_PASSWORD environment variables are required");
    }

    if (!this.cloudApi) {
      console.log("[Tapo] Logging into TP-Link cloud...");
      this.cloudApi = await cloudLogin(TAPO_EMAIL, TAPO_PASSWORD);
      console.log("[Tapo] Cloud login successful");
    }

    return this.cloudApi;
  }

  async discoverDevices(): Promise<TapoDevice[]> {
    try {
      const cloudApi = await this.ensureCloudLogin();
      const devices = await cloudApi.listDevicesByType("SMART.TAPOPLUG");
      console.log(`[Tapo] Discovered ${devices.length} smart plug(s)`);
      return devices;
    } catch (error: any) {
      console.error("[Tapo] Failed to discover devices:", error.message);
      throw error;
    }
  }

  async getDeviceInfo(deviceIp: string): Promise<TapoDeviceInfo | null> {
    try {
      if (!TAPO_EMAIL || !TAPO_PASSWORD) {
        throw new Error("TAPO_EMAIL and TAPO_PASSWORD environment variables are required");
      }

      const { loginDeviceByIp } = await import("tp-link-tapo-connect");
      const device = await loginDeviceByIp(TAPO_EMAIL, TAPO_PASSWORD, deviceIp);
      const info = await device.getDeviceInfo();
      return info;
    } catch (error: any) {
      console.error(`[Tapo] Failed to get device info for ${deviceIp}:`, error.message);
      return null;
    }
  }

  async turnOn(deviceIp: string): Promise<boolean> {
    try {
      if (!TAPO_EMAIL || !TAPO_PASSWORD) {
        throw new Error("TAPO_EMAIL and TAPO_PASSWORD environment variables are required");
      }

      const { loginDeviceByIp } = await import("tp-link-tapo-connect");
      const device = await loginDeviceByIp(TAPO_EMAIL, TAPO_PASSWORD, deviceIp);
      await device.turnOn();
      console.log(`[Tapo] Device at ${deviceIp} turned ON`);
      return true;
    } catch (error: any) {
      console.error(`[Tapo] Failed to turn on device at ${deviceIp}:`, error.message);
      throw error;
    }
  }

  async turnOff(deviceIp: string): Promise<boolean> {
    try {
      if (!TAPO_EMAIL || !TAPO_PASSWORD) {
        throw new Error("TAPO_EMAIL and TAPO_PASSWORD environment variables are required");
      }

      const { loginDeviceByIp } = await import("tp-link-tapo-connect");
      const device = await loginDeviceByIp(TAPO_EMAIL, TAPO_PASSWORD, deviceIp);
      await device.turnOff();
      console.log(`[Tapo] Device at ${deviceIp} turned OFF`);
      return true;
    } catch (error: any) {
      console.error(`[Tapo] Failed to turn off device at ${deviceIp}:`, error.message);
      throw error;
    }
  }

  async toggle(deviceIp: string): Promise<boolean> {
    try {
      const info = await this.getDeviceInfo(deviceIp);
      if (!info) {
        throw new Error("Could not get device info");
      }

      if (info.device_on) {
        await this.turnOff(deviceIp);
        return false;
      } else {
        await this.turnOn(deviceIp);
        return true;
      }
    } catch (error: any) {
      console.error(`[Tapo] Failed to toggle device at ${deviceIp}:`, error.message);
      throw error;
    }
  }

  async getEnergyUsage(deviceIp: string): Promise<TapoEnergyUsage | null> {
    try {
      if (!TAPO_EMAIL || !TAPO_PASSWORD) {
        throw new Error("TAPO_EMAIL and TAPO_PASSWORD environment variables are required");
      }

      const { loginDeviceByIp } = await import("tp-link-tapo-connect");
      const device = await loginDeviceByIp(TAPO_EMAIL, TAPO_PASSWORD, deviceIp);
      const energy = await device.getEnergyUsage();
      return energy;
    } catch (error: any) {
      console.error(`[Tapo] Failed to get energy usage for ${deviceIp}:`, error.message);
      return null;
    }
  }

  isConfigured(): boolean {
    return !!(TAPO_EMAIL && TAPO_PASSWORD);
  }
}

export const tapoService = new TapoService();
