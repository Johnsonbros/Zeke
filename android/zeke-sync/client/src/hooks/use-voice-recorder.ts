import { useState, useCallback, useRef } from "react";

interface RecordingData {
  recordDataBase64: string;
  mimeType: string;
  msDuration?: number;
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
  const [isAvailable, setIsAvailable] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsAvailable(false);
        return false;
      }
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setIsAvailable(true);
      return result.state === 'granted';
    } catch (err) {
      console.log("Permission check not supported, will request on use");
      setIsAvailable(!!navigator.mediaDevices?.getUserMedia);
      return false;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsAvailable(false);
        setError("Voice recording is not available in this browser");
        return false;
      }

      setRecordingState("requesting_permission");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsAvailable(true);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setRecordingState("recording");
      setDuration(0);
      startDurationTimer();
      
      return true;
    } catch (err: any) {
      stopDurationTimer();
      console.error("Error starting recording:", err);
      if (err.name === 'NotAllowedError') {
        setError("Microphone permission denied");
      } else {
        setError(err.message || "Failed to start recording");
      }
      setRecordingState("idle");
      return false;
    }
  }, [startDurationTimer, stopDurationTimer]);

  const stopRecording = useCallback(async (): Promise<RecordingData | null> => {
    stopDurationTimer();
    
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) {
        setRecordingState("idle");
        return null;
      }

      setRecordingState("processing");

      return new Promise((resolve) => {
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          mediaRecorder.stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
          chunksRef.current = [];
          setRecordingState("idle");

          resolve({
            recordDataBase64: base64,
            mimeType: blob.type,
            msDuration: duration * 1000,
          });
        };

        mediaRecorder.stop();
      });
    } catch (err: any) {
      console.error("Error stopping recording:", err);
      setError(err.message || "Failed to stop recording");
      setRecordingState("idle");
      return null;
    }
  }, [stopDurationTimer, duration]);

  const cancelRecording = useCallback(async (): Promise<void> => {
    stopDurationTimer();
    
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder && recordingState === "recording") {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorder.stop();
      }
    } catch (err) {
      console.log("Recording canceled");
    }
    
    mediaRecorderRef.current = null;
    chunksRef.current = [];
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
