import { useMemo } from "react";

interface LoudnessPoint {
  time: number;
  db: number;
}

interface LoudnessChartProps {
  data: LoudnessPoint[];
  width?: number;
  height?: number;
}

export function LoudnessChart({ data, width = 600, height = 100 }: LoudnessChartProps) {
  const { path, areaPath, timeMax, dbMin, dbMax } = useMemo(() => {
    if (data.length === 0) return { path: "", areaPath: "", timeMax: 1, dbMin: -60, dbMax: 0 };

    const dbValues = data.map(d => d.db);
    const dbMin = Math.min(...dbValues);
    const dbMax = Math.max(...dbValues);
    const timeMax = data[data.length - 1].time || 1;
    const range = dbMax - dbMin || 1;

    const toX = (t: number) => (t / timeMax) * (width - 40) + 20;
    const toY = (db: number) => height - 16 - ((db - dbMin) / range) * (height - 32);

    const path = data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(d.time).toFixed(1)} ${toY(d.db).toFixed(1)}`)
      .join(" ");

    const areaPath = path + ` L ${toX(data[data.length - 1].time).toFixed(1)} ${(height - 16).toFixed(1)} L ${toX(data[0].time).toFixed(1)} ${(height - 16).toFixed(1)} Z`;

    return { path, areaPath, timeMax, dbMin, dbMax };
  }, [data, width, height]);

  if (data.length === 0) {
    return (
      <div className="w-full h-24 rounded-md bg-card border border-border flex items-center justify-center text-sm text-muted-foreground">
        No loudness data yet
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="loudness-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-md bg-card border border-border">
        {/* Area fill */}
        <path
          d={areaPath}
          fill="hsl(var(--primary) / 0.12)"
        />
        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Labels */}
        <text x={4} y={20} fontSize="9" fill="hsl(var(--muted-foreground))">Loud</text>
        <text x={4} y={height - 6} fontSize="9" fill="hsl(var(--muted-foreground))">Quiet</text>
      </svg>
      <p className="text-xs text-muted-foreground mt-1">
        Energy / loudness over time — a steady curve means consistent volume
      </p>
    </div>
  );
}
