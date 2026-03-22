import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mic, ArrowRight, Music } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Song, Line } from "@shared/schema";

export default function Practice() {
  const { data: songs, isLoading } = useQuery<Song[]>({
    queryKey: ["/api/songs"],
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  const activeSongs = songs?.filter(s => s.isActive) || [];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold" data-testid="text-page-title">Practice</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Pick a line to work on</p>
      </div>

      {activeSongs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center text-center py-12 px-6">
            <Music className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-medium text-sm mb-1">No songs to practice</p>
            <p className="text-xs text-muted-foreground mb-4">Add a song first, then come back here to practice.</p>
            <Link href="/songs">
              <Button className="gap-1.5">
                <Music className="w-4 h-4" /> Go to My Songs
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        activeSongs.map((song) => (
          <SongPracticeSection key={song.id} song={song} />
        ))
      )}
    </div>
  );
}

function SongPracticeSection({ song }: { song: Song }) {
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
      <h2 className="text-sm font-medium text-muted-foreground mb-2">{song.title}</h2>
      <div className="space-y-1.5">
        {lines.map((line) => (
          <Link key={line.id} href={`/practice/${line.id}`}>
            <Card className="cursor-pointer hover-elevate" data-testid={`card-practice-line-${line.id}`}>
              <CardContent className="flex items-center gap-3 p-3.5">
                <Mic className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm flex-1 min-w-0 truncate">"{line.text}"</p>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
