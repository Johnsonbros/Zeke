/**
 * Limitless Pendant LED Color Indicators
 * Reference: https://help.limitless.ai/en/articles/10542073-what-do-the-different-pendant-led-light-colors-mean
 */

export enum LimitlessLEDColor {
  WHITE = "white",
  ORANGE = "orange",
  GREEN = "green",
  WHITE_ORANGE_ALTERNATING = "white-orange-alternating",
  WHITE_GREEN_ALTERNATING = "white-green-alternating",
  BLUE = "blue",
  PURPLE = "purple",
  RED_SOLID = "red-solid",
  RED_BREATHING = "red-breathing",
  RED_BLINKING_3 = "red-blinking-3",
  RED_BLINKING_10 = "red-blinking-10",
  RED_BLINKING_4 = "red-blinking-4",
  RED_VERY_RAPID = "red-very-rapid",
}

export interface LimitlessLEDState {
  color: LimitlessLEDColor;
  status: string;
  description: string;
  isRecording: boolean;
  isCharging: boolean;
  isFullyCharged: boolean;
  isError: boolean;
  recoveryAction?: string;
}

export const LIMITLESS_LED_INDICATORS: Record<
  LimitlessLEDColor,
  LimitlessLEDState
> = {
  [LimitlessLEDColor.WHITE]: {
    color: LimitlessLEDColor.WHITE,
    status: "Recording",
    description: "Device is actively recording",
    isRecording: true,
    isCharging: false,
    isFullyCharged: false,
    isError: false,
  },
  [LimitlessLEDColor.ORANGE]: {
    color: LimitlessLEDColor.ORANGE,
    status: "Charging",
    description: "Device is charging",
    isRecording: false,
    isCharging: true,
    isFullyCharged: false,
    isError: false,
  },
  [LimitlessLEDColor.GREEN]: {
    color: LimitlessLEDColor.GREEN,
    status: "Fully Charged",
    description: "Device battery is fully charged",
    isRecording: false,
    isCharging: false,
    isFullyCharged: true,
    isError: false,
  },
  [LimitlessLEDColor.WHITE_ORANGE_ALTERNATING]: {
    color: LimitlessLEDColor.WHITE_ORANGE_ALTERNATING,
    status: "Recording & Charging",
    description: "Device is recording while charging",
    isRecording: true,
    isCharging: true,
    isFullyCharged: false,
    isError: false,
  },
  [LimitlessLEDColor.WHITE_GREEN_ALTERNATING]: {
    color: LimitlessLEDColor.WHITE_GREEN_ALTERNATING,
    status: "Recording & Fully Charged",
    description: "Device is recording with fully charged battery",
    isRecording: true,
    isCharging: false,
    isFullyCharged: true,
    isError: false,
  },
  [LimitlessLEDColor.BLUE]: {
    color: LimitlessLEDColor.BLUE,
    status: "Ready to Pair",
    description: "Device is ready for pairing",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: false,
  },
  [LimitlessLEDColor.PURPLE]: {
    color: LimitlessLEDColor.PURPLE,
    status: "Factory Reset",
    description: "Factory reset in progress",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
  },
  [LimitlessLEDColor.RED_SOLID]: {
    color: LimitlessLEDColor.RED_SOLID,
    status: "Recovery Mode",
    description:
      "Device is in recovery mode. Hold down the button until the red LED goes away.",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
    recoveryAction: "Hold button until LED turns off",
  },
  [LimitlessLEDColor.RED_BREATHING]: {
    color: LimitlessLEDColor.RED_BREATHING,
    status: "Microphone Error",
    description:
      "Issue initializing the microphones. Try restarting the device.",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
    recoveryAction: "Restart device in Limitless app or contact support",
  },
  [LimitlessLEDColor.RED_BLINKING_3]: {
    color: LimitlessLEDColor.RED_BLINKING_3,
    status: "Time Sync Error",
    description:
      "Device time needs to be synced to continue recording. May occur during device reset or long button press.",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
    recoveryAction:
      "Open Limitless app to reconnect and sync time. Try restarting recording.",
  },
  [LimitlessLEDColor.RED_BLINKING_10]: {
    color: LimitlessLEDColor.RED_BLINKING_10,
    status: "Memory Full",
    description: "Device ran out of memory during or before recording.",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
    recoveryAction:
      "Reopen Limitless app to reconnect and sync. Wait for device to fully catch up before restarting recording.",
  },
  [LimitlessLEDColor.RED_BLINKING_4]: {
    color: LimitlessLEDColor.RED_BLINKING_4,
    status: "Temperature Out of Range",
    description:
      "Device temperature is out of range. Avoid direct skin contact if device feels hot.",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
    recoveryAction:
      "Allow device to cool down. Contact support if issue persists.",
  },
  [LimitlessLEDColor.RED_VERY_RAPID]: {
    color: LimitlessLEDColor.RED_VERY_RAPID,
    status: "Device Initialization Error",
    description: "Error initializing device.",
    isRecording: false,
    isCharging: false,
    isFullyCharged: false,
    isError: true,
    recoveryAction:
      "Hold button until LED turns red (recovery mode), then hold again until LED turns off. Contact support if persists.",
  },
};

/**
 * Get LED indicator information by color
 */
export function getLimitlessLEDInfo(
  color: LimitlessLEDColor,
): LimitlessLEDState {
  return (
    LIMITLESS_LED_INDICATORS[color] ||
    LIMITLESS_LED_INDICATORS[LimitlessLEDColor.WHITE]
  );
}

/**
 * Check if LED color indicates an error state
 */
export function isLimitlessErrorState(color: LimitlessLEDColor): boolean {
  const info = LIMITLESS_LED_INDICATORS[color];
  return info?.isError ?? false;
}
