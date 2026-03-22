// Pitch detection using autocorrelation method
// Returns frequency in Hz or null if no clear pitch detected

export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // Check if there's enough signal
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.005) return null; // Too quiet

  // Search for fundamental period in the voice range (~60Hz to ~1000Hz)
  const minPeriod = Math.floor(sampleRate / 1000);
  const maxPeriod = Math.min(Math.floor(sampleRate / 60), MAX_SAMPLES);
  const correlations = new Float32Array(maxPeriod + 1);

  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;

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
      foundGoodCorrelation = true;
    } else if (foundGoodCorrelation && correlation < bestCorrelation - 0.1) {
      break;
    }
  }

  if (bestCorrelation > 0.5 && bestOffset > 0) {
    // Parabolic interpolation for sub-sample accuracy
    const prev = bestOffset > minPeriod ? correlations[bestOffset - 1] : correlations[bestOffset];
    const next = bestOffset < maxPeriod ? correlations[bestOffset + 1] : correlations[bestOffset];
    const denom = 2 * (2 * correlations[bestOffset] - prev - next);
    const shift = denom !== 0 ? (next - prev) / denom : 0;
    return sampleRate / (bestOffset + shift);
  }
  return null;
}

// Convert frequency to MIDI note number
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

// Convert MIDI note number to note name
export function midiToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteNum = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return noteNames[noteNum >= 0 ? noteNum : noteNum + 12] + octave;
}

// Calculate cents deviation from nearest note
export function centsDeviation(freq: number): number {
  const midi = freqToMidi(freq);
  const nearestMidi = Math.round(midi);
  return (midi - nearestMidi) * 100;
}

// Analyze RMS loudness over time windows
export function analyzeLoudness(buffer: Float32Array, sampleRate: number, windowMs: number = 50): Array<{ time: number; db: number }> {
  const windowSamples = Math.floor((sampleRate * windowMs) / 1000);
  const results: Array<{ time: number; db: number }> = [];

  for (let i = 0; i < buffer.length - windowSamples; i += windowSamples) {
    let rms = 0;
    for (let j = i; j < i + windowSamples; j++) {
      rms += buffer[j] * buffer[j];
    }
    rms = Math.sqrt(rms / windowSamples);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    results.push({
      time: i / sampleRate,
      db: Math.max(-60, db), // Floor at -60dB
    });
  }
  return results;
}

// Analyze pitch over time
export function analyzePitch(buffer: Float32Array, sampleRate: number, windowMs: number = 50): Array<{ time: number; freq: number | null; midi: number | null; note: string | null }> {
  const windowSamples = Math.floor((sampleRate * windowMs) / 1000);
  const results: Array<{ time: number; freq: number | null; midi: number | null; note: string | null }> = [];

  for (let i = 0; i < buffer.length - windowSamples * 2; i += windowSamples) {
    const slice = buffer.slice(i, i + windowSamples * 2);
    const freq = detectPitch(slice, sampleRate);
    if (freq && freq > 60 && freq < 2000) {
      const midi = freqToMidi(freq);
      results.push({
        time: i / sampleRate,
        freq,
        midi,
        note: midiToNoteName(midi),
      });
    } else {
      results.push({ time: i / sampleRate, freq: null, midi: null, note: null });
    }
  }
  return results;
}

// Generate drill suggestions based on metrics
export interface DrillSuggestion {
  type: "pitch_loop" | "energy_sustain" | "breath_control" | "warmup";
  title: string;
  description: string;
  targetWords?: string;
}

export function suggestDrills(
  pitchData: Array<{ time: number; freq: number | null; deviation?: number }>,
  loudnessData: Array<{ time: number; db: number }>,
  lineText: string
): DrillSuggestion[] {
  const suggestions: DrillSuggestion[] = [];

  // Check for pitch issues
  const pitchDeviations = pitchData
    .filter(p => p.deviation !== undefined)
    .map(p => Math.abs(p.deviation!));
  const avgDeviation = pitchDeviations.length > 0
    ? pitchDeviations.reduce((a, b) => a + b, 0) / pitchDeviations.length
    : 0;

  if (avgDeviation > 25) {
    // Find the worst section
    const words = lineText.split(' ');
    const segmentSize = Math.ceil(pitchData.length / Math.max(words.length, 1));
    let worstSegmentIdx = 0;
    let worstDeviation = 0;

    for (let i = 0; i < words.length; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize, pitchData.length);
      const segDeviations = pitchData
        .slice(start, end)
        .filter(p => p.deviation !== undefined)
        .map(p => Math.abs(p.deviation!));
      const segAvg = segDeviations.length > 0
        ? segDeviations.reduce((a, b) => a + b, 0) / segDeviations.length
        : 0;
      if (segAvg > worstDeviation) {
        worstDeviation = segAvg;
        worstSegmentIdx = i;
      }
    }

    const targetWord = words[worstSegmentIdx] || words[0];
    suggestions.push({
      type: "pitch_loop",
      title: "Note target practice",
      description: `The word "${targetWord}" is drifting from the target note. Try singing just that word 5 times in a row, matching the reference pitch each time. Start slow and gentle.`,
      targetWords: targetWord,
    });
  }

  // Check for energy dropoff
  if (loudnessData.length > 3) {
    const thirdLen = Math.floor(loudnessData.length / 3);
    const firstThirdAvg = loudnessData.slice(0, thirdLen).reduce((a, b) => a + b.db, 0) / thirdLen;
    const lastThirdAvg = loudnessData.slice(-thirdLen).reduce((a, b) => a + b.db, 0) / thirdLen;
    const dropoff = firstThirdAvg - lastThirdAvg;

    if (dropoff > 6) {
      suggestions.push({
        type: "energy_sustain",
        title: "Steady energy practice",
        description: `Your voice gets quieter toward the end of the line. Try singing just the last few words first, nice and strong. Then gradually add more words from the beginning until you can hold your energy through the whole line.`,
      });
    }
  }

  // Check for breath cutoffs (sudden drops in loudness)
  let cutoffs = 0;
  for (let i = 1; i < loudnessData.length; i++) {
    if (loudnessData[i].db - loudnessData[i - 1].db < -12) {
      cutoffs++;
    }
  }

  if (cutoffs >= 2) {
    suggestions.push({
      type: "breath_control",
      title: "Breath support exercise",
      description: `It sounds like you might be running low on air partway through. Before your next take, try this: breathe in low (feel your belly expand), then hiss out slowly for 10 seconds. Do that twice, then sing the line again.`,
    });
  }

  // If no issues found, suggest a warmup
  if (suggestions.length === 0) {
    suggestions.push({
      type: "warmup",
      title: "Sounding good — keep it up",
      description: `Your pitch and energy are looking solid. Try recording 3 more takes and see if you can keep this consistency. Focus on making it feel easy and natural.`,
    });
  }

  return suggestions;
}
