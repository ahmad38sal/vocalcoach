import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mic, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import type { Song, Line } from "@shared/schema";

export default function SongDetail() {
  const params = useParams<{ id: string }>();
  const songId = Number(params.id);
  const [newLine, setNewLine] = useState("");

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
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Lines to practice — tap any line to start
        </h2>
        <div className="space-y-2">
          {lines && lines.length > 0 ? (
            lines.map((line) => (
              <Card key={line.id} className="hover-elevate" data-testid={`card-line-${line.id}`}>
                <CardContent className="flex items-center gap-3 p-4">
                  <Link href={`/practice/${line.id}`} className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">"{line.text}"</p>
                  </Link>
                  <div className="flex items-center gap-1 flex-shrink-0">
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
