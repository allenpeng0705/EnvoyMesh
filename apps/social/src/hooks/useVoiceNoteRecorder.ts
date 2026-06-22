import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceNoteRecorderPhase = "idle" | "active" | "sending";

export type VoiceNoteCapture = {
  blob: Blob;
  mimeType: string;
  transcription: string;
};

const DEFAULT_MAX_SECONDS = 120;

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: Array<{ isFinal: boolean; 0?: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useVoiceNoteRecorder(options?: {
  maxSeconds?: number;
  onError?: (code: "recordingUnsupported" | "micDenied") => void;
}) {
  const maxSeconds = options?.maxSeconds ?? DEFAULT_MAX_SECONDS;
  const onError = options?.onError;

  const [phase, setPhase] = useState<VoiceNoteRecorderPhase>("idle");
  const [isCapturing, setIsCapturing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const phaseRef = useRef(phase);
  const isCapturingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcriptionRef = useRef("");
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }, []);

  const releaseMedia = useCallback(() => {
    clearTimer();
    try {
      speechRef.current?.stop();
    } catch {
      /* ignore */
    }
    speechRef.current = null;
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
    transcriptionRef.current = "";
    isCapturingRef.current = false;
    setIsCapturing(false);
    setRecordingSeconds(0);
  }, [clearTimer]);

  const resetToIdle = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    releaseMedia();
    setPhase("idle");
  }, [releaseMedia]);

  const stopCapture = useCallback(async () => {
    if (!isCapturingRef.current) {
      return;
    }
    isCapturingRef.current = false;
    setIsCapturing(false);
    clearTimer();
    try {
      speechRef.current?.stop();
    } catch {
      /* ignore */
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorderStopRef.current = resolve;
        recorder.stop();
      });
    }
  }, [clearTimer]);

  const finalizeCapture = useCallback(async (): Promise<VoiceNoteCapture | null> => {
    await stopCapture();

    if (speechRef.current) {
      await new Promise<void>((resolve) => {
        const recognition = speechRef.current;
        if (!recognition) {
          resolve();
          return;
        }
        recognition.onend = () => resolve();
        waitMs(500).then(resolve);
      });
    } else {
      await waitMs(100);
    }

    const mimeType = mediaRecorderRef.current?.mimeType ?? "audio/webm";
    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    const transcription = transcriptionRef.current.trim();
    releaseMedia();

    if (blob.size === 0) {
      return null;
    }
    return { blob, mimeType, transcription };
  }, [releaseMedia, stopCapture]);

  const start = useCallback(async () => {
    if (phaseRef.current !== "idle") {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.("recordingUnsupported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      transcriptionRef.current = "";

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderStopRef.current?.();
        recorderStopRef.current = null;
      };

      const SpeechRecognitionCtor =
        (window as Window & { SpeechRecognition?: BrowserSpeechRecognitionCtor; webkitSpeechRecognition?: BrowserSpeechRecognitionCtor })
          .SpeechRecognition ??
        (window as Window & { webkitSpeechRecognition?: BrowserSpeechRecognitionCtor }).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";
        speechRef.current = recognition;
        recognition.onresult = (event) => {
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i]?.isFinal) {
              final += event.results[i]?.[0]?.transcript ?? "";
            }
          }
          if (final) {
            transcriptionRef.current = final;
          }
        };
        recognition.start();
      }

      recorder.start(100);
      isCapturingRef.current = true;
      setIsCapturing(true);
      setRecordingSeconds(0);
      setPhase("active");

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= maxSeconds - 1) {
            void stopCapture();
            return prev + 1;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      resetToIdle();
      onError?.("micDenied");
    }
  }, [maxSeconds, onError, resetToIdle, stopCapture]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      releaseMedia();
    };
  }, [releaseMedia]);

  const setSending = useCallback(() => setPhase("sending"), []);
  const setIdle = resetToIdle;

  return {
    phase,
    isCapturing,
    recordingSeconds,
    maxSeconds,
    start,
    cancel: resetToIdle,
    finalizeCapture,
    setSending,
    setIdle,
  };
}
