import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";

interface PitchPoint {
  time: number;
  midi: number | null;
  note: string | null;
  cents: number;
}

interface LivePitchMonitorProps {
  referenceNotes?: Array<{ time: number; midi: number; note: string }>;
}

const NOTE_COLORS: Record<string, string> = {
  "C": "#ef4444", "C#": "#f97316", "D": "#f59e0b", "D#": "#eab308",
  "E": "#84cc16", "F": "#22c55e", "F#": "#14b8a6", "G": "#06b6d4",
  "G#": "#3b82f6", "A": "#6366f1", "A#": "#8b5cf6", "B": "#a855f7",
};

// Lightweight pitch detection for real-time use (autocorrelation)
function detectPitchRT(buffer: Float32Array, sampleRate: number): number | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // Check if there's enough signal — use a low threshold for live monitoring
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return null; // Very quiet — skip

  // AMDF (Average Magnitude Difference Function) - more robust than raw autocorrelation
  // Search for the fundamental period in the range ~60Hz to ~1000Hz
  const minPeriod = Math.floor(sampleRate / 1000); // ~1000 Hz
  const maxPeriod = Math.floor(sampleRate / 60);   // ~60 Hz
  const searchEnd = Math.min(maxPeriod, MAX_SAMPLES);

  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;
  const correlations = new Float32Array(searchEnd + 1);

  for (let offset = minPeriod; offset <= searchEnd; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;
    correlations[offset] = correlation;

    if (correlation > 0.7 && correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
      foundGoodCorrelation = true;
    } else if (foundGoodCorrelation && correlation < bestCorrelation - 0.1) {
      // Past the peak — stop
      break;
    }
  }

  if (bestCorrelation > 0.5 && bestOffset > 0) {
    // Parabolic interpolation for sub-sample accuracy
    const prev = bestOffset > 0 ? correlations[bestOffset - 1] : correlations[bestOffset];
    const next = bestOffset < searchEnd ? correlations[bestOffset + 1] : correlations[bestOffset];
    const denom = 2 * (2 * correlations[bestOffset] - prev - next);
    const shift = denom !== 0 ? (next - prev) / denom : 0;
    return sampleRate / (bestOffset + shift);
  }
  return null;
}

function freqToMidiRT(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function midiToNoteNameRT(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteNum = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return noteNames[noteNum >= 0 ? noteNum : noteNum + 12] + octave;
}

function centsDeviationRT(freq: number): number {
  const midi = freqToMidiRT(freq);
  const nearestMidi = Math.round(midi);
  return (midi - nearestMidi) * 100;
}

export function LivePitchMonitor({ referenceNotes }: LivePitchMonitorProps) {
  const [isListening, setIsListening] = useState(false);
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [currentCents, setCurrentCents] = useState(0);
  const [currentMidi, setCurrentMidi] = useState<number | null>(null);
  const [pitchHistory, setPitchHistory] = useState<PitchPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const startTimeRef = useRef(0);
  const historyRef = useRef<PitchPoint[]>([]);
  const isListeningRef = useRef(false);

  const detectLoop = useCallback(() => {
    if (!isListeningRef.current) return;
    if (!analyserRef.current || !bufferRef.current || !audioCtxRef.current) {
      // Retry next frame if refs aren't ready yet
      animRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    analyserRef.current.getFloatTimeDomainData(bufferRef.current);
    const sampleRate = audioCtxRef.current.sampleRate;
    const freq = detectPitchRT(bufferRef.current, sampleRate);

    const time = (Date.now() - startTimeRef.current) / 1000;
    let point: PitchPoint;

    if (freq && freq > 60 && freq < 1500) {
      const midi = freqToMidiRT(freq);
      const note = midiToNoteNameRT(midi);
      const cents = centsDeviationRT(freq);
      point = { time, midi, note, cents };
      setCurrentNote(note);
      setCurrentCents(cents);
      setCurrentMidi(midi);
    } else {
      point = { time, midi: null, note: null, cents: 0 };
      // Don't immediately clear current note — keep it for a moment
      // so display doesn't flash on/off
    }

    historyRef.current.push(point);
    // Keep last 12 seconds of history
    const cutoff = time - 12;
    historyRef.current = historyRef.current.filter(p => p.time > cutoff);
    setPitchHistory([...historyRef.current]);

    animRef.current = requestAnimationFrame(detectLoop);
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      // Resume context if suspended (Chrome autoplay policy)
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize);
      startTimeRef.current = Date.now();
      historyRef.current = [];
      setPitchHistory([]);

      isListeningRef.current = true;
      setIsListening(true);
      // Start the detection loop
      animRef.current = requestAnimationFrame(detectLoop);
    } catch (err) {
      console.error("Microphone access failed:", err);
    }
  }, [detectLoop]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    bufferRef.current = null;
  }, []);

  // Draw the scrolling pitch canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Clear
    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "#1c1b19" : "#f9f8f5";
    ctx.fillRect(0, 0, w, h);

    if (pitchHistory.length === 0) {
      ctx.fillStyle = isDark ? "#797876" : "#7a7974";
      ctx.font = "13px 'General Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(isListening ? "Listening... sing something" : "Start singing to see your pitch here", w / 2, h / 2);
      return;
    }

    // Determine MIDI range from data
    const validMidis = pitchHistory.filter(p => p.midi !== null).map(p => p.midi!);
    if (validMidis.length === 0) {
      ctx.fillStyle = isDark ? "#797876" : "#7a7974";
      ctx.font = "13px 'General Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Listening... sing or hum something", w / 2, h / 2);
      return;
    }

    const minMidi = Math.floor(Math.min(...validMidis)) - 3;
    const maxMidi = Math.ceil(Math.max(...validMidis)) + 3;
    const midiRange = Math.max(maxMidi - minMidi, 8);

    // Time range: last 8 seconds
    const now = pitchHistory[pitchHistory.length - 1].time;
    const timeWindow = 8;
    const timeStart = now - timeWindow;

    const xScale = (t: number) => ((t - timeStart) / timeWindow) * w;
    const yScale = (midi: number) => h - ((midi - minMidi) / midiRange) * h;

    // Draw note grid lines
    ctx.strokeStyle = isDark ? "#2a2928" : "#e8e7e3";
    ctx.lineWidth = 1;
    ctx.font = "10px 'General Sans', sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = isDark ? "#5a5957" : "#bab9b4";

    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    for (let midi = Math.ceil(minMidi); midi <= Math.floor(maxMidi); midi++) {
      const y = yScale(midi);
      const noteName = noteNames[midi % 12];
      const isNatural = !noteName.includes("#");

      if (isNatural) {
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        const octave = Math.floor(midi / 12) - 1;
        ctx.fillText(`${noteName}${octave}`, 26, y + 3);
      }
    }

    // Draw reference notes if available
    if (referenceNotes && referenceNotes.length > 0) {
      ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.15)" : "rgba(1, 105, 111, 0.1)";
      for (const ref of referenceNotes) {
        if (ref.time >= timeStart && ref.time <= now) {
          const x = xScale(ref.time);
          const y = yScale(ref.midi);
          ctx.fillRect(x - 2, y - 4, 6, 8);
        }
      }
    }

    // Draw pitch points as connected line with dots
    const points = pitchHistory.filter(p => p.midi !== null && p.time >= timeStart);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p.midi) continue;

      const x = xScale(p.time);
      const y = yScale(p.midi);

      // Color based on cents deviation
      const absCents = Math.abs(p.cents);
      const color = absCents < 20
        ? (isDark ? "#6daa45" : "#437a22")  // green - on pitch
        : absCents < 40
          ? (isDark ? "#e8af34" : "#d19900")  // yellow - close
          : (isDark ? "#dd6974" : "#a13544"); // red - off

      // Draw line to previous point
      if (i > 0) {
        const prev = points[i - 1];
        if (prev.midi) {
          const x1 = xScale(prev.time);
          const y1 = yScale(prev.midi);
          // Only draw line if points are close in time (< 0.3s gap)
          if (p.time - prev.time < 0.3) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
      }

      // Draw dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw current note indicator on right edge
    if (currentMidi !== null) {
      const y = yScale(currentMidi);
      ctx.fillStyle = isDark ? "#cdccca" : "#28251d";
      ctx.font = "bold 14px 'General Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(currentNote || "", w - 40, y + 5);
    }
  }, [pitchHistory, currentMidi, currentNote, referenceNotes, isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const noteBase = currentNote?.replace(/\d+/, "").replace("#", "") || "";
  const noteColor = NOTE_COLORS[noteBase] || (document.documentElement.classList.contains("dark") ? "#cdccca" : "#28251d");

  return (
    <div className="space-y-4" data-testid="live-pitch-monitor">
      {/* Current note display */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isListening ? (
            <Button
              size="lg"
              variant="destructive"
              onClick={stopListening}
              className="gap-2 rounded-full px-6 py-5"
              data-testid="button-stop-monitor"
            >
              <Square className="w-4 h-4" />
              Stop
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={startListening}
              className="gap-2 rounded-full px-6 py-5"
              data-testid="button-start-monitor"
            >
              <Mic className="w-4 h-4" />
              Listen
            </Button>
          )}

          {isListening && currentNote && (
            <div className="text-center">
              <div
                className="text-3xl font-bold tabular-nums"
                style={{ color: noteColor }}
                data-testid="text-current-note"
              >
                {currentNote}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {currentCents > 0 ? `+${currentCents.toFixed(0)}` : currentCents.toFixed(0)} cents
              </div>
            </div>
          )}

          {isListening && !currentNote && (
            <div className="text-sm text-muted-foreground animate-pulse">
              Listening... sing or hum something
            </div>
          )}
        </div>

        {isListening && currentNote && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {Math.abs(currentCents) < 20 ? "On pitch" :
               Math.abs(currentCents) < 40 ? "Close" : 
               currentCents > 0 ? "Sharp" : "Flat"}
            </div>
            <div className="w-24 h-2 bg-muted rounded-full mt-1 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-100"
                style={{
                  width: `${Math.max(10, 100 - Math.abs(currentCents) * 2)}%`,
                  backgroundColor: Math.abs(currentCents) < 20 ? "#22c55e" : Math.abs(currentCents) < 40 ? "#eab308" : "#ef4444",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Scrolling pitch canvas */}
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border"
        style={{ height: 220 }}
        data-testid="canvas-pitch"
      />

      {!isListening && (
        <p className="text-xs text-muted-foreground text-center">
          Tap Listen to see your pitch in real-time as you sing. Green = on pitch, yellow = close, red = off.
        </p>
      )}
    </div>
  );
}
