import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mic, Plus, Trash2, Play, Pause, Youtube, Upload, Scissors, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Song, Line } from "@shared/schema";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

// Line timestamp editor component
function LineTimestampEditor({
  line,
  songAudioUrl,
  onSaved,
}: {
  line: Line;
  songAudioUrl: string;
  onSaved: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [startMark, setStartMark] = useState<number | null>(line.startTime ?? null);
  const [endMark, setEndMark] = useState<number | null>(line.endTime ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  };

  const playPreview = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || startMark === null || endMark === null) return;
    audio.currentTime = startMark;
    audio.play();
    setIsPlaying(true);
    // Stop at end mark
    const check = setInterval(() => {
      if (audio.currentTime >= endMark) {
        audio.pause();
        setIsPlaying(false);
        clearInterval(check);
      }
    }, 50);
  }, [startMark, endMark]);

  const save = async () => {
    if (startMark === null || endMark === null) return;
    setIsSaving(true);
    try {
      // Step 1: Save timestamps to line
      await apiRequest("PATCH", `/api/lines/${line.id}`, {
        startTime: startMark,
        endTime: endMark,
      });
    } catch (err) {
      console.error("Timestamp save error:", err);
      toast({ title: "Save failed", description: "Could not save the start/end times. Try again.", variant: "destructive" });
      setIsSaving(false);
      return;
    }

    // Step 2: Analyze pitch (optional — timestamps are already saved)
    try {
      const analyzeRes = await apiRequest("POST", "/api/analyze-audio-pitch", {
        audioUrl: songAudioUrl,
        startTime: startMark,
        endTime: endMark,
      });
      const { pitchData } = await analyzeRes.json();

      // Save target pitch data to line
      await apiRequest("PATCH", `/api/lines/${line.id}`, {
        targetPitchData: JSON.stringify(pitchData),
      });

      toast({ title: "Timestamps saved", description: "The target notes for this line have been analyzed." });
    } catch (err) {
      console.error("Pitch analysis error:", err);
      // Timestamps were saved even if pitch analysis failed
      toast({ title: "Timestamps saved", description: "Couldn't analyze the target pitch right now, but your start/end points are saved." });
    }
    onSaved();
    setIsSaving(false);
  };

  const pctStart = startMark !== null && duration ? (startMark / duration) * 100 : 0;
  const pctEnd = endMark !== null && duration ? (endMark / duration) * 100 : 100;
  const pctCurrent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-3">
      <audio ref={audioRef} src={songAudioUrl} preload="metadata" />

      {/* Waveform-style scrubber */}
      <div
        ref={progressRef}
        className="relative h-12 bg-muted rounded-lg cursor-pointer select-none overflow-hidden"
        onClick={seekTo}
        data-testid="scrubber-bar"
      >
        {/* Selected region highlight */}
        {startMark !== null && endMark !== null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/15"
            style={{ left: `${pctStart}%`, width: `${pctEnd - pctStart}%` }}
          />
        )}

        {/* Start marker */}
        {startMark !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-green-500"
            style={{ left: `${pctStart}%` }}
          >
            <div className="absolute -top-0 -left-2 text-[9px] font-medium text-green-600 dark:text-green-400 bg-background px-0.5 rounded">
              IN
            </div>
          </div>
        )}

        {/* End marker */}
        {endMark !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500"
            style={{ left: `${pctEnd}%` }}
          >
            <div className="absolute -top-0 -left-2.5 text-[9px] font-medium text-red-600 dark:text-red-400 bg-background px-0.5 rounded">
              OUT
            </div>
          </div>
        )}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground"
          style={{ left: `${pctCurrent}%` }}
        />

        {/* Time display */}
        <div className="absolute bottom-1 left-2 text-[10px] text-muted-foreground tabular-nums">
          {formatTime(currentTime)}
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] text-muted-foreground tabular-nums">
          {formatTime(duration)}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={togglePlay} className="gap-1" data-testid="button-play-pause">
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setStartMark(currentTime)}
          className="gap-1 text-green-600 dark:text-green-400 border-green-300 dark:border-green-700"
          data-testid="button-set-start"
        >
          <Scissors className="w-3 h-3" />
          Set start
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setEndMark(currentTime)}
          className="gap-1 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700"
          disabled={startMark === null}
          data-testid="button-set-end"
        >
          <Scissors className="w-3 h-3" />
          Set end
        </Button>

        {startMark !== null && endMark !== null && (
          <Button size="sm" variant="ghost" onClick={playPreview} className="gap-1" data-testid="button-preview-clip">
            <Play className="w-3 h-3" /> Preview clip
          </Button>
        )}

        <div className="ml-auto">
          <Button
            size="sm"
            onClick={save}
            disabled={startMark === null || endMark === null || isSaving || endMark <= startMark}
            className="gap-1"
            data-testid="button-save-timestamps"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {isSaving ? "Analyzing..." : "Save"}
          </Button>
        </div>
      </div>

      {startMark !== null && endMark !== null && (
        <p className="text-xs text-muted-foreground">
          Selected: {formatTime(startMark)} — {formatTime(endMark)} ({(endMark - startMark).toFixed(1)}s)
        </p>
      )}
    </div>
  );
}

export default function SongDetail() {
  const params = useParams<{ id: string }>();
  const songId = Number(params.id);
  const [newLine, setNewLine] = useState("");
  const [editingLineId, setEditingLineId] = useState<number | null>(null);

  const { data: song, isLoading: songLoading } = useQuery<Song>({
    queryKey: ["/api/songs", songId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/songs/${songId}`);
      return res.json();
    },
  });

  const { data: lines, isLoading: linesLoading } = useQuery<Line[]>({
    queryKey: ["/api/songs", songId, "lines"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/songs/${songId}/lines`);
      return res.json();
    },
  });

  const addLine = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/songs/${songId}/lines`, {
        text: newLine.trim(),
        orderIndex: (lines?.length || 0),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songs", songId, "lines"] });
      setNewLine("");
    },
  });

  const deleteLine = useMutation({
    mutationFn: async (lineId: number) => {
      await apiRequest("DELETE", `/api/lines/${lineId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/songs", songId, "lines"] });
    },
  });

  if (songLoading || linesLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2 mt-6">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Song not found.</p>
        <Link href="/songs">
          <Button variant="ghost" className="mt-2 gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to songs
          </Button>
        </Link>
      </div>
    );
  }

  const hasAudio = !!song.sourceUrl;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/songs">
          <Button size="icon" variant="ghost" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-song-title">{song.title}</h1>
          {song.artist && <p className="text-sm text-muted-foreground">{song.artist}</p>}
          {song.sourceType !== "recorded" && (
            <Badge variant="secondary" className="text-xs mt-1 gap-1">
              {song.sourceType === "youtube" ? <Youtube className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
              {song.sourceType === "youtube" ? "YouTube" : "Uploaded"}
            </Badge>
          )}
        </div>
      </div>

      {/* Audio player if song has audio */}
      {hasAudio && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Song audio</p>
            <audio controls className="w-full h-10" src={song.sourceUrl!} data-testid="audio-player">
              Your browser does not support audio playback.
            </audio>
          </CardContent>
        </Card>
      )}

      {hasAudio && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-1">Set up your practice lines</p>
            <p className="text-xs text-muted-foreground">
              Tap the scissors icon on any line to mark where it starts and ends in the song. 
              This lets the app play just that section and show you the target notes while you sing.
            </p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Lines to practice — tap any line to start
        </h2>
        <div className="space-y-2">
          {lines && lines.length > 0 ? (
            lines.map((line) => (
              <Card key={line.id} data-testid={`card-line-${line.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/practice/${line.id}`} className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">"{line.text}"</p>
                      {line.startTime !== null && line.endTime !== null ? (
                        <p className="text-[10px] text-primary mt-0.5 tabular-nums">
                          {formatTime(line.startTime!)} — {formatTime(line.endTime!)}
                        </p>
                      ) : hasAudio ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">No timestamps set yet</p>
                      ) : null}
                    </Link>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {hasAudio && (
                        <Button
                          size="icon"
                          variant={editingLineId === line.id ? "default" : "ghost"}
                          onClick={() => setEditingLineId(editingLineId === line.id ? null : line.id)}
                          data-testid={`button-timestamp-line-${line.id}`}
                          title="Set timestamps"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Link href={`/practice/${line.id}`}>
                        <Button size="icon" variant="ghost" data-testid={`button-practice-line-${line.id}`}>
                          <Mic className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteLine.mutate(line.id)}
                        data-testid={`button-delete-line-${line.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  {/* Timestamp editor */}
                  {editingLineId === line.id && hasAudio && (
                    <LineTimestampEditor
                      line={line}
                      songAudioUrl={song.sourceUrl!}
                      onSaved={() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/songs", songId, "lines"] });
                        setEditingLineId(null);
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No lines added yet. Add a line below to start practicing.
            </p>
          )}
        </div>
      </div>

      {/* Add new line */}
      <div className="flex gap-2">
        <Input
          placeholder="Add another line..."
          value={newLine}
          onChange={(e) => setNewLine(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newLine.trim() && addLine.mutate()}
          data-testid="input-new-line"
        />
        <Button
          onClick={() => addLine.mutate()}
          disabled={!newLine.trim() || addLine.isPending}
          data-testid="button-add-line"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
