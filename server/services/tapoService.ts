import { cloudLogin, loginDeviceByIp } from "tp-link-tapo-connect";

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
  private cloudLoginPromise: Promise<any> | null = null;

  private getCredentials(): { email: string; password: string } {
    const email = process.env.TAPO_EMAIL;
    const password = process.env.TAPO_PASSWORD;
    
    if (!email || !password) {
      throw new Error("TAPO_EMAIL and TAPO_PASSWORD environment variables are required");
    }
    
    return { email, password };
  }

  private async ensureCloudLogin(): Promise<any> {
    const { email, password } = this.getCredentials();

    if (this.cloudApi) {
      return this.cloudApi;
    }

    if (this.cloudLoginPromise) {
      return this.cloudLoginPromise;
    }

    this.cloudLoginPromise = (async () => {
      try {
        console.log("[Tapo] Logging into TP-Link cloud...");
        this.cloudApi = await cloudLogin(email, password);
        console.log("[Tapo] Cloud login successful");
        return this.cloudApi;
      } catch (error) {
        this.cloudApi = null;
        this.cloudLoginPromise = null;
        throw error;
      } finally {
        this.cloudLoginPromise = null;
      }
    })();

    return this.cloudLoginPromise;
  }

  resetCloudSession(): void {
    this.cloudApi = null;
    this.cloudLoginPromise = null;
    console.log("[Tapo] Cloud session reset");
  }

  async discoverDevices(): Promise<TapoDevice[]> {
    try {
      const cloudApi = await this.ensureCloudLogin();
      const devices = await cloudApi.listDevicesByType("SMART.TAPOPLUG");
      console.log(`[Tapo] Discovered ${devices.length} smart plug(s)`);
      return devices;
    } catch (error: any) {
      console.error("[Tapo] Failed to discover devices:", error.message);
      this.resetCloudSession();
      throw error;
    }
  }

  async getDeviceInfo(deviceIp: string): Promise<TapoDeviceInfo | null> {
    try {
      const { email, password } = this.getCredentials();
      const device = await loginDeviceByIp(email, password, deviceIp);
      const info = await device.getDeviceInfo();
      return info;
    } catch (error: any) {
      console.error(`[Tapo] Failed to get device info for ${deviceIp}:`, error.message);
      return null;
    }
  }

  async turnOn(deviceIp: string): Promise<boolean> {
    try {
      const { email, password } = this.getCredentials();
      const device = await loginDeviceByIp(email, password, deviceIp);
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
      const { email, password } = this.getCredentials();
      const device = await loginDeviceByIp(email, password, deviceIp);
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
      const { email, password } = this.getCredentials();
      const device = await loginDeviceByIp(email, password, deviceIp);
      const energy = await device.getEnergyUsage();
      return energy;
    } catch (error: any) {
      console.error(`[Tapo] Failed to get energy usage for ${deviceIp}:`, error.message);
      return null;
    }
  }

  isConfigured(): boolean {
    try {
      this.getCredentials();
      return true;
    } catch {
      return false;
    }
  }
}

export const tapoService = new TapoService();
