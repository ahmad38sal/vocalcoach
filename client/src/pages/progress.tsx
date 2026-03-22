import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, TrendingUp, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Song, Line } from "@shared/schema";

export default function Progress() {
  const { data: songs, isLoading } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const activeSongs = songs?.filter(s => s.isActive) || [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Progress</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your improvement over time</p>
      </div>

      {activeSongs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center text-center py-12 px-6">
            <TrendingUp className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-medium text-sm mb-1">No progress data yet</p>
            <p className="text-xs text-muted-foreground mb-4">Start practicing to see your improvement tracked here.</p>
            <Link href="/songs">
              <Button className="gap-1.5">
                <Music className="w-4 h-4" /> Add a song
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        activeSongs.map((song) => (
          <SongProgress key={song.id} song={song} />
        ))
      )}
    </div>
  );
}

function SongProgress({ song }: { song: Song }) {
  const { data: lines } = useQuery<Line[]>({
    queryKey: ["/api/songs", song.id, "lines"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/songs/${song.id}/lines`);
      return res.json();
    },
  });

  if (!lines || lines.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3">{song.title}</h2>
      <div className="space-y-2">
        {lines.map((line) => (
          <LineProgress key={line.id} line={line} />
        ))}
      </div>
    </div>
  );
}

function LineProgress({ line }: { line: Line }) {
  const { data: progress, isLoading } = useQuery<{
    totalRecordings: number;
    pitchTrend: Array<{ index: number; value: number }>;
    energyTrend: Array<{ index: number; value: number }>;
    scoreTrend: Array<{ index: number; value: number }>;
  }>({
    queryKey: ["/api/lines", line.id, "progress"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/lines/${line.id}/progress`);
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const total = progress?.totalRecordings || 0;
  const scoreTrend = progress?.scoreTrend || [];
  const latestScore = scoreTrend.length > 0 ? scoreTrend[scoreTrend.length - 1].value : null;
  const firstScore = scoreTrend.length > 1 ? scoreTrend[0].value : null;
  const improvement = latestScore !== null && firstScore !== null ? Math.round(latestScore - firstScore) : null;

  return (
    <Card data-testid={`card-progress-line-${line.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate mb-2">"{line.text}"</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{total} recording{total !== 1 ? "s" : ""}</span>
              {latestScore !== null && (
                <span>Latest score: <span className="font-medium text-foreground">{Math.round(latestScore)}</span></span>
              )}
              {improvement !== null && improvement !== 0 && (
                <span className={improvement > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}>
                  {improvement > 0 ? "+" : ""}{improvement} since start
                </span>
              )}
            </div>
            {/* Mini sparkline */}
            {scoreTrend.length > 1 && (
              <div className="mt-2">
                <MiniSparkline data={scoreTrend.map(s => s.value)} />
              </div>
            )}
          </div>
          <Link href={`/practice/${line.id}`}>
            <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" data-testid={`button-practice-${line.id}`}>
              Practice <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const width = 120;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="text-primary">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
