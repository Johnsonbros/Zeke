export type AnchorPosition = 
  | "bottom-right" 
  | "bottom-left" 
  | "top-right" 
  | "top-left"
  | "bottom-center"
  | "bottom-right-quarter"
  | "bottom-left-quarter";

export interface SnapPoint {
  anchor: AnchorPosition;
  x: number;
  y: number;
}

export function getSnapPoints(
  screenWidth: number,
  screenHeight: number,
  triggerSize: number,
  insets: { top: number; bottom: number; left: number; right: number },
  padding: number = 16
): SnapPoint[] {
  const halfTrigger = triggerSize / 2;
  const bottomY = screenHeight - insets.bottom - padding - halfTrigger;
  
  return [
    {
      anchor: "bottom-right",
      x: screenWidth - padding - halfTrigger,
      y: bottomY,
    },
    {
      anchor: "bottom-left",
      x: padding + halfTrigger,
      y: bottomY,
    },
    {
      anchor: "bottom-center",
      x: screenWidth / 2,
      y: bottomY,
    },
    {
      anchor: "bottom-right-quarter",
      x: screenWidth * 0.75,
      y: bottomY,
    },
    {
      anchor: "bottom-left-quarter",
      x: screenWidth * 0.25,
      y: bottomY,
    },
  ];
}

export function findClosestSnapPoint(
  x: number,
  y: number,
  snapPoints: SnapPoint[]
): SnapPoint {
  let closest = snapPoints[0];
  let minDist = Infinity;
  
  for (const point of snapPoints) {
    const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
    if (dist < minDist) {
      minDist = dist;
      closest = point;
    }
  }
  
  return closest;
}

export interface RingPosition {
  x: number;
  y: number;
  angle: number;
  ring: number;
  indexInRing: number;
}

export interface LayoutConfig {
  iconSize: number;
  iconContainerSize: number;
  baseRadius: number;
  ringSpacing: number;
  minIconSpacing: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  iconSize: 64,
  iconContainerSize: 80,
  baseRadius: 110,
  ringSpacing: 95,
  minIconSpacing: 20,
};

export function calculateSpiralPositions(
  itemCount: number,
  anchor: AnchorPosition,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): RingPosition[] {
  const positions: RingPosition[] = [];
  const iconFootprint = config.iconContainerSize + config.minIconSpacing;
  const sweepAngle = Math.PI / 2;
  const startRadius = config.baseRadius;
  const radialIncrement = iconFootprint;
  
  let placedCount = 0;
  let ring = 0;
  
  while (placedCount < itemCount) {
    const radius = startRadius + ring * radialIncrement;
    const minAngleStep = iconFootprint / radius;
    const maxIconsInRing = Math.max(1, Math.floor(sweepAngle / minAngleStep));
    const iconsToPlace = Math.min(maxIconsInRing, itemCount - placedCount);
    
    const usedSweep = iconsToPlace * minAngleStep;
    const startPadding = (sweepAngle - usedSweep) / 2;
    
    for (let i = 0; i < iconsToPlace; i++) {
      const localAngle = startPadding + (i + 0.5) * minAngleStep;
      
      let x: number;
      let y: number;
      let finalAngle: number;
      
      switch (anchor) {
        case "bottom-right":
          finalAngle = Math.PI / 2 + localAngle;
          x = -Math.abs(Math.cos(finalAngle) * radius);
          y = -Math.abs(Math.sin(finalAngle) * radius);
          break;
        case "bottom-left":
          finalAngle = localAngle;
          x = Math.abs(Math.cos(finalAngle) * radius);
          y = -Math.abs(Math.sin(finalAngle) * radius);
          break;
        case "bottom-center":
        case "bottom-right-quarter":
        case "bottom-left-quarter":
          finalAngle = Math.PI / 2 + localAngle;
          x = -Math.abs(Math.cos(finalAngle) * radius);
          y = -Math.abs(Math.sin(finalAngle) * radius);
          break;
        case "top-right":
          finalAngle = Math.PI + localAngle;
          x = -Math.abs(Math.cos(finalAngle) * radius);
          y = Math.abs(Math.sin(finalAngle) * radius);
          break;
        case "top-left":
          finalAngle = Math.PI * 1.5 + localAngle;
          x = Math.abs(Math.cos(finalAngle) * radius);
          y = Math.abs(Math.sin(finalAngle) * radius);
          break;
        default:
          finalAngle = Math.PI / 2 + localAngle;
          x = -Math.abs(Math.cos(finalAngle) * radius);
          y = -Math.abs(Math.sin(finalAngle) * radius);
      }
      
      positions.push({
        x,
        y,
        angle: finalAngle,
        ring,
        indexInRing: i,
      });
      placedCount++;
    }
    ring++;
  }
  
  return positions;
}

export function calculateRingDistribution(itemCount: number): number[] {
  const rings: number[] = [];
  let remaining = itemCount;
  let ringIndex = 0;
  
  while (remaining > 0) {
    const itemsInRing = 3 + ringIndex;
    rings.push(Math.min(itemsInRing, remaining));
    remaining -= itemsInRing;
    ringIndex++;
  }
  
  return rings;
}

export function calculateIconPositions(
  itemCount: number,
  anchor: AnchorPosition,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): RingPosition[] {
  const positions: RingPosition[] = [];
  const ringDistribution = calculateRingDistribution(itemCount);
  
  for (let ring = 0; ring < ringDistribution.length; ring++) {
    const itemsInRing = ringDistribution[ring];
    const ringRadius = config.baseRadius + ring * config.ringSpacing;
    
    for (let i = 0; i < itemsInRing; i++) {
      const t = (i + 0.5) / itemsInRing;
      let x: number;
      let y: number;
      let angle: number;
      
      switch (anchor) {
        case "bottom-right":
          angle = Math.PI - (Math.PI / 2) * t;
          x = -Math.abs(Math.cos(angle) * ringRadius);
          y = -Math.abs(Math.sin(angle) * ringRadius);
          break;
        case "bottom-left":
          angle = (Math.PI / 2) * t;
          x = Math.abs(Math.cos(angle) * ringRadius);
          y = -Math.abs(Math.sin(angle) * ringRadius);
          break;
        case "top-right":
          angle = Math.PI + (Math.PI / 2) * t;
          x = -Math.abs(Math.cos(angle) * ringRadius);
          y = Math.abs(Math.sin(angle) * ringRadius);
          break;
        case "top-left":
          angle = 2 * Math.PI - (Math.PI / 2) * t;
          x = Math.abs(Math.cos(angle) * ringRadius);
          y = Math.abs(Math.sin(angle) * ringRadius);
          break;
        default:
          angle = Math.PI - (Math.PI / 2) * t;
          x = -Math.abs(Math.cos(angle) * ringRadius);
          y = -Math.abs(Math.sin(angle) * ringRadius);
      }
      
      positions.push({
        x,
        y,
        angle,
        ring,
        indexInRing: i,
      });
    }
  }
  
  return positions;
}

export function getMaxRadius(
  itemCount: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): number {
  const ringDistribution = calculateRingDistribution(itemCount);
  const maxRing = ringDistribution.length;
  return config.baseRadius + (maxRing - 1) * config.ringSpacing;
}

export function getMenuSize(
  itemCount: number,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): number {
  const maxRadius = getMaxRadius(itemCount, config);
  return maxRadius + config.iconContainerSize / 2 + 20;
}

export function getClampedMenuSize(
  itemCount: number,
  anchor: AnchorPosition,
  screenWidth: number,
  screenHeight: number,
  triggerSize: number,
  insets: { top: number; bottom: number; left: number; right: number },
  padding: number = 16,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): { menuSize: number; scale: number } {
  const triggerHalf = triggerSize / 2;
  const baseMenuSize = getMenuSize(itemCount, config);
  
  let availableWidth: number;
  let availableHeight: number;
  
  switch (anchor) {
    case "bottom-right":
      availableWidth = screenWidth - padding - triggerHalf - insets.left - padding;
      availableHeight = screenHeight - insets.bottom - padding - triggerHalf - insets.top - padding;
      break;
    case "bottom-left":
      availableWidth = screenWidth - padding - triggerHalf - insets.right - padding;
      availableHeight = screenHeight - insets.bottom - padding - triggerHalf - insets.top - padding;
      break;
    case "top-right":
      availableWidth = screenWidth - padding - triggerHalf - insets.left - padding;
      availableHeight = screenHeight - insets.top - padding - triggerHalf - insets.bottom - padding;
      break;
    case "top-left":
      availableWidth = screenWidth - padding - triggerHalf - insets.right - padding;
      availableHeight = screenHeight - insets.top - padding - triggerHalf - insets.bottom - padding;
      break;
    default:
      availableWidth = screenWidth - 2 * padding - triggerHalf;
      availableHeight = screenHeight - insets.top - insets.bottom - 2 * padding - triggerHalf;
  }
  
  const maxAvailable = Math.max(Math.min(availableWidth, availableHeight), 0);
  const clampedSize = Math.min(baseMenuSize, maxAvailable);
  const scale = baseMenuSize > 0 ? Math.min(clampedSize / baseMenuSize, 1) : 1;
  
  return { menuSize: Math.max(clampedSize, 80), scale };
}

export function calculateScaledIconPositions(
  itemCount: number,
  anchor: AnchorPosition,
  scale: number = 1,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): RingPosition[] {
  const positions = calculateSpiralPositions(itemCount, anchor, config);
  
  if (scale >= 1) {
    return positions;
  }
  
  return positions.map(pos => ({
    ...pos,
    x: pos.x * scale,
    y: pos.y * scale,
  }));
}

export function getTriggerPositionStyle(
  anchor: AnchorPosition,
  triggerSize: number,
  insets: { top: number; bottom: number; left: number; right: number },
  padding: number = 16,
  screenWidth?: number
): { top?: number; bottom?: number; left?: number; right?: number } {
  const bottomPos = insets.bottom + padding;
  
  switch (anchor) {
    case "bottom-right":
      return { bottom: bottomPos, right: padding };
    case "bottom-left":
      return { bottom: bottomPos, left: padding };
    case "bottom-center":
      if (screenWidth) {
        return { bottom: bottomPos, left: (screenWidth - triggerSize) / 2 };
      }
      return { bottom: bottomPos, right: padding };
    case "bottom-right-quarter":
      if (screenWidth) {
        return { bottom: bottomPos, left: screenWidth * 0.75 - triggerSize / 2 };
      }
      return { bottom: bottomPos, right: padding };
    case "bottom-left-quarter":
      if (screenWidth) {
        return { bottom: bottomPos, left: screenWidth * 0.25 - triggerSize / 2 };
      }
      return { bottom: bottomPos, left: padding };
    case "top-right":
      return { top: insets.top + padding, right: padding };
    case "top-left":
      return { top: insets.top + padding, left: padding };
    default:
      return { bottom: bottomPos, right: padding };
  }
}

export function getMenuPositionStyle(
  anchor: AnchorPosition,
  _menuSize: number,
  triggerSize: number,
  insets: { top: number; bottom: number; left: number; right: number },
  padding: number = 16,
  screenWidth?: number
): { top?: number; bottom?: number; left?: number; right?: number } {
  const triggerHalf = triggerSize / 2;
  const bottomPos = insets.bottom + padding + triggerHalf;
  
  switch (anchor) {
    case "bottom-right":
      return {
        bottom: bottomPos,
        right: padding + triggerHalf,
      };
    case "bottom-left":
      return {
        bottom: bottomPos,
        left: padding + triggerHalf,
      };
    case "bottom-center":
      if (screenWidth) {
        return {
          bottom: bottomPos,
          left: screenWidth / 2,
        };
      }
      return {
        bottom: bottomPos,
        right: padding + triggerHalf,
      };
    case "bottom-right-quarter":
      if (screenWidth) {
        return {
          bottom: bottomPos,
          left: screenWidth * 0.75,
        };
      }
      return {
        bottom: bottomPos,
        right: padding + triggerHalf,
      };
    case "bottom-left-quarter":
      if (screenWidth) {
        return {
          bottom: bottomPos,
          left: screenWidth * 0.25,
        };
      }
      return {
        bottom: bottomPos,
        left: padding + triggerHalf,
      };
    case "top-right":
      return {
        top: insets.top + padding + triggerHalf,
        right: padding + triggerHalf,
      };
    case "top-left":
      return {
        top: insets.top + padding + triggerHalf,
        left: padding + triggerHalf,
      };
    default:
      return {
        bottom: bottomPos,
        right: padding + triggerHalf,
      };
  }
}

export function getIconAnchorStyle(
  anchor: AnchorPosition,
  menuSize: number,
  triggerSize: number
): { top?: number; bottom?: number; left?: number; right?: number } {
  switch (anchor) {
    case "bottom-right":
      return {
        right: 0,
        bottom: 0,
      };
    case "bottom-left":
      return {
        left: 0,
        bottom: 0,
      };
    case "bottom-center":
      return {
        left: 0,
        bottom: 0,
      };
    case "bottom-right-quarter":
      return {
        right: 0,
        bottom: 0,
      };
    case "bottom-left-quarter":
      return {
        left: 0,
        bottom: 0,
      };
    case "top-right":
      return {
        right: 0,
        top: 0,
      };
    case "top-left":
      return {
        left: 0,
        top: 0,
      };
    default:
      return {
        right: 0,
        bottom: 0,
      };
  }
}
