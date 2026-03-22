import { useMemo } from "react";

interface PitchPoint {
  time: number;
  midi: number | null;
  note: string | null;
}

interface PitchChartProps {
  pitchData: PitchPoint[];
  referenceData?: PitchPoint[];
  width?: number;
  height?: number;
}

export function PitchChart({ pitchData, referenceData, width = 600, height = 200 }: PitchChartProps) {
  const { userPath, refPath, yMin, yMax, timeMax } = useMemo(() => {
    const allMidi = [
      ...pitchData.filter(p => p.midi !== null).map(p => p.midi!),
      ...(referenceData?.filter(p => p.midi !== null).map(p => p.midi!) || []),
    ];

    if (allMidi.length === 0) return { userPath: "", refPath: "", yMin: 48, yMax: 72, timeMax: 1 };

    const yMin = Math.floor(Math.min(...allMidi)) - 2;
    const yMax = Math.ceil(Math.max(...allMidi)) + 2;
    const timeMax = Math.max(
      pitchData.length > 0 ? pitchData[pitchData.length - 1].time : 0,
      referenceData && referenceData.length > 0 ? referenceData[referenceData.length - 1].time : 0
    ) || 1;

    const toX = (t: number) => (t / timeMax) * (width - 40) + 20;
    const toY = (m: number) => height - 20 - ((m - yMin) / (yMax - yMin)) * (height - 40);

    const buildPath = (data: PitchPoint[]) => {
      const validPoints = data.filter(p => p.midi !== null);
      if (validPoints.length === 0) return "";
      return validPoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.time).toFixed(1)} ${toY(p.midi!).toFixed(1)}`)
        .join(" ");
    };

    return {
      userPath: buildPath(pitchData),
      refPath: referenceData ? buildPath(referenceData) : "",
      yMin,
      yMax,
      timeMax,
    };
  }, [pitchData, referenceData, width, height]);

  const toX = (t: number) => (t / timeMax) * (width - 40) + 20;
  const toY = (m: number) => height - 20 - ((m - yMin) / (yMax - yMin)) * (height - 40);

  // Generate color segments for the user path
  const segments = useMemo(() => {
    if (!referenceData || referenceData.length === 0) return [];
    const result: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];

    const validUser = pitchData.filter(p => p.midi !== null);
    for (let i = 1; i < validUser.length; i++) {
      const p1 = validUser[i - 1];
      const p2 = validUser[i];

      // Find closest reference point
      const closest = referenceData
        .filter(r => r.midi !== null)
        .reduce((best, r) => {
          const dist = Math.abs(r.time - p2.time);
          return dist < best.dist ? { midi: r.midi!, dist } : best;
        }, { midi: 0, dist: Infinity });

      const deviation = closest.dist < Infinity ? Math.abs(p2.midi! - closest.midi) : 0;
      // Within ~50 cents = green, otherwise red
      const color = deviation < 0.5 ? "hsl(160, 50%, 42%)" : "hsl(0, 72%, 48%)";

      result.push({
        x1: toX(p1.time),
        y1: toY(p1.midi!),
        x2: toX(p2.time),
        y2: toY(p2.midi!),
        color,
      });
    }
    return result;
  }, [pitchData, referenceData, yMin, yMax, timeMax, width, height]);

  // Note grid lines
  const gridLines = useMemo(() => {
    const lines = [];
    for (let midi = Math.ceil(yMin); midi <= Math.floor(yMax); midi++) {
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const name = noteNames[midi % 12] + (Math.floor(midi / 12) - 1);
      lines.push({ midi, y: toY(midi), name, isC: midi % 12 === 0 });
    }
    return lines;
  }, [yMin, yMax, height]);

  return (
    <div className="w-full" data-testid="pitch-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-md bg-card border border-border">
        {/* Grid lines */}
        {gridLines.map((line) => (
          <g key={line.midi}>
            <line
              x1={20}
              y1={line.y}
              x2={width - 20}
              y2={line.y}
              stroke={line.isC ? "hsl(var(--border))" : "hsl(var(--border) / 0.4)"}
              strokeWidth={line.isC ? 1 : 0.5}
              strokeDasharray={line.isC ? undefined : "2 4"}
            />
            <text
              x={16}
              y={line.y + 3}
              textAnchor="end"
              fontSize="9"
              fill="hsl(var(--muted-foreground))"
            >
              {line.name}
            </text>
          </g>
        ))}

        {/* Reference melody */}
        {refPath && (
          <path
            d={refPath}
            fill="none"
            stroke="hsl(var(--muted-foreground) / 0.4)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}

        {/* User pitch — colored segments if reference exists */}
        {segments.length > 0 ? (
          segments.map((seg, i) => (
            <line
              key={i}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ))
        ) : (
          userPath && (
            <path
              d={userPath}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        )}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "hsl(var(--primary))" }} />
          Your voice
        </span>
        {referenceData && referenceData.length > 0 && (
          <>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded bg-muted-foreground opacity-40" />
              Target melody
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: "hsl(160, 50%, 42%)" }} />
              On pitch
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: "hsl(0, 72%, 48%)" }} />
              Off pitch
            </span>
          </>
        )}
      </div>
    </div>
  );
}
