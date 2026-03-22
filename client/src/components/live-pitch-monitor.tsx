import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Play, RotateCcw } from "lucide-react";

interface PitchPoint {
  time: number;
  midi: number | null;
  note: string | null;
  cents: number;
}

interface TargetNote {
  time: number;
  midi: number | null;
  note: string | null;
}

interface LivePitchMonitorProps {
  /** Pre-analyzed target pitch data from the original song line */
  targetPitchData?: TargetNote[];
  /** Audio URL to play the line clip alongside singing */
  lineAudioUrl?: string;
  /** Start time in the audio file for this line */
  lineStartTime?: number;
  /** End time in the audio file for this line */
  lineEndTime?: number;
  /** Legacy: reference notes from user's own reference recording */
  referenceNotes?: Array<{ time: number; midi: number; note: string }>;
}

const NOTE_COLORS: Record<string, string> = {
  "C": "#ef4444", "C#": "#f97316", "D": "#f59e0b", "D#": "#eab308",
  "E": "#84cc16", "F": "#22c55e", "F#": "#14b8a6", "G": "#06b6d4",
  "G#": "#3b82f6", "A": "#6366f1", "A#": "#8b5cf6", "B": "#a855f7",
};

// Lightweight pitch detection for real-time use
function detectPitchRT(buffer: Float32Array, sampleRate: number): number | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return null;

  const minPeriod = Math.floor(sampleRate / 1000);
  const maxPeriod = Math.min(Math.floor(sampleRate / 60), MAX_SAMPLES);
  const correlations = new Float32Array(maxPeriod + 1);
  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGood = false;

  for (let offset = minPeriod; offset <= maxPeriod; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;
    correlations[offset] = correlation;
    if (correlation > 0.7 && correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
      foundGood = true;
    } else if (foundGood && correlation < bestCorrelation - 0.1) {
      break;
    }
  }

  if (bestCorrelation > 0.5 && bestOffset > 0) {
    const prev = bestOffset > minPeriod ? correlations[bestOffset - 1] : correlations[bestOffset];
    const next = bestOffset < maxPeriod ? correlations[bestOffset + 1] : correlations[bestOffset];
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
  return (midi - Math.round(midi)) * 100;
}

export function LivePitchMonitor({
  targetPitchData,
  lineAudioUrl,
  lineStartTime,
  lineEndTime,
  referenceNotes,
}: LivePitchMonitorProps) {
  const [mode, setMode] = useState<"idle" | "listening" | "guided">("idle");
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [currentCents, setCurrentCents] = useState(0);
  const [currentMidi, setCurrentMidi] = useState<number | null>(null);
  const [pitchHistory, setPitchHistory] = useState<PitchPoint[]>([]);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [guidedComplete, setGuidedComplete] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array | null>(null);
  const startTimeRef = useRef(0);
  const historyRef = useRef<PitchPoint[]>([]);
  const isActiveRef = useRef(false);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<number>(0);

  const hasLineAudio = !!(lineAudioUrl && lineStartTime !== undefined && lineEndTime !== undefined && targetPitchData && targetPitchData.length > 0);

  const stopEverything = useCallback(() => {
    isActiveRef.current = false;
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
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
    clearInterval(playbackIntervalRef.current);
  }, []);

  const startMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    streamRef.current = stream;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    analyserRef.current = analyser;
    bufferRef.current = new Float32Array(analyser.fftSize);
    return audioCtx;
  }, []);

  const detectLoop = useCallback(() => {
    if (!isActiveRef.current) return;
    if (!analyserRef.current || !bufferRef.current || !audioCtxRef.current) {
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
    }

    historyRef.current.push(point);
    const cutoff = time - 12;
    historyRef.current = historyRef.current.filter(p => p.time > cutoff);
    setPitchHistory([...historyRef.current]);

    animRef.current = requestAnimationFrame(detectLoop);
  }, []);

  // Free listen mode — just mic, no playback
  const startListening = useCallback(async () => {
    try {
      stopEverything();
      await startMic();
      startTimeRef.current = Date.now();
      historyRef.current = [];
      setPitchHistory([]);
      setCurrentNote(null);
      setGuidedComplete(false);
      isActiveRef.current = true;
      setMode("listening");
      animRef.current = requestAnimationFrame(detectLoop);
    } catch (err) {
      console.error("Mic access failed:", err);
    }
  }, [stopEverything, startMic, detectLoop]);

  // Guided mode — play line audio + mic at the same time
  const startGuided = useCallback(async () => {
    try {
      stopEverything();
      await startMic();
      startTimeRef.current = Date.now();
      historyRef.current = [];
      setPitchHistory([]);
      setCurrentNote(null);
      setGuidedComplete(false);
      setPlaybackTime(0);

      // Create and play the line audio
      const audio = new Audio(lineAudioUrl!);
      playbackAudioRef.current = audio;
      audio.currentTime = lineStartTime!;

      // Track playback time
      playbackIntervalRef.current = window.setInterval(() => {
        if (audio.currentTime >= lineEndTime!) {
          audio.pause();
          clearInterval(playbackIntervalRef.current);
          setGuidedComplete(true);
          // Keep listening a moment after playback ends for the user to finish
          setTimeout(() => {
            // Don't auto-stop — let them review
          }, 2000);
        }
        setPlaybackTime(audio.currentTime - lineStartTime!);
      }, 50);

      audio.play();
      isActiveRef.current = true;
      setMode("guided");
      animRef.current = requestAnimationFrame(detectLoop);
    } catch (err) {
      console.error("Guided mode failed:", err);
    }
  }, [stopEverything, startMic, detectLoop, lineAudioUrl, lineStartTime, lineEndTime]);

  const stop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setCurrentNote(null);
    setCurrentCents(0);
    setCurrentMidi(null);
  }, [stopEverything]);

  // Draw the pitch canvas
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

    const isDark = document.documentElement.classList.contains("dark");
    ctx.fillStyle = isDark ? "#1c1b19" : "#f9f8f5";
    ctx.fillRect(0, 0, w, h);

    // Determine if we have target pitch data to show
    const targetNotes = targetPitchData?.filter(n => n.midi !== null) || [];
    const isGuided = mode === "guided" && targetNotes.length > 0;

    if (pitchHistory.length === 0 && !isGuided) {
      ctx.fillStyle = isDark ? "#797876" : "#7a7974";
      ctx.font = "13px 'General Sans', sans-serif";
      ctx.textAlign = "center";
      if (mode === "idle") {
        ctx.fillText(hasLineAudio ? "Tap 'Sing Along' to practice with the song" : "Tap 'Listen' to see your pitch", w / 2, h / 2);
      } else {
        ctx.fillText("Listening... sing or hum something", w / 2, h / 2);
      }
      return;
    }

    // Compute MIDI range
    const allMidis: number[] = [];
    pitchHistory.filter(p => p.midi !== null).forEach(p => allMidis.push(p.midi!));
    if (isGuided) {
      targetNotes.forEach(n => { if (n.midi) allMidis.push(n.midi); });
    }
    if (referenceNotes) {
      referenceNotes.forEach(r => allMidis.push(r.midi));
    }

    if (allMidis.length === 0) {
      ctx.fillStyle = isDark ? "#797876" : "#7a7974";
      ctx.font = "13px 'General Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Listening... sing or hum", w / 2, h / 2);
      return;
    }

    const minMidi = Math.floor(Math.min(...allMidis)) - 3;
    const maxMidi = Math.ceil(Math.max(...allMidis)) + 3;
    const midiRange = Math.max(maxMidi - minMidi, 8);

    // Time window
    let timeWindow: number;
    let timeStart: number;
    let now: number;

    if (isGuided && lineStartTime !== undefined && lineEndTime !== undefined) {
      // In guided mode, show the entire line duration as the time window
      timeWindow = lineEndTime - lineStartTime + 1;
      timeStart = 0;
      now = timeWindow;
    } else {
      now = pitchHistory.length > 0 ? pitchHistory[pitchHistory.length - 1].time : 0;
      timeWindow = 8;
      timeStart = now - timeWindow;
    }

    const xScale = (t: number) => ((t - timeStart) / timeWindow) * (w - 40) + 35;
    const yScale = (midi: number) => h - 10 - ((midi - minMidi) / midiRange) * (h - 20);

    // Draw note grid
    ctx.strokeStyle = isDark ? "#2a2928" : "#e8e7e3";
    ctx.lineWidth = 1;
    ctx.font = "10px 'General Sans', sans-serif";
    ctx.textAlign = "right";
    ctx.fillStyle = isDark ? "#5a5957" : "#bab9b4";
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    for (let midi = Math.ceil(minMidi); midi <= Math.floor(maxMidi); midi++) {
      const y = yScale(midi);
      const noteName = noteNames[midi % 12];
      if (!noteName.includes("#")) {
        ctx.beginPath();
        ctx.moveTo(35, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        const octave = Math.floor(midi / 12) - 1;
        ctx.fillText(`${noteName}${octave}`, 30, y + 3);
      }
    }

    // Draw target pitch (from original song) as thick semi-transparent line
    if (isGuided && targetNotes.length > 0) {
      const validTargets = targetPitchData!.filter(n => n.midi !== null);
      ctx.strokeStyle = isDark ? "rgba(79, 152, 163, 0.5)" : "rgba(1, 105, 111, 0.35)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      let lastMidi: number | null = null;

      for (let i = 0; i < validTargets.length; i++) {
        const n = validTargets[i];
        if (!n.midi) continue;
        const x = xScale(n.time);
        const y = yScale(n.midi);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          // Only connect if close in time
          if (i > 0 && validTargets[i].time - validTargets[i - 1].time < 0.2) {
            ctx.lineTo(x, y);
          } else {
            ctx.moveTo(x, y);
          }
        }
        lastMidi = n.midi;
      }
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";

      // Label: "Target"
      ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.7)" : "rgba(1, 105, 111, 0.5)";
      ctx.font = "bold 10px 'General Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("TARGET", 38, 14);
    }

    // Draw reference notes (legacy)
    if (referenceNotes && referenceNotes.length > 0 && !isGuided) {
      ctx.fillStyle = isDark ? "rgba(79, 152, 163, 0.15)" : "rgba(1, 105, 111, 0.1)";
      for (const ref of referenceNotes) {
        if (ref.time >= timeStart && ref.time <= now) {
          const x = xScale(ref.time);
          const y = yScale(ref.midi);
          ctx.fillRect(x - 2, y - 4, 6, 8);
        }
      }
    }

    // Draw playback cursor in guided mode
    if (isGuided && playbackTime > 0) {
      const cursorX = xScale(playbackTime);
      ctx.strokeStyle = isDark ? "rgba(205, 204, 202, 0.3)" : "rgba(40, 37, 29, 0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw user pitch points
    const userPoints = pitchHistory.filter(p => p.midi !== null && p.time >= timeStart);
    for (let i = 0; i < userPoints.length; i++) {
      const p = userPoints[i];
      if (!p.midi) continue;
      const x = xScale(p.time);
      const y = yScale(p.midi);

      // Color: check deviation from target if in guided mode
      let color: string;
      if (isGuided && targetPitchData) {
        // Find closest target note in time
        const closest = targetPitchData
          .filter(t => t.midi !== null)
          .reduce((best, t) => {
            const d = Math.abs(t.time - p.time);
            return d < best.dist ? { midi: t.midi!, dist: d } : best;
          }, { midi: 0, dist: Infinity });

        if (closest.dist < 0.5) {
          const semitoneDiff = Math.abs(p.midi - closest.midi);
          color = semitoneDiff < 0.5
            ? (isDark ? "#6daa45" : "#437a22")  // green — nailed it
            : semitoneDiff < 1.5
              ? (isDark ? "#e8af34" : "#d19900")  // yellow — close
              : (isDark ? "#dd6974" : "#a13544"); // red — off
        } else {
          // No nearby target — use cents
          const absCents = Math.abs(p.cents);
          color = absCents < 20 ? (isDark ? "#6daa45" : "#437a22") : absCents < 40 ? (isDark ? "#e8af34" : "#d19900") : (isDark ? "#dd6974" : "#a13544");
        }
      } else {
        const absCents = Math.abs(p.cents);
        color = absCents < 20 ? (isDark ? "#6daa45" : "#437a22") : absCents < 40 ? (isDark ? "#e8af34" : "#d19900") : (isDark ? "#dd6974" : "#a13544");
      }

      // Line to previous
      if (i > 0 && userPoints[i - 1].midi) {
        const prev = userPoints[i - 1];
        if (p.time - prev.time < 0.3) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(xScale(prev.time), yScale(prev.midi!));
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Your voice label
    if (userPoints.length > 0) {
      ctx.fillStyle = isDark ? "rgba(205, 204, 202, 0.7)" : "rgba(40, 37, 29, 0.5)";
      ctx.font = "bold 10px 'General Sans', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("YOU", w - 5, 14);
    }

    // Current note on right edge
    if (currentMidi !== null) {
      const y = yScale(currentMidi);
      ctx.fillStyle = isDark ? "#cdccca" : "#28251d";
      ctx.font = "bold 14px 'General Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(currentNote || "", w - 40, y + 5);
    }
  }, [pitchHistory, currentMidi, currentNote, referenceNotes, targetPitchData, mode, playbackTime, lineStartTime, lineEndTime, hasLineAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
      if (playbackAudioRef.current) playbackAudioRef.current.pause();
      clearInterval(playbackIntervalRef.current);
    };
  }, []);

  const noteBase = currentNote?.replace(/\d+/, "").replace("#", "") || "";
  const noteColor = NOTE_COLORS[noteBase] || (document.documentElement.classList.contains("dark") ? "#cdccca" : "#28251d");
  const isActive = mode !== "idle";

  return (
    <div className="space-y-4" data-testid="live-pitch-monitor">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isActive ? (
            <Button
              size="lg"
              variant="destructive"
              onClick={stop}
              className="gap-2 rounded-full px-6 py-5"
              data-testid="button-stop-monitor"
            >
              <Square className="w-4 h-4" />
              Stop
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {hasLineAudio && (
                <Button
                  size="lg"
                  onClick={startGuided}
                  className="gap-2 rounded-full px-6 py-5"
                  data-testid="button-start-guided"
                >
                  <Play className="w-4 h-4" />
                  Sing Along
                </Button>
              )}
              <Button
                size="lg"
                variant={hasLineAudio ? "outline" : "default"}
                onClick={startListening}
                className="gap-2 rounded-full px-6 py-5"
                data-testid="button-start-monitor"
              >
                <Mic className="w-4 h-4" />
                {hasLineAudio ? "Free Sing" : "Listen"}
              </Button>
            </div>
          )}

          {isActive && currentNote && (
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums" style={{ color: noteColor }} data-testid="text-current-note">
                {currentNote}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {currentCents > 0 ? `+${currentCents.toFixed(0)}` : currentCents.toFixed(0)} cents
              </div>
            </div>
          )}

          {isActive && !currentNote && (
            <div className="text-sm text-muted-foreground animate-pulse">
              {mode === "guided" ? "Song is playing — sing along..." : "Listening... sing or hum"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isActive && currentNote && (
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
                  }}
                />
              </div>
            </div>
          )}

          {guidedComplete && (
            <Button size="sm" variant="outline" onClick={startGuided} className="gap-1" data-testid="button-retry-guided">
              <RotateCcw className="w-3 h-3" /> Again
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border"
        style={{ height: 240 }}
        data-testid="canvas-pitch"
      />

      {mode === "idle" && (
        <p className="text-xs text-muted-foreground text-center">
          {hasLineAudio
            ? "Sing Along plays the original line so you can hear and match the voice. Your pitch shows up in real-time against the target notes."
            : "Tap Listen to see your pitch in real-time. Green = on pitch, yellow = close, red = off."}
        </p>
      )}
    </div>
  );
}
