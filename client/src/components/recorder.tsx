import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecorderProps {
  onRecordingComplete: (audioBlob: Blob, audioBuffer: AudioBuffer) => void;
  disabled?: boolean;
}

export function Recorder({ onRecordingComplete, disabled }: RecorderProps) {
  const [state, setState] = useState<"idle" | "countdown" | "recording" | "processing">("idle");
  const [countdown, setCountdown] = useState(3);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    mediaRecorder.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startCountdown = useCallback(async () => {
    setState("countdown");
    setCountdown(3);

    // Get mic permission early
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let count = 3;
    const countInterval = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(countInterval);
        startRecording(stream);
      }
    }, 800);
  }, []);

  const startRecording = useCallback((stream: MediaStream) => {
    setState("recording");
    setDuration(0);
    chunks.current = [];
    startTimeRef.current = Date.now();

    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorder.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };

    recorder.onstop = async () => {
      setState("processing");
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(chunks.current, { type: "audio/webm" });

      // Decode to AudioBuffer for analysis
      if (!audioContext.current) {
        audioContext.current = new AudioContext();
      }
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.current.decodeAudioData(arrayBuffer);
        onRecordingComplete(blob, audioBuffer);
      } catch (err) {
        console.error("Failed to decode audio:", err);
      }
      setState("idle");
    };

    recorder.start(100); // collect every 100ms

    timerRef.current = window.setInterval(() => {
      setDuration((Date.now() - startTimeRef.current) / 1000);
    }, 100);
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
    }
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center gap-4" data-testid="recorder">
      {state === "countdown" && (
        <div className="text-4xl font-bold text-primary animate-pulse" data-testid="text-countdown">
          {countdown}
        </div>
      )}

      {state === "recording" && (
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-lg font-medium tabular-nums" data-testid="text-duration">
            {formatDuration(duration)}
          </span>
        </div>
      )}

      {state === "processing" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analyzing your recording...</span>
        </div>
      )}

      <div className="flex gap-3">
        {state === "idle" && (
          <Button
            size="lg"
            onClick={startCountdown}
            disabled={disabled}
            className="gap-2 rounded-full px-8 py-6 text-base"
            data-testid="button-record"
          >
            <Mic className="w-5 h-5" />
            Record
          </Button>
        )}

        {state === "recording" && (
          <Button
            size="lg"
            variant="destructive"
            onClick={stopRecording}
            className="gap-2 rounded-full px-8 py-6 text-base"
            data-testid="button-stop"
          >
            <Square className="w-4 h-4" />
            Stop
          </Button>
        )}
      </div>

      {state === "idle" && (
        <p className="text-xs text-muted-foreground">
          Tap Record, wait for the count-in, then sing your line
        </p>
      )}
    </div>
  );
}
