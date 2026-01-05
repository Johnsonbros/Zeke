import type OpenAI from "openai";
import type { ToolPermissions } from "../tools";
import { tapoService } from "../services/tapoService";

export const smartDeviceToolNames = [
  "control_smart_device",
  "get_smart_device_status",
  "list_smart_devices",
  "get_smart_device_energy",
];

export const smartDeviceToolPermissions: Record<string, (permissions: ToolPermissions) => boolean> = {
  control_smart_device: (p) => p.isAdmin,
  get_smart_device_status: (p) => p.isAdmin,
  list_smart_devices: (p) => p.isAdmin,
  get_smart_device_energy: (p) => p.isAdmin,
};

export const smartDeviceToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "control_smart_device",
      description: "Turn a smart plug (Tapo P110) on or off, or toggle its state. Use this when user asks to turn on/off a device, plug, or switch.",
      parameters: {
        type: "object",
        properties: {
          deviceIp: {
            type: "string",
            description: "The IP address of the smart device (e.g., '192.168.1.199')",
          },
          action: {
            type: "string",
            enum: ["on", "off", "toggle"],
            description: "The action to perform: 'on' to turn on, 'off' to turn off, 'toggle' to switch",
          },
          deviceName: {
            type: "string",
            description: "Optional friendly name for the device for better response",
          },
        },
        required: ["deviceIp", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_smart_device_status",
      description: "Get the current status of a smart plug including whether it's on or off. Use this when user asks about device status or if something is on.",
      parameters: {
        type: "object",
        properties: {
          deviceIp: {
            type: "string",
            description: "The IP address of the smart device",
          },
        },
        required: ["deviceIp"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_smart_devices",
      description: "List all smart plugs registered to the TP-Link cloud account. Use this to discover available devices.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_smart_device_energy",
      description: "Get energy usage statistics for a smart plug (P110 only). Shows current power draw and daily/monthly consumption.",
      parameters: {
        type: "object",
        properties: {
          deviceIp: {
            type: "string",
            description: "The IP address of the smart device",
          },
        },
        required: ["deviceIp"],
      },
    },
  },
];

export async function executeSmartDeviceTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  if (!tapoService.isConfigured()) {
    return JSON.stringify({
      success: false,
      error: "Smart device credentials not configured. Please set TAPO_EMAIL and TAPO_PASSWORD.",
    });
  }

  try {
    switch (toolName) {
      case "control_smart_device": {
        const deviceIp = args.deviceIp as string;
        const action = args.action as "on" | "off" | "toggle";
        const deviceName = (args.deviceName as string) || deviceIp;

        let newState: boolean;
        switch (action) {
          case "on":
            await tapoService.turnOn(deviceIp);
            newState = true;
            break;
          case "off":
            await tapoService.turnOff(deviceIp);
            newState = false;
            break;
          case "toggle":
            newState = await tapoService.toggle(deviceIp);
            break;
        }

        return JSON.stringify({
          success: true,
          deviceIp,
          deviceName,
          action,
          newState: newState ? "on" : "off",
          message: `${deviceName} is now ${newState ? "on" : "off"}`,
        });
      }

      case "get_smart_device_status": {
        const deviceIp = args.deviceIp as string;
        const info = await tapoService.getDeviceInfo(deviceIp);

        if (!info) {
          return JSON.stringify({
            success: false,
            error: `Could not get status for device at ${deviceIp}. Make sure the IP is correct and the device is reachable.`,
          });
        }

        return JSON.stringify({
          success: true,
          deviceIp,
          deviceName: info.nickname || deviceIp,
          isOn: info.device_on,
          model: info.model,
          onTime: info.on_time,
          mac: info.mac,
        });
      }

      case "list_smart_devices": {
        const devices = await tapoService.discoverDevices();

        return JSON.stringify({
          success: true,
          deviceCount: devices.length,
          devices: devices.map((d) => ({
            deviceId: d.deviceId,
            name: d.alias || d.deviceName,
            model: d.deviceModel,
            type: d.deviceType,
            region: d.deviceRegion,
            status: d.status === 1 ? "online" : "offline",
          })),
        });
      }

      case "get_smart_device_energy": {
        const deviceIp = args.deviceIp as string;
        const energy = await tapoService.getEnergyUsage(deviceIp);

        if (!energy) {
          return JSON.stringify({
            success: false,
            error: `Could not get energy data for device at ${deviceIp}. This feature is only available for P110 devices.`,
          });
        }

        return JSON.stringify({
          success: true,
          deviceIp,
          currentPower: `${energy.current_power} mW`,
          currentPowerWatts: (energy.current_power / 1000).toFixed(2) + " W",
          todayRuntime: `${Math.floor(energy.today_runtime / 60)} hours ${energy.today_runtime % 60} minutes`,
          todayEnergy: `${energy.today_energy} Wh`,
          monthRuntime: `${Math.floor(energy.month_runtime / 60)} hours ${energy.month_runtime % 60} minutes`,
          monthEnergy: `${energy.month_energy} Wh`,
        });
      }

      default:
        return null;
    }
  } catch (error: any) {
    console.error(`[SmartDevice] Tool ${toolName} failed:`, error.message);
    return JSON.stringify({
      success: false,
      error: error.message,
    });
  }
}
