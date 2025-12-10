import { useEffect, useRef, useCallback } from "react";

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  edgeThreshold?: number;
  enabled?: boolean;
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
  edgeThreshold = 30,
  enabled = true,
}: SwipeGestureOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    touchStartTime.current = Date.now();
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStart.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    const elapsed = Date.now() - touchStartTime.current;
    const startX = touchStart.current.x;

    if (elapsed > 500) {
      touchStart.current = null;
      return;
    }

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY && absX > threshold) {
      if (deltaX > 0 && startX < edgeThreshold && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    } else if (absY > absX && absY > threshold) {
      if (deltaY > 0 && onSwipeDown) {
        onSwipeDown();
      } else if (deltaY < 0 && onSwipeUp) {
        onSwipeUp();
      }
    }

    touchStart.current = null;
  }, [enabled, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, edgeThreshold]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);
}

export function useSidebarSwipe({
  onOpen,
  onClose,
  isOpen,
  edgeWidth = 25,
  threshold = 60,
  enabled = true,
}: {
  onOpen?: () => void;
  onClose?: () => void;
  isOpen?: boolean;
  edgeWidth?: number;
  threshold?: number;
  enabled?: boolean;
}) {
  const touchStart = useRef<{ x: number; y: number; fromLeftEdge: boolean } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    const fromLeftEdge = touch.clientX < edgeWidth;
    touchStart.current = { x: touch.clientX, y: touch.clientY, fromLeftEdge };
  }, [enabled, edgeWidth]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStart.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = Math.abs(touch.clientY - touchStart.current.y);

    if (deltaY > Math.abs(deltaX) * 0.8) {
      touchStart.current = null;
      return;
    }

    if (touchStart.current.fromLeftEdge && deltaX > threshold && !isOpen && onOpen) {
      onOpen();
    } else if (deltaX < -threshold && isOpen && onClose) {
      onClose();
    }

    touchStart.current = null;
  }, [enabled, threshold, isOpen, onOpen, onClose]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);
}

export function useEdgeSwipe({
  onSwipeFromLeftEdge,
  onSwipeFromRightEdge,
  edgeWidth = 20,
  threshold = 80,
  enabled = true,
}: {
  onSwipeFromLeftEdge?: () => void;
  onSwipeFromRightEdge?: () => void;
  edgeWidth?: number;
  threshold?: number;
  enabled?: boolean;
}) {
  const touchStart = useRef<{ x: number; y: number; isEdge: "left" | "right" | null } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    const screenWidth = window.innerWidth;
    
    let isEdge: "left" | "right" | null = null;
    if (touch.clientX < edgeWidth) {
      isEdge = "left";
    } else if (touch.clientX > screenWidth - edgeWidth) {
      isEdge = "right";
    }

    touchStart.current = { x: touch.clientX, y: touch.clientY, isEdge };
  }, [enabled, edgeWidth]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStart.current || !touchStart.current.isEdge) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = Math.abs(touch.clientY - touchStart.current.y);

    if (deltaY > Math.abs(deltaX)) {
      touchStart.current = null;
      return;
    }

    if (touchStart.current.isEdge === "left" && deltaX > threshold && onSwipeFromLeftEdge) {
      onSwipeFromLeftEdge();
    } else if (touchStart.current.isEdge === "right" && deltaX < -threshold && onSwipeFromRightEdge) {
      onSwipeFromRightEdge();
    }

    touchStart.current = null;
  }, [enabled, threshold, onSwipeFromLeftEdge, onSwipeFromRightEdge]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchEnd]);
}
