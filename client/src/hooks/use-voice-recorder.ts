import { useState, useCallback, useRef } from "react";

// Type definitions for capacitor-voice-recorder
interface RecordingData {
  recordDataBase64: string;
  mimeType: string;
  msDuration?: number;
}

interface VoiceRecorderResult {
  value: RecordingData;
}

interface VoiceRecorderPermissionResult {
  value: boolean;
}

// We'll dynamically import VoiceRecorder to handle cases where it's not available (web without Capacitor)
let VoiceRecorder: any = null;

// Try to import the VoiceRecorder plugin
async function getVoiceRecorder() {
  if (VoiceRecorder) return VoiceRecorder;
  
  try {
    const module = await import("capacitor-voice-recorder");
    VoiceRecorder = module.VoiceRecorder;
    return VoiceRecorder;
  } catch (error) {
    console.log("VoiceRecorder plugin not available (web mode without Capacitor)");
    return null;
  }
}

export type RecordingState = "idle" | "requesting_permission" | "recording" | "processing";

export interface VoiceRecorderHook {
  recordingState: RecordingState;
  isRecording: boolean;
  isAvailable: boolean;
  duration: number;
  error: string | null;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<RecordingData | null>;
  cancelRecording: () => Promise<void>;
  checkPermission: () => Promise<boolean>;
}

export function useVoiceRecorder(): VoiceRecorderHook {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  
  const durationIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const startDurationTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    durationIntervalRef.current = window.setInterval(() => {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 100);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    try {
      const recorder = await getVoiceRecorder();
      if (!recorder) {
        setIsAvailable(false);
        return false;
      }

      const result: VoiceRecorderPermissionResult = await recorder.hasAudioRecordingPermission();
      return result.value;
    } catch (err) {
      console.error("Error checking audio permission:", err);
      setIsAvailable(false);
      return false;
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const recorder = await getVoiceRecorder();
      if (!recorder) {
        setIsAvailable(false);
        setError("Voice recording is not available on this device");
        return false;
      }

      setRecordingState("requesting_permission");
      const result: VoiceRecorderPermissionResult = await recorder.requestAudioRecordingPermission();
      
      if (!result.value) {
        setError("Microphone permission denied");
        setRecordingState("idle");
        return false;
      }

      return true;
    } catch (err: any) {
      console.error("Error requesting audio permission:", err);
      setError(err.message || "Failed to request microphone permission");
      setRecordingState("idle");
      return false;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    
    try {
      const recorder = await getVoiceRecorder();
      if (!recorder) {
        setIsAvailable(false);
        setError("Voice recording is not available on this device");
        return false;
      }

      // Check and request permission if needed
      const hasPermission = await checkPermission();
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) return false;
      }

      // Start recording
      await recorder.startRecording();
      setRecordingState("recording");
      setDuration(0);
      startDurationTimer();
      
      return true;
    } catch (err: any) {
      stopDurationTimer();
      console.error("Error starting recording:", err);
      setError(err.message || "Failed to start recording");
      setRecordingState("idle");
      return false;
    }
  }, [checkPermission, requestPermission, startDurationTimer, stopDurationTimer]);

  const stopRecording = useCallback(async (): Promise<RecordingData | null> => {
    stopDurationTimer();
    
    try {
      const recorder = await getVoiceRecorder();
      if (!recorder) {
        setRecordingState("idle");
        return null;
      }

      setRecordingState("processing");
      const result: VoiceRecorderResult = await recorder.stopRecording();
      setRecordingState("idle");
      
      return result.value;
    } catch (err: any) {
      console.error("Error stopping recording:", err);
      setError(err.message || "Failed to stop recording");
      setRecordingState("idle");
      return null;
    }
  }, [stopDurationTimer]);

  const cancelRecording = useCallback(async (): Promise<void> => {
    stopDurationTimer();
    
    try {
      const recorder = await getVoiceRecorder();
      if (recorder && recordingState === "recording") {
        await recorder.stopRecording();
      }
    } catch (err) {
      // Ignore errors when canceling
      console.log("Recording canceled");
    }
    
    setRecordingState("idle");
    setDuration(0);
    setError(null);
  }, [recordingState, stopDurationTimer]);

  return {
    recordingState,
    isRecording: recordingState === "recording",
    isAvailable,
    duration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    checkPermission,
  };
}
